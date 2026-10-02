import { describe, it, expect } from "vitest";
import { MockSource, readSSE } from "../src/core/sources";
import { defaultConfig, type PipelineEvent } from "../src/core/types";
async function collect(stream: AsyncIterable<PipelineEvent>) {
  const result: PipelineEvent[] = [];
  for await (const e of stream) result.push(e);
  return result;
}
describe("event sources", () => {
  it("produces reproducible illustrative events and completes all families", async () => {
    for (const family of ["diffusion", "autoregressive", "hosted"] as const) {
      const c = { ...defaultConfig, family };
      const first = await collect(
        new MockSource().stream(c, new AbortController().signal),
      );
      const second = await collect(
        new MockSource().stream(c, new AbortController().signal),
      );
      expect(first).toEqual(second);
      expect(first.at(-1)?.type).toBe("done");
      expect(first.every((e) => e.provenance === "illustrative")).toBe(true);
      if (family === "autoregressive")
        expect(
          first.filter((e) => e.type === "image_token_sampled"),
        ).toHaveLength(64);
    }
  });
  it("stops a mock stream when cancelled", async () => {
    const controller = new AbortController();
    const source = new MockSource()
      .stream(defaultConfig, controller.signal)
      [Symbol.asyncIterator]();
    await source.next();
    controller.abort();
    const events = await collect({ [Symbol.asyncIterator]: () => source });
    expect(events.some((e) => e.type === "denoise_step")).toBe(false);
    expect(events.some((e) => e.type === "done")).toBe(false);
  });
  it("parses split UTF-8 and CRLF SSE packets", async () => {
    const expected: PipelineEvent = {
      id: "one",
      stage: "request",
      type: "sent",
      duration: 100,
      elapsed: 0,
      provenance: "observed",
      model: "modèle",
    };
    const bytes = new TextEncoder().encode(
      `: keepalive\r\n\r\ndata: ${JSON.stringify(expected)}\r\n\r\n`,
    );
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      },
    });
    const result = await collect(
      readSSE(new Response(stream), new AbortController().signal),
    );
    expect(result).toEqual([expected]);
  });
  it("propagates server and stream errors", async () => {
    await expect(
      collect(
        readSSE(
          new Response('{"error":"Missing server key"}', { status: 503 }),
          new AbortController().signal,
        ),
      ),
    ).rejects.toThrow("Missing server key");
    await expect(
      collect(
        readSSE(
          new Response('data: {"error":"Generation blocked"}\n\n'),
          new AbortController().signal,
        ),
      ),
    ).rejects.toThrow("Generation blocked");
  });
});

describe("preset recordings", () => {
  it("selects a unique final image and matching denoising frames for every preset", async () => {
    const { promptPresets } = await import("../src/core/presets");
    const images = new Set<string>();
    for (const preset of promptPresets) {
      const events = await collect(
        new MockSource().stream(
          { ...defaultConfig, prompt: preset.prompt },
          new AbortController().signal,
        ),
      );
      const decoded = events.find((e) => e.type === "vae_decoded");
      expect(decoded?.type).toBe("vae_decoded");
      if (decoded?.type !== "vae_decoded")
        throw new Error("Missing decoded preset");
      images.add(decoded.image);
      expect(decoded.image).toBe(`${preset.directory}/final.webp`);
      const previews = events.filter((e) => e.type === "denoise_step");
      expect(
        previews.every((e) =>
          e.preview.startsWith(`${preset.directory}/frame-`),
        ),
      ).toBe(true);
      expect(events.every((e) => e.provenance === "illustrative")).toBe(true);
    }
    expect(images.size).toBe(promptPresets.length);
  });
  it("uses the same preset asset across diffusion, autoregressive and hosted demos", async () => {
    for (const family of ["diffusion", "autoregressive", "hosted"] as const) {
      const events = await collect(
        new MockSource().stream(
          { ...defaultConfig, prompt: "three cats on a sofa", family },
          new AbortController().signal,
        ),
      );
      const final = events.find(
        (e) =>
          e.type === "vae_decoded" ||
          e.type === "image_decoded" ||
          e.type === "final_image",
      );
      expect(final && "image" in final ? final.image : undefined).toBe(
        "/demo/cats/final.webp",
      );
      expect(
        events
          .filter((e) => e.type === "grid_progress")
          .every((e) => e.preview === "/demo/cats/final.webp"),
      ).toBe(true);
    }
  });
  it("matches normalized presets and honestly falls back for custom prompts", async () => {
    const { demoAssets } = await import("../src/core/presets");
    expect(demoAssets("  THREE   CATS on a sofa ").preset?.id).toBe("cats");
    expect(demoAssets("a spaceship made of tulips").preset).toBeUndefined();
    expect(demoAssets("a spaceship made of tulips").image).toBe(
      "/demo/final.webp",
    );
  });
});
