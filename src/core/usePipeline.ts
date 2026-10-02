import { useCallback, useEffect, useRef, useState } from "react";
import { MockSource, LabSource, LiveSource } from "./sources";
import { scheduler, useStore } from "./store";
import { saveRun } from "./persistence";
import type { RunConfig } from "./types";
export function usePipeline() {
  const { config, setConfig, setError, setReceiving } = useStore();
  const [runConfig, setRunConfig] = useState(config);
  const abort = useRef<AbortController | null>(null);
  const generate = useCallback(
    async (c: RunConfig = useStore.getState().config, autoplay = true) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      const actual = {
        ...c,
        family: c.mode === "live" ? ("hosted" as const) : c.family,
      };
      setConfig(actual);
      setRunConfig(actual);
      setError("");
      setReceiving(true);
      scheduler.load([]);
      if (autoplay) scheduler.toggle();
      const source =
        c.mode === "mock"
          ? new MockSource()
          : c.mode === "lab"
            ? new LabSource()
            : new LiveSource();
      try {
        for await (const event of source.stream(actual, controller.signal)) {
          if (controller.signal.aborted) return;
          scheduler.append(event);
        }
        if (controller.signal.aborted) return;
        if (!scheduler.events.some((e) => e.type === "done")) {
          throw new Error(
            "The event stream ended without a completed image. Check the server and retry.",
          );
        }
        if (scheduler.events.some((e) => e.type === "done")) {
          const final = [...scheduler.events]
            .reverse()
            .find((e) => "image" in e);
          const last = scheduler.events
            .filter((e) => e.type === "denoise_step")
            .at(-1);
          try {
            await saveRun({
              id: crypto.randomUUID(),
              created: Date.now(),
              config: actual,
              events: [...scheduler.events],
              thumbnail:
                final && "image" in final
                  ? final.image
                  : last?.preview || "/demo/final.webp",
            });
          } catch {
            setError(
              "This run is playable, but local storage could not save it. Check browser storage permissions or available space.",
            );
          }
        }
      } catch (e: unknown) {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : "Generation failed.");
          scheduler.pause();
        }
      } finally {
        if (!controller.signal.aborted) setReceiving(false);
      }
    },
    [setConfig, setError, setReceiving],
  );
  useEffect(() => {
    void generate(config, false);
    return () => abort.current?.abort();
  }, []);
  useEffect(() => {
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      scheduler.tick(now - last);
      last = now;
      if (!useStore.getState().receiving) scheduler.finish();
    }, 30);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (document.querySelector('[aria-modal="true"]')) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLButtonElement
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        scheduler.toggle();
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        scheduler.step(1);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        scheduler.step(-1);
      }
      if (e.key === "[")
        scheduler.setSpeed(Math.round((scheduler.speed - 0.1) * 100) / 100);
      if (e.key === "]")
        scheduler.setSpeed(Math.round((scheduler.speed + 0.1) * 100) / 100);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  return {
    generate,
    runConfig,
    setRunConfig,
    cancel: () => {
      abort.current?.abort();
      setReceiving(false);
      scheduler.pause();
    },
  };
}
