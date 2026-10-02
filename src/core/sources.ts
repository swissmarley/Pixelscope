import type {
  EventData,
  PipelineEvent,
  PipelineSource,
  RunConfig,
  Stage,
} from "./types";
import { random, sigmaAt } from "./math";
import { demoAssets } from "./presets";
export class MockSource implements PipelineSource {
  async *stream(
    c: RunConfig,
    signal: AbortSignal,
  ): AsyncIterable<PipelineEvent> {
    const r = random(c.seed);
    let elapsed = 0;
    let id = 0;
    const event = (
      stage: Stage,
      data: EventData,
      duration = 400,
    ): PipelineEvent =>
      ({
        ...data,
        id: `mock-${id++}`,
        stage,
        duration,
        elapsed: (elapsed += duration),
        provenance: "illustrative",
      }) as PipelineEvent;
    const assets = demoAssets(c.prompt);
    const image = assets.image;
    yield event("request", {
      type: "request_built",
      request: {
        prompt: c.prompt,
        negative_prompt: c.negative || undefined,
        seed: c.seed,
        steps: c.steps,
        guidance_scale: c.guidance,
        size: "512x512",
        quality: "demo",
        n: 1,
        demo_preset: assets.preset?.id || "custom-prompt-example",
        reference_images: c.reference ? 1 : 0,
      },
    });
    yield event("request", {
      type: "sent",
      model:
        c.family === "diffusion"
          ? "Diffusion simulator"
          : c.family === "autoregressive"
            ? "Autoregressive simulator"
            : "Hosted request simulator",
    });
    if (c.family === "hosted") {
      yield event(
        "delivery",
        { type: "partial_image", image: assets.frame(12), index: 0 },
        800,
      );
      yield event("delivery", { type: "final_image", image });
      yield event("delivery", {
        type: "usage",
        usage: { note: "No provider usage: this is a demo." },
      });
    } else {
      const words = c.prompt.match(/\S+\s*/g) || [];
      const tokens = [
        { text: "<start>", id: 49406 },
        ...words.flatMap((w, i) =>
          w.length > 9
            ? [
                { text: w.slice(0, 4), id: 1000 + i * 7 },
                { text: w.slice(4), id: 1001 + i * 7 },
              ]
            : [{ text: w.trim(), id: 1000 + i * 7 }],
        ),
        { text: "<end>", id: 49407 },
      ];
      yield event("tokens", {
        type: "prompt_tokenized",
        tokens: tokens.slice(0, 77),
        limit: 77,
        total: tokens.length,
      });
      if (c.family === "autoregressive") {
        yield event("sequence", {
          type: "image_tokens_planned",
          rows: 8,
          cols: 8,
        });
        for (let i = 0; i < 64; i++) {
          if (signal.aborted) return;
          yield event(
            "sequence",
            {
              type: "image_token_sampled",
              position: i,
              tokenId: 1000 + i,
              candidates: [
                { id: 1000 + i, probability: 0.61, color: "#b77f68" },
                {
                  id: Math.floor(r() * 8192),
                  probability: 0.25,
                  color: "#475d78",
                },
                {
                  id: Math.floor(r() * 8192),
                  probability: 0.14,
                  color: "#203a49",
                },
              ],
            },
            100,
          );
          yield event(
            "sequence",
            { type: "grid_progress", filled: i + 1, total: 64, preview: image },
            60,
          );
        }
        yield event("decode", { type: "image_decoded", image });
      } else {
        yield event("embeddings", {
          type: "text_embedded",
          vectors: tokens
            .slice(0, 77)
            .map(() => Array.from({ length: 32 }, () => r() * 2 - 1)),
          projection: tokens.slice(0, 77).map(() => [r(), r()]),
        });
        if (c.reference)
          yield event("edit", {
            type: "reference_encoded",
            image: c.reference,
            strength: c.strength,
          });
        yield event("noise", {
          type: "noise_initialized",
          seed: c.seed,
          shape: [64, 64, 4],
        });
        for (let i = 1; i <= c.steps; i++) {
          if (signal.aborted) return;
          const stepData = {
            type: "denoise_step" as const,
            step: i,
            total: c.steps,
            timestep: Math.round(999 * (1 - i / c.steps)),
            sigma: sigmaAt(i, c.steps),
            preview: assets.frame((i / c.steps) * 24),
            attention: Object.fromEntries(
              tokens.map((t) => [
                t.text,
                Array.from({ length: 64 }, () => r()),
              ]),
            ),
            guidance: { scale: c.guidance },
            prediction: Array.from({ length: 64 }, () => r() * 2 - 1),
          };
          yield event("denoise", stepData, 350);
          if (i === Math.round(c.steps * 0.6)) {
            yield event("attention", stepData, 550);
            yield event("guidance", stepData, 550);
          }
        }
        yield event("decode", { type: "vae_decoded", image });
      }
    }
    yield event("delivery", {
      type: "done",
      metadata: {
        seed: c.seed,
        steps: c.family === "diffusion" ? c.steps : undefined,
        guidance: c.family === "diffusion" ? c.guidance : undefined,
        model: `Pixelscope demo · ${assets.preset?.name || "alpine example"}`,
        size: "512 × 512",
        seconds: 4.2,
      },
    });
  }
}
export async function* readSSE(
  response: Response,
  signal: AbortSignal,
): AsyncIterable<PipelineEvent> {
  if (!response.ok) {
    const body = await response.text();
    let message = body;
    try {
      const error: unknown = JSON.parse(body);
      if (typeof error === "object" && error !== null && "error" in error)
        message = String(error.error);
    } catch {
      /* Plain-text responses are also supported. */
    }
    throw new Error(
      message.slice(0, 400) || `Server returned ${response.status}`,
    );
  }
  if (!response.body)
    throw new Error("The server did not return an event stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (!signal.aborted) {
      const result = await reader.read();
      if (result.done) break;
      buffer = (
        buffer + decoder.decode(result.value, { stream: true })
      ).replace(/\r\n/g, "\n");
      let end;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        const packet = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = packet
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trimStart())
          .join("\n");
        if (!data) continue;
        const parsed: unknown = JSON.parse(data);
        if (typeof parsed === "object" && parsed !== null && "error" in parsed)
          throw new Error(String(parsed.error));
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          "type" in parsed &&
          "stage" in parsed
        )
          yield parsed as PipelineEvent;
      }
    }
  } finally {
    await reader.cancel();
  }
}
export class LabSource implements PipelineSource {
  async *stream(c: RunConfig, s: AbortSignal) {
    if (c.family !== "diffusion")
      throw new Error(
        "Lab supports diffusion only. Use Mock for the illustrative autoregressive track.",
      );
    yield* readSSE(
      await fetch(`${c.labUrl}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(c),
        signal: s,
      }),
      s,
    );
  }
}
export class LiveSource implements PipelineSource {
  async *stream(c: RunConfig, s: AbortSignal) {
    yield* readSSE(
      await fetch(`${c.proxyUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(c),
        signal: s,
      }),
      s,
    );
  }
}
