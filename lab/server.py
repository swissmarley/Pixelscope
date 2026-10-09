"""Pixelscope optional Lab. No dependency installation or downloads at import time."""
import asyncio
import base64
import binascii
import inspect
import io
import json
import math
import os
import queue
import re
import threading
import time
import uuid
from typing import Literal, Optional
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

DEFAULT_ORIGINS = "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173,https://swissmarley.github.io"
ORIGINS = [o.strip() for o in os.getenv("PIXELSCOPE_ORIGINS", DEFAULT_ORIGINS).split(",") if o.strip()]
MAX_BODY_BYTES = 16 * 1024 * 1024
MAX_REFERENCE_BYTES = 10 * 1024 * 1024
MAX_REFERENCE_PIXELS = 40_000_000
REFERENCE_FORMATS = {"PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp"}

app = FastAPI(title="Pixelscope Lab")
cors = dict(allow_origins=ORIGINS, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])
if "allow_private_network" in inspect.signature(CORSMiddleware.__init__).parameters:
    cors["allow_private_network"] = True  # Starlette 0.51+; older versions get the header from guard()
app.add_middleware(CORSMiddleware, **cors)

def refusal(status, message, origin):
    """An error response that the page can read: these are sent outside CORSMiddleware."""
    headers = {"Vary": "Origin"}
    if origin in ORIGINS:
        headers["Access-Control-Allow-Origin"] = origin
    return JSONResponse({"error": message}, status_code=status, headers=headers)

@app.middleware("http")
async def guard(request: Request, call_next):
    # Only answer requests addressed to this machine, which blocks DNS rebinding.
    host = (request.headers.get("host") or "").rsplit(":", 1)[0].strip("[]").lower()
    if host not in {"127.0.0.1", "localhost", "::1"}:
        return refusal(403, "Host is not allowed.", request.headers.get("origin"))
    length = request.headers.get("content-length")
    if length and (not length.isdigit() or int(length) > MAX_BODY_BYTES):
        return refusal(413, "Request exceeds 16 MB.", request.headers.get("origin"))
    response = await call_next(request)
    # Chrome asks before a public HTTPS page (such as GitHub Pages) reaches localhost.
    if request.method == "OPTIONS" and request.headers.get("access-control-request-private-network") == "true" and request.headers.get("origin") in ORIGINS:
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response

class BodyLimit:
    """Count body bytes as they arrive, so chunked uploads without a
    Content-Length are capped too. Past the limit it answers 413 itself,
    tells the app the client went away, and drops whatever the app sends."""
    def __init__(self, app, limit):
        self.app = app
        self.limit = limit
    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        received = 0
        started = refused = False
        async def limited_receive():
            nonlocal received, refused
            if refused:
                return {"type": "http.disconnect"}
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.limit:
                    refused = True
                    if not started:
                        origin = dict(scope["headers"]).get(b"origin", b"").decode("latin-1")
                        await refusal(413, "Request exceeds 16 MB.", origin)(scope, receive, send)
                    return {"type": "http.disconnect"}
            return message
        async def guarded_send(message):
            nonlocal started
            if refused:
                return
            if message["type"] == "http.response.start":
                started = True
            await send(message)
        await self.app(scope, limited_receive, guarded_send)

app.add_middleware(BodyLimit, limit=MAX_BODY_BYTES)

@app.exception_handler(HTTPException)
async def http_error(_request: Request, exc: HTTPException):
    return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code)

@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, exc: RequestValidationError):
    # Name the field and the problem only; never echo the submitted value back.
    fields = [{"field": ".".join(str(part) for part in e.get("loc", ())[1:]) or "body", "message": e.get("msg", "Invalid value")} for e in exc.errors()]
    summary = "; ".join(f"{f['field']}: {f['message']}" for f in fields)
    return JSONResponse({"error": f"The Lab rejected these settings ({summary}).", "fields": fields}, status_code=422)

lock = threading.Lock()
pipelines = {}
current = {"cancelled": None}

