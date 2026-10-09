# Pixelscope

**Watch a prompt turn from noise into an image.**

A cinematic, event-driven image-generation explorer. Follow requests, tokens, embeddings, Gaussian noise, denoising, attention, guidance, decoding, image editing, and final delivery. Pause, step, scrub, and replay without regenerating. An illustrative autoregressive track builds an image-token sequence; a hosted track shows only observable API output.

## Start the demo

Requires Node.js 22.12+ and npm.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. Demo mode works offline after setup: fonts and all image frames are bundled. It requires no credentials, Python, or model download. The initial run is paused. Generate starts playback at 0.25×.

```sh
npm run check   # typecheck, ESLint, Prettier check and unit tests
npm run build
```

Demo includes seven prerecorded image examples. **Choosing a preset loads its matching preview and 24-frame sequence automatically**, preserving the stage you were viewing. Presets cover the cabin, a readable café sign, detailed and simple cabin scenes, three cats, woodblock art, and a winter edit. These previews and all simulated internals remain illustrative, not fresh model output. Arbitrary custom prompts use the alpine example; a persistent notice explains this and links to Live API setup. Use Lab or Live to generate a new image from a custom prompt. Seeds and guidance do not regenerate the prerecorded results.

## Controls

- Space: play/pause. Left/right arrows: one event backward/forward. `[` / `]`: decrease/increase speed.
- Transport buttons step by event or stage; timeline and denoising-step sliders scrub recorded events. Speed ranges from 0.1× to 4×.
- Inspector switches between explanation and raw JSON; Show the math renders equations with KaTeX.
- Settings include steps, sampler, guidance (CFG), negative prompt, provider, model, server URLs, and optional pause at stage boundaries. They are saved in this browser's local storage; prompts and reference images are not.
- Attach a PNG, JPEG, or WebP reference under 10 MB and 40 megapixels. The file's bytes are checked, not its name, and it is re-encoded in the browser (longest side at most 1536 px) before use, which drops EXIF, GPS and other metadata. Strength controls reference noising. Demo shows an analogy; Lab/Live perform an edit.
- Run history saves event recordings and generated images in IndexedDB. Runs you start with Generate are saved, as are all Lab and Live runs; opening the page, choosing a preset or switching family in Demo is not saved. Demo frames are stored as links to the bundled files, not copies. The newest 30 runs are kept; delete single runs or clear the history from the Run history dialog, which also shows how much the site stores. Replay needs no new API call. Select two runs to compare results and settings.
- Presets cover image lettering, long vs short prompts, counting, style, and editing. Their actual success depends on the model.
- The six-step first-visit tour can be reopened using Help. Reduced motion is respected; inputs and dialogs support keyboard navigation.

## Hosted API proxy

Keys are **server-only**. Never use `VITE_` environment variables for secrets or paste keys into the app.

```sh
cp .env.example .env
# Edit .env locally to set OPENAI_API_KEY and/or GEMINI_API_KEY.
npm run proxy
```

The proxy listens on http://127.0.0.1:3001. Select Live API, configure provider/model in Settings, then Generate. The defaults are `gpt-image-1` and `gemini-2.5-flash-image`; provider availability and pricing may change. Choose a supported image model on your account.

OpenAI uses the Images generation/edit endpoint with SSE partial images, a 1024×1024 output, medium quality, and one image. Gemini uses `generateContent` with text/image modalities and optional inline reference bytes; this adapter emits the returned final image and usage, not invented partials. Negative prompt, seed, sampler, steps, and CFG are not forwarded when unsupported by these hosted APIs.

