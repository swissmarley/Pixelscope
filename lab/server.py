"""Pixelscope optional Lab. No dependency installation or downloads at import time."""
import base64
import io
import json
import math
import os
import queue
import threading
import time
import uuid
from typing import Optional
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

app = FastAPI(title="Pixelscope Lab")
app.add_middleware(CORSMiddleware, allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"], allow_methods=["GET", "POST"], allow_headers=["Content-Type"])
lock = threading.Lock()
pipelines = {}

class Config(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    negative: str = ""
    seed: int = Field(default=42819, ge=0, le=2**32-1)
    steps: int = Field(default=4, ge=1, le=50)
    guidance: float = Field(default=0, ge=0, le=15)
    strength: float = Field(default=.55, gt=0, le=1)
    reference: Optional[str] = None
    sampler: str = "Euler"
    family: str = "diffusion"

@app.get("/health")
def health():
    return {"status": "ready", "model": os.getenv("PIXELSCOPE_LAB_MODEL", "stabilityai/sd-turbo"), "downloads_allowed": os.getenv("PIXELSCOPE_ALLOW_MODEL_DOWNLOAD") == "1"}

def image_data(image):
    buff = io.BytesIO()
    image.save(buff, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buff.getvalue()).decode()

def generate_worker(config, output, cancelled):
    started = time.monotonic()
    def emit(stage, kind, duration=400, **data):
        if cancelled.is_set():
            raise RuntimeError("Run cancelled")
        output.put({"id": str(uuid.uuid4()), "stage": stage, "type": kind, "duration": duration, "elapsed": round((time.monotonic()-started)*1000), "provenance": "observed", **data})
    try:
        if config.family != "diffusion":
            raise ValueError("Lab runs diffusion only. Use the illustrative autoregressive simulator in Demo.")
        import numpy as np
        import torch
        from PIL import Image
        from diffusers import AutoPipelineForText2Image, AutoPipelineForImage2Image, EulerDiscreteScheduler, DDIMScheduler
        from diffusers.models.attention_processor import AttnProcessor
        model = os.getenv("PIXELSCOPE_LAB_MODEL", "stabilityai/sd-turbo")
        turbo = "turbo" in model.lower()
        device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
        dtype = torch.float16 if device == "cuda" else torch.float32
        # Downloads require an explicit environment opt-in. Default is local cache only.
        if model not in pipelines:
            pipelines[model] = AutoPipelineForText2Image.from_pretrained(model, torch_dtype=dtype, local_files_only=os.getenv("PIXELSCOPE_ALLOW_MODEL_DOWNLOAD") != "1").to(device)
        base = pipelines[model]
        if not hasattr(base, "tokenizer") or not hasattr(base, "unet"):
            raise ValueError("This backend instruments classic Stable Diffusion pipelines (SD-Turbo / SD 1.x).")
        pipe = AutoPipelineForImage2Image.from_pipe(base) if config.reference else base
        pipe.scheduler = (DDIMScheduler if config.sampler == "DDIM" else EulerDiscreteScheduler).from_config(pipe.scheduler.config)
        steps = min(config.steps, 4) if turbo else config.steps
        guidance = 0.0 if turbo else config.guidance
        generator = torch.Generator(device="cpu" if device == "mps" else device).manual_seed(config.seed)
        emit("request", "request_built", request={"prompt": config.prompt, "negative_prompt": config.negative, "seed": config.seed, "steps": steps, "guidance_scale": guidance, "size": "512x512", "reference_images": 1 if config.reference else 0, "note": "Turbo uses up to four steps with CFG disabled." if turbo else "Classic Stable Diffusion"})
        emit("request", "sent", model=model)
        unpadded = pipe.tokenizer(config.prompt, truncation=False).input_ids
        encoded = pipe.tokenizer(config.prompt, padding="max_length", max_length=pipe.tokenizer.model_max_length, truncation=True, return_tensors="pt")
        ids = encoded.input_ids[0].tolist()
        token_text = [pipe.tokenizer.decode([token]).strip() or "<pad>" for token in ids]
        tokens = [{"text": text, "id": token} for text, token in zip(token_text, ids)]
        emit("tokens", "prompt_tokenized", tokens=tokens, limit=pipe.tokenizer.model_max_length, total=len(unpadded))
        with torch.no_grad():
            embedded = pipe.text_encoder(encoded.input_ids.to(device))[0][0].float().cpu()
            centered = embedded-embedded.mean(dim=0)
            _, _, vh = torch.linalg.svd(centered, full_matrices=False)
            projected = (centered @ vh[:2].T).numpy()
            projected = (projected-projected.min(axis=0))/(np.ptp(projected, axis=0)+1e-8)
        emit("embeddings", "text_embedded", vectors=embedded[:, :32].tolist(), projection=projected.tolist())
        capture = {"attention": {}, "prediction": None}
        def preview(latent):
            with torch.no_grad():
                decoded = pipe.vae.decode(latent.to(dtype)/pipe.vae.config.scaling_factor, return_dict=False)[0]
            return image_data(pipe.image_processor.postprocess(decoded, output_type="pil")[0])
        def tensor_preview(tensor):
            values = tensor.detach().float().mean(dim=1, keepdim=True)
            values = torch.nn.functional.interpolate(values, (128,128), mode="bilinear", align_corners=False)[0,0].cpu().numpy()
            values = ((values-values.min())/(np.ptp(values)+1e-8)*255).astype(np.uint8)
            return image_data(Image.fromarray(values).convert("RGB"))
        original_prepare = pipe.prepare_latents
        def prepare(*args, **kwargs):
            latent = original_prepare(*args, **kwargs)
            emit("noise", "noise_initialized", seed=config.seed, shape=[latent.shape[2], latent.shape[3], latent.shape[1]], preview=tensor_preview(latent))
            return latent
        pipe.prepare_latents = prepare
        def capture_prediction(_module, _inputs, result):
            value = result.sample if hasattr(result, "sample") else result[0]
            capture["prediction"] = value.detach()
        hook = pipe.unet.register_forward_hook(capture_prediction)
        originals = dict(pipe.unet.attn_processors)
        score_originals = []
        # Instrument only mid-block cross-attention to avoid a huge memory cost.
        for name, module in pipe.unet.named_modules():
            if "mid_block" in name and name.endswith("attn2"):
                score = module.get_attention_scores
                score_originals.append((module, score))
                def measured(query, key, mask=None, saved=score):
                    probabilities = saved(query, key, mask)
                    spatial = int(math.sqrt(probabilities.shape[1]))
                    if spatial*spatial == probabilities.shape[1]:
                        # conditional half when CFG doubles the batch
                        weights = probabilities[probabilities.shape[0]//2:] if guidance > 1 else probabilities
                        weights = weights.mean(0).transpose(0,1).reshape(-1,1,spatial,spatial)
                        weights = torch.nn.functional.adaptive_avg_pool2d(weights, (8,8)).flatten(1)
                        maps = weights.detach().float().cpu().numpy()
                        capture["attention"] = {token_text[i]: ((row-row.min())/(np.ptp(row)+1e-8)).tolist() for i,row in enumerate(maps[:len(token_text)]) if token_text[i] != "<pad>"}
                    return probabilities
                module.get_attention_scores = measured
                module.set_processor(AttnProcessor())
        reference = None
        if config.reference:
            raw = config.reference.split(",",1)[1]
            reference = Image.open(io.BytesIO(base64.b64decode(raw))).convert("RGB").resize((512,512))
            with torch.no_grad():
                pixels = pipe.image_processor.preprocess(reference).to(device=device, dtype=dtype)
                latent = pipe.vae.encode(pixels).latent_dist.mode()*pipe.vae.config.scaling_factor
            emit("edit", "reference_encoded", image=image_data(reference), strength=config.strength, preview=tensor_preview(latent))
        def callback(pipeline, step, timestep, callback_kwargs):
            latent = callback_kwargs["latents"]
            sigma = float(pipeline.scheduler.sigmas[step]) if hasattr(pipeline.scheduler,"sigmas") else float(timestep)/float(pipeline.scheduler.config.num_train_timesteps)
            predictions = capture["prediction"]
            guide = {"scale": guidance}
            if predictions is not None and guidance > 1 and predictions.shape[0] == 2:
                uncond, cond = predictions.chunk(2)
                guide.update(unconditional=tensor_preview(uncond), conditional=tensor_preview(cond), difference=tensor_preview(cond-uncond))
            data = dict(step=step+1,total=len(pipeline.scheduler.timesteps),timestep=int(timestep),sigma=sigma,preview=preview(latent),attention=capture["attention"],guidance=guide,noisePrediction=tensor_preview(predictions[-1:]) if predictions is not None else None)
            emit("denoise", "denoise_step", duration=350, **data)
            if step == len(pipeline.scheduler.timesteps)//2:
                if capture["attention"]:
                    emit("attention", "denoise_step", **data)
                if guidance > 1:
                    emit("guidance", "denoise_step", **data)
            return callback_kwargs
        try:
            kwargs = dict(prompt=config.prompt, negative_prompt=config.negative or None, num_inference_steps=steps, guidance_scale=guidance, generator=generator, callback_on_step_end=callback, callback_on_step_end_tensor_inputs=["latents"])
            if reference is not None:
                kwargs.update(image=reference, strength=config.strength)
                # At least one effective denoising step is necessary for img2img.
                kwargs["num_inference_steps"] = max(steps, math.ceil(1/config.strength))
            else:
                kwargs.update(height=512,width=512)
            result = pipe(**kwargs)
            final = image_data(result.images[0])
            emit("decode", "vae_decoded", image=final)
            emit("delivery", "final_image", image=final)
            emit("delivery", "done", metadata={"seed":config.seed,"steps":len(pipe.scheduler.timesteps),"guidance":guidance,"model":model,"size":"512 × 512","seconds":time.monotonic()-started})
        finally:
            hook.remove()
            pipe.prepare_latents = original_prepare
            pipe.unet.set_attn_processor(originals)
            for module, score in score_originals:
                module.get_attention_scores = score
    except Exception as exc:
        if not cancelled.is_set():
            output.put({"error": str(exc)})
    finally:
        output.put(None)
        lock.release()

@app.post("/generate")
async def generate(config: Config, request: Request):
    if not lock.acquire(blocking=False):
        return StreamingResponse(iter(['data: {"error":"Lab is busy. Wait for the current run to finish."}\n\n']), media_type="text/event-stream")
    output = queue.Queue()
    cancelled = threading.Event()
    worker = threading.Thread(target=generate_worker, args=(config,output,cancelled), daemon=True)
    worker.start()
    def stream():
        try:
            while True:
                try:
                    value = output.get(timeout=1)
                except queue.Empty:
                    yield ": heartbeat\n\n"
                    continue
                if value is None:
                    break
                yield "data: " + json.dumps(value) + "\n\n"
        finally:
            cancelled.set()
    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"})