class Config(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    negative: str = Field(default="", max_length=4000)
    seed: int = Field(default=42819, ge=0, le=2**32-1)
    steps: int = Field(default=4, ge=1, le=50)
    guidance: float = Field(default=0, ge=0, le=15)
    strength: float = Field(default=.55, gt=0, le=1)
    # A 10 MB image is about 13.4 MB as base64.
    reference: Optional[str] = Field(default=None, max_length=14 * 1024 * 1024)
    sampler: Literal["Euler", "DDIM"] = "Euler"
    family: str = "diffusion"

def model_name():
    return os.getenv("PIXELSCOPE_LAB_MODEL", "stabilityai/sd-turbo")

def public_model_name(model):
    """Show a local model folder by its name only, never its full path."""
    if os.path.isabs(model) or os.path.isdir(model):
        return os.path.basename(os.path.normpath(model)) + " (local folder)"
    return model

def model_available(model):
    if os.path.isdir(model):
        return os.path.isfile(os.path.join(model, "model_index.json"))
    try:
        from huggingface_hub import try_to_load_from_cache
        return isinstance(try_to_load_from_cache(model, "model_index.json"), str)
    except Exception:
        return None

@app.get("/health")
def health():
    model = model_name()
    downloads = os.getenv("PIXELSCOPE_ALLOW_MODEL_DOWNLOAD") == "1"
    cached = model_available(model)
    return {"status": "model_missing" if cached is False and not downloads else "ready", "model": public_model_name(model), "model_cached": cached, "downloads_allowed": downloads}

def decode_reference(value):
    """Check and decode a reference data URL before the run takes the lock.

    Format, byte size and pixel count are checked from the header first, so
    oversized images are refused before any pixels are decoded."""
    from PIL import Image, UnidentifiedImageError
    Image.MAX_IMAGE_PIXELS = MAX_REFERENCE_PIXELS
    match = re.fullmatch(r"data:image/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)", value)
    if not match:
        raise ValueError("The reference must be a PNG, JPEG or WebP image.")
    try:
        raw = base64.b64decode(match.group(1), validate=True)
    except (binascii.Error, ValueError):
        raise ValueError("The reference image data is damaged.") from None
    if len(raw) > MAX_REFERENCE_BYTES:
        raise ValueError("The reference image exceeds 10 MB.")
    try:
        image = Image.open(io.BytesIO(raw), formats=list(REFERENCE_FORMATS))
    except Image.DecompressionBombError:
        raise ValueError("The reference is too large. Use one under 40 megapixels.") from None
    except (UnidentifiedImageError, OSError):
        raise ValueError("The reference is not a readable PNG, JPEG or WebP image.") from None
    if image.width * image.height > MAX_REFERENCE_PIXELS:
        raise ValueError(f"The reference is {image.width} × {image.height}. Use one under 40 megapixels.")
    try:
        # draft() lets JPEG decode at reduced scale, so large photos stay cheap.
        image.draft("RGB", (1024, 1024))
        image.load()
    except Exception:
        # Truncated or corrupt data fails here, as a 400, before any model work.
        raise ValueError("The reference image is damaged or incomplete.") from None
    return image

def prepare_reference(image):
    image.thumbnail((1024, 1024))
    return image.convert("RGB").resize((512, 512))

def image_data(image, preview=False):
    buff = io.BytesIO()
    if preview:
        # Step previews are compressed: a PNG per step makes the stream very large.
        image.save(buff, format="WEBP", quality=80)
        return "data:image/webp;base64," + base64.b64encode(buff.getvalue()).decode()
    image.save(buff, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buff.getvalue()).decode()

def patch(obj, name, value, undo):
    """Set obj.name and record how to restore it, including removing an instance override."""
    had = name in vars(obj)
    old = vars(obj).get(name)
    setattr(obj, name, value)
    undo.append(lambda: setattr(obj, name, old) if had else vars(obj).pop(name, None))

def generate_worker(config, reference, output, cancelled):
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
        model = model_name()
        turbo = "turbo" in model.lower()
        device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
        dtype = torch.float16 if device == "cuda" else torch.float32
        # Downloads require an explicit environment opt-in. Default is local cache only.
        if model not in pipelines:
            downloads = os.getenv("PIXELSCOPE_ALLOW_MODEL_DOWNLOAD") == "1"
            try:
                pipelines[model] = AutoPipelineForText2Image.from_pretrained(model, torch_dtype=dtype, local_files_only=not downloads).to(device)
            except OSError:
                if downloads:
                    raise ValueError(f"Could not load {public_model_name(model)}. Check the model name and your network connection.") from None
                raise ValueError(f"{public_model_name(model)} is not in the local model cache. Download it first, or set PIXELSCOPE_ALLOW_MODEL_DOWNLOAD=1 to allow a download.") from None
        base = pipelines[model]
        if not hasattr(base, "tokenizer") or not hasattr(base, "unet"):
            raise ValueError("This backend instruments classic Stable Diffusion pipelines (SD-Turbo / SD 1.x).")
        pipe = AutoPipelineForImage2Image.from_pipe(base) if config.reference else base
        pipe.scheduler = (DDIMScheduler if config.sampler == "DDIM" else EulerDiscreteScheduler).from_config(pipe.scheduler.config)
        steps = min(config.steps, 4) if turbo else config.steps
        guidance = 0.0 if turbo else config.guidance
        generator = torch.Generator(device="cpu" if device == "mps" else device).manual_seed(config.seed)
        emit("request", "request_built", request={"prompt": config.prompt, "negative_prompt": config.negative, "seed": config.seed, "steps": steps, "guidance_scale": guidance, "size": "512x512", "reference_images": 1 if config.reference else 0, "note": "Turbo uses up to four steps with CFG disabled." if turbo else "Classic Stable Diffusion"})
        emit("request", "sent", model=public_model_name(model))
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
            return image_data(pipe.image_processor.postprocess(decoded, output_type="pil")[0], preview=True)
        def tensor_preview(tensor):
            values = tensor.detach().float().mean(dim=1, keepdim=True)
            values = torch.nn.functional.interpolate(values, (128,128), mode="bilinear", align_corners=False)[0,0].cpu().numpy()
            values = ((values-values.min())/(np.ptp(values)+1e-8)*255).astype(np.uint8)
            return image_data(Image.fromarray(values).convert("RGB"))
        def capture_prediction(_module, _inputs, result):
            value = result.sample if hasattr(result, "sample") else result[0]
            capture["prediction"] = value.detach()
        def stop_if_cancelled(_module, _inputs):
            # Checked before every UNet pass, so Cancel frees the Lab within one pass.
            if cancelled.is_set():
                raise RuntimeError("Run cancelled")
        # The UNet and VAE are shared by every run, so each change below is
        # recorded in `undo` as it is made and reverted in the finally block,
        # whatever fails or is cancelled in between.
        undo = []
        try:
            original_prepare = pipe.prepare_latents
            def prepare(*args, **kwargs):
                latent = original_prepare(*args, **kwargs)
                emit("noise", "noise_initialized", seed=config.seed, shape=[latent.shape[2], latent.shape[3], latent.shape[1]], preview=tensor_preview(latent))
                return latent
            patch(pipe, "prepare_latents", prepare, undo)
            undo.append(pipe.unet.register_forward_hook(capture_prediction).remove)
            undo.append(pipe.unet.register_forward_pre_hook(stop_if_cancelled).remove)
            originals = dict(pipe.unet.attn_processors)
            undo.append(lambda: pipe.unet.set_attn_processor(originals))
            # Instrument only mid-block cross-attention to avoid a huge memory cost.
            for name, module in pipe.unet.named_modules():
                if "mid_block" in name and name.endswith("attn2"):
                    def measured(query, key, mask=None, saved=module.get_attention_scores):
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
                    patch(module, "get_attention_scores", measured, undo)
                    module.set_processor(AttnProcessor())
            if reference is not None:
                reference = prepare_reference(reference)
                with torch.no_grad():
                    pixels = pipe.image_processor.preprocess(reference).to(device=device, dtype=dtype)
                    latent = pipe.vae.encode(pixels).latent_dist.mode()*pipe.vae.config.scaling_factor
                emit("edit", "reference_encoded", image=image_data(reference), strength=config.strength, preview=tensor_preview(latent))
            def callback(pipeline, step, timestep, callback_kwargs):
                if cancelled.is_set():
                    raise RuntimeError("Run cancelled")
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
            emit("delivery", "done", metadata={"seed":config.seed,"steps":len(pipe.scheduler.timesteps),"guidance":guidance,"model":public_model_name(model),"size":"512 × 512","seconds":time.monotonic()-started})
        finally:
            for revert in reversed(undo):
                revert()
    except ValueError as exc:
        if not cancelled.is_set():
            output.put({"error": str(exc)})
    except Exception as exc:
        if not cancelled.is_set():
            output.put({"error": f"The Lab run failed: {type(exc).__name__}. See the Lab server log for details."})
            import traceback
            traceback.print_exc()
    finally:
        output.put(None)
        lock.release()

def acquire_lock():
    # A just-cancelled run needs a moment to notice the disconnect, then stops
    # within one UNet pass; wait for it rather than refusing the new run.
    if lock.acquire(timeout=3):
        return True
    previous = current["cancelled"]
    return previous is not None and previous.is_set() and lock.acquire(timeout=30)

@app.post("/generate")
async def generate(config: Config, request: Request):
    reference = None
    if config.reference:
        try:
            reference = await asyncio.to_thread(decode_reference, config.reference)
        except ValueError as exc:
            return JSONResponse({"error": str(exc)}, status_code=400)
    if not await asyncio.to_thread(acquire_lock):
        return JSONResponse({"error": "Lab is busy. Wait for the current run to finish."}, status_code=409)
    output = queue.Queue()
    cancelled = threading.Event()
    current["cancelled"] = cancelled
    worker = threading.Thread(target=generate_worker, args=(config,reference,output,cancelled), daemon=True)
    worker.start()
    async def stream():
        finished = False
        try:
            while True:
                try:
                    value = await asyncio.to_thread(output.get, True, 1)
                except queue.Empty:
                    if await request.is_disconnected():
                        break
                    yield ": heartbeat\n\n"
                    continue
                if value is None:
                    finished = True
                    break
                yield "data: " + json.dumps(value) + "\n\n"
        finally:
            # The client cancelled or disconnected before the run ended: stop the worker.
            if not finished:
                cancelled.set()
    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"})