The proxy validates provider/model/prompt/reference inputs (including the reference's magic bytes), limits payload size and simultaneous requests, times out requests, cancels disconnected requests, restricts browser origins, answers only requests addressed to `localhost`/`127.0.0.1` (against DNS rebinding), and keeps keys out of events. Its provider endpoints are fixed server-side. `/health` returns credential availability booleans, never credentials. This is a **local development proxy**; before exposing it to a network, add authentication, rate/budget limits, TLS, and your deployment's origin policy.

Live architecture is always shown as unknown. The separate “possible mechanisms” links open an illustrative Demo track, without claiming the hosted model uses that architecture. The lag indicator distinguishes incoming events from their replay; Catch up jumps to the latest received event.

## Using Lab or Live from GitHub Pages

The hosted site can drive a Lab or proxy running on your own machine. Both servers allow these browser origins by default: `http://127.0.0.1:5173`, `http://localhost:5173` (dev), `:4173` (`vite preview`) and `https://swissmarley.github.io`. If you deploy a fork, set `PIXELSCOPE_ORIGINS` to a comma-separated list that includes your Pages origin (scheme and host only, no path) before starting the proxy or the Lab. Both servers answer Chrome's Private Network Access preflight for allowed origins. Keep the server URLs in Connection settings on `http://127.0.0.1:…`: Chrome and Firefox let an HTTPS page reach loopback addresses, but not other plain-HTTP hosts; Safari may block both, so use the dev server there.

## Optional local diffusion Lab

**Heavy Python packages and model weights are not installed by the JavaScript setup.** Installing PyTorch/diffusers or downloading weights larger than 200 MB requires your explicit choice. The implementation was syntax-checked; model inference has not been verified in this workspace.

After approving these downloads yourself, use Python 3.11+:

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r lab/requirements.txt
# If model weights are already cached, omit this opt-in.
# Only set it when you approve downloading multi-gigabyte model weights:
export PIXELSCOPE_ALLOW_MODEL_DOWNLOAD=1
export PIXELSCOPE_LAB_MODEL=stabilityai/sd-turbo
uvicorn lab.server:app --host 127.0.0.1 --port 8000
```

Choose Local lab and Diffusion. The default SD-Turbo model runs up to four steps with guidance disabled, following its model recommendations. For classic CFG, set `PIXELSCOPE_LAB_MODEL` to a compatible cached SD 1.x model, then in Connection settings raise the steps and set Guidance (CFG) above 1; the Guidance stage then shows the unconditional, conditional and difference maps. Lab supports classic Stable Diffusion pipelines, not arbitrary FLUX/SDXL architectures. Euler and DDIM are configurable; model suitability varies.

- CUDA: FP16 inference on a supported GPU. Full VAE step previews and attention capture add work and memory.
- Apple Silicon: MPS, float32, CPU random generator. Performance and operation support depend on installed PyTorch.
- CPU: float32; generation and decoding can take considerably longer. No speed guarantee.
- Cache-only is the default. Without cached weights, the server reports that the model is not cached rather than silently downloading. `GET /health` reports `model_missing` in that case.
- The Lab accepts PNG, JPEG and WebP references up to 10 MB and 40 megapixels, checks them before any model work starts, and limits request bodies to 16 MB. Step previews are sent as WebP to keep streams small. A local model folder is shown by its folder name only, never its full path.
- Cancel stops the run at the next UNet pass. A new run started right after Cancel waits for the cancelled one to finish instead of failing with "Lab is busy".
- Lab emits real CLIP tokens/IDs (77 context slots in SD-Turbo), a 32-column view of actual embeddings, a PCA projection, initial latent projection, decoded step previews, scheduler timesteps/sigmas, and measured mid-block cross-attention maps.
- Classic CFG runs record actual unconditional/conditional predictions and their normalized difference views. SD-Turbo does not have that CFG split. Unsupported maps are omitted, never simulated under an “observed” label.
- Attention capture uses the eager processor on mid-block cross-attention only, to reduce memory. These are normalized interaction weights, not a causal explanation.
- Image editing uses the VAE-encoded reference and the actual img2img pipeline. The steps may be adjusted to ensure at least one effective step at the selected strength.
- Predictions are tensor projections, not decoded images. The UI's generic noise mini-view and decode comparison remain labeled analogies even on observed runs.

## What is real vs. illustrative in each mode

| Mode / family | Real or observable | Illustrative |
| --- | --- | --- |
| Demo / diffusion | Bundled image asset and deterministic Gaussian field calculation | Simplified subwords and made-up IDs; embeddings; all denoising frames; attention; CFG visualization; decode analogy; editing noising analogy; metadata and safety step |
| Demo / autoregressive | Deterministic replay over the selected prerecorded preview | Entire token model, raster order, vocabulary IDs, candidate probabilities and patch views; decoder |
| Demo / hosted | No provider call | Request, partial/final images and timing are a canned example |
| Lab / diffusion | Real tokenizer, encoder/PCA, latents, full VAE previews, scheduler values, captured mid-block attention, supported CFG predictions, img2img, result/timing | Explanatory diagrams, generic noise mini-view and before/after latent visual analogy |
| Live / hosted | Actual request payload fields, measured elapsed time, API partials when supported, final images and returned usage | Optional possible-mechanisms demos and educational diagrams; no invented internal safety result |

Autoregressive mode is **not** a claim about the private internals of GPT Image or Gemini. It teaches a possible sequence-based mechanism. Provider models are treated as black boxes in Live mode.

## Content safety and privacy

Do not bypass provider safety systems: the proxy preserves default provider moderation/safety behavior and displays blocked/error responses. The bundled demo assets are benign preset examples; the animated “safety step” is explicitly illustrative. The local Lab preserves any safety checker provided by the selected pipeline; some local models, including SD-Turbo configurations, may not include one. Pixelscope does not add or imply an independently validated local moderation system. Use only appropriate prompts/reference images, follow model licenses, and review generated outputs before sharing.

Prompts and image bytes go to the selected provider only in Live mode, and to your local Python server in Lab. Reference images are re-encoded in the browser first, so EXIF data such as GPS location, camera and author is not sent or stored. Saved recordings stay in your browser's IndexedDB and include your reference images; delete them from Run history. The production build sets a Content-Security-Policy that allows scripts from the site itself only. The app has no analytics or remote font requests.

## Architecture

`PipelineEvent` is a TypeScript discriminated union. `MockSource`, `LabSource`, and `LiveSource` share an async-iterable interface. The scheduler owns pacing, pause, speed, steps, stage transitions, and scrub. Components render event state; they do not independently schedule pipeline stages. A Zustand store coordinates controls. IndexedDB stores events plus image blobs for replay. Canvas2D handles noise/heatmaps; D3 builds the schedule chart; Motion animates scene/frame transitions.

See [PLAN.md](PLAN.md). Unit tests cover scheduler speed scaling/pause/stepping/scrub, noise math/CFG, deterministic family sources, cancellation, chunked SSE parsing, readable server errors, reference image checks, and settings validation. CI runs `npm run check` and the build on every pull request and before each Pages deployment. Optional backend inference and paid provider generation require external setup and are not claimed as tested.

## Demo assets

The built-in image-generation tool created the original `public/demo/final.webp` from this prompt: “A small solitary wooden cabin with a warmly glowing amber window beside an alpine lake, pine trees, dramatic dark blue mountain peaks, rosy orange dusk sky reflected in perfectly still water, subtle mist; photorealistic, no text or logos.”

Each preset’s 24 baked frames are **synthetic visual analogies**, made by progressively blending seeded Gaussian noise with increasingly detailed versions of this final asset. They are not internal frames from its generation. `scripts/bake-demo.mjs` documents this operation. Additional preset assets live under `public/demo/{lettering,detailed,simple,cats,woodblock,winter}/`, each with a final image and matching frame sequence. Asset generation prompts are recorded in `public/demo/catalog.json`. No external image URL is required at runtime.

## Primary references

- [Diffusers step callbacks](https://huggingface.co/docs/diffusers/en/using-diffusers/callback)
- [SD-Turbo tokenizer configuration: 77 slots](https://huggingface.co/stabilityai/sd-turbo/blob/main/tokenizer/tokenizer_config.json)
- [SD-Turbo model and recommended settings](https://huggingface.co/stabilityai/sd-turbo)
- [OpenAI image generation and streaming](https://developers.openai.com/api/docs/guides/image-generation)
- [Gemini image generation](https://ai.google.dev/gemini-api/docs/image-generation)

## Known limits

No live credentials or large local weights were supplied. The backends are implemented with explicit setup and error states; real generation remains to be exercised on your chosen provider/hardware. The simulator selects among seven prerecorded preset images; arbitrary custom prompts fall back to the alpine example. The comparison panels can replay stored runs, but do not synchronize their step clocks. Hosted quality/size controls are fixed in the proxy to the supported demo defaults rather than exposing arbitrary provider-specific request parameters.
