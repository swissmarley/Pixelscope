# Pixelscope implementation plan

Watch a prompt turn from noise into an image.

## Architecture

```text
React scene shell / inspector / history / transport
                       |
                Zustand run store
                       |
          Scheduler (event time / speed)
                       |
         typed PipelineEvent recording
            /          |           \
       MockSource   LabSource     LiveSource
       local frames FastAPI SSE   Express SSE proxy
                       |           |
                  diffusers     OpenAI / Gemini
                       |
          IndexedDB events + image blobs
```

## Event definitions

All events carry `id`, `stage`, `duration`, `elapsed`, and `provenance`.
Discriminated union by `type`:
- Shared: request_built {request}, sent {model}, done {metadata}
- Diffusion: prompt_tokenized {tokens, limit}, text_embedded {vectors, projection}, noise_initialized {seed, shape}, denoise_step {step, timestep, sigma, preview, attention, guidance}, vae_decoded {image}
- Editing: reference_encoded {image, strength}
- Autoregressive: image_tokens_planned {rows, cols}, image_token_sampled {position, tokenId, candidates}, grid_progress {filled}, image_decoded {image}
- Hosted: partial_image {image}, final_image {image}, usage {usage}

Mock is deterministic and illustrative. Frames are baked local assets. Real local output is tagged observed. Hosted internals remain unknown; possible mechanisms are separate illustrative views.

## File tree

```text
src/
  core/{types,scheduler,math,sources,persistence,store}.ts
  components/{Scene,Visual,Transport,Inspector,Overlays}.tsx
  App.tsx / styles.css / tokens.css
public/demo/                baked frame sequence
server/proxy.mjs            server-only credentials
lab/{server.py,requirements.txt}
tests/core.test.ts
.env.example / README.md
```

## Milestones and verification

1. M1: Vite/React/TypeScript, tokens, typed events, deterministic MockSource, Scheduler, transport. Unit tests and browser screenshot.
2. M2: request, tokenization, embeddings, seeded Gaussian noise. Browser screenshot.
3. M3: denoising, token heatmaps, CFG controls, scheduler plot. Browser screenshot.
4. M4: decode, reference editing, final delivery/download and persistence. Browser screenshot.
5. M5: optional FastAPI/diffusers SSE backend, true tokens/embeddings/previews/noise, capability labels. No heavy dependency install or model download. Browser checks of Lab configuration/error state.
6. M6: Express provider proxy and LiveSource, observable hosted events, honest explainer. Browser checks of Live configuration/error state.
7. M7: illustrative sequential token track and comparison. Browser screenshot.
8. M8: guided tour, presets, responsive/accessibility polish, README and complete build/tests/browser checks.

## Design

Cinematic learning workspace: deep charcoal, cyan input, violet internal stages, amber output. Inter and JetBrains Mono. A quiet progress rail, a generous central image, and a readable inspector. Animation follows event state, with reduced-motion support.

## Verification and constraints

Tests cover speed-scaled scheduler time, pause, event/stage stepping, scrub, schedules and CFG. Browser screenshots live under output/playwright. Never expose provider keys; never represent simulation as model measurements. Lab dependency installation and model weights remain an explicit user action. Provider safety systems remain enabled.

## Verification record

- M1: scheduler/math tests, production build, M1 screenshot.
- M2: request, tokens, embeddings, seeded noise checked and captured.
- M3: denoising, attention, guidance checked and captured.
- M4: decode, reference upload/edit analogy, delivery, actual image download, IndexedDB history and comparison checked and captured.
- M5: optional Python backend syntax validated; browser connection/error state captured. No heavy packages or weights installed; actual inference remains unverified.
- M6: proxy syntax, health, origin rejection, invalid-provider rejection, invalid-prompt rejection, missing-key state and hosted explainer verified. Paid provider generation remains unverified without credentials.
- M7: sequential grid/candidate track and comparison captured; rail ordering fixed.
- M8: six tour steps, math, split view, keyboard shortcuts, dialog dismissal, replay after reload, and 1280px/768px/390px layouts verified. Ten unit tests pass; production build passes. Dependency audit reports zero vulnerabilities after updates.

Screenshots: `output/playwright/`. Limitations and setup: `README.md`.

## Preset preview correction

Each preset now resolves to a distinct prerecorded result and its own 24-frame sequence, shared by diffusion, autoregressive and hosted demos. Selecting a Demo preset reloads the run and preserves the viewed stage. Custom prompts are clearly labeled as using the illustrative alpine example, with a Live setup action. Regression tests cover unique preset results, matching intermediate frames, cross-family consistency, normalized matching and custom fallback.

Verified: 14 tests pass; production build passes; all seven preset images decode and switch in the browser. Refinement frames switch with the preset, the custom-prompt action opens Live connection settings, and the new notice fits at 390px without horizontal overflow. Screenshots: `output/playwright/preset-cats.png`, `preset-winter.png`, `preset-woodblock.png`, and `preset-mobile.png`.
