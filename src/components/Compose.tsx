import { useRef } from "react";
import {
  Paperclip,
  Sparkle,
  ArrowUpRight,
  CaretDown,
} from "@phosphor-icons/react";
import { scheduler, useStore } from "../core/store";
import type { RunConfig } from "../core/types";
import { getPromptPreset } from "../core/presets";
import { prepareReference } from "../core/image";
import { clampSeed } from "../core/settings";
export default function Compose({
  generate,
  presets,
  cancel,
  settings,
}: {
  generate: (c?: RunConfig, autoplay?: boolean) => Promise<void>;
  presets: () => void;
  cancel: () => void;
  settings: () => void;
}) {
  const { config, setConfig, receiving, setError, speed } = useStore();
  const attach = useRef<HTMLInputElement>(null);
  return (
    <section className="compose">
      <div className="compose-line">
        <div className="prompt-wrap">
          <Sparkle size={20} />
          <input
            aria-label="Image prompt"
            value={config.prompt}
            onChange={(e) => setConfig({ prompt: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && config.prompt.trim()) void generate();
            }}
          />
          <button
            aria-label="Attach reference image"
            className={config.reference ? "attached" : ""}
            onClick={() => attach.current?.click()}
          >
            <Paperclip size={19} />
          </button>
          <input
            hidden
            ref={attach}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Clear the input so choosing the same file again fires onChange.
              e.target.value = "";
              if (!file) return;
              if (
                !["image/png", "image/jpeg", "image/webp"].includes(file.type)
              ) {
                setError("Choose a PNG, JPEG or WebP image.");
                return;
              }
              prepareReference(file).then(
                (reference) => {
                  setError("");
                  setConfig({ reference });
                },
                (err: unknown) =>
                  setError(
                    err instanceof Error && err.message
                      ? err.message
                      : "This image could not be read.",
                  ),
              );
            }}
          />
        </div>
        <button
          className="generate"
          disabled={!config.prompt.trim()}
          onClick={() => void generate()}
        >
          <Sparkle size={17} weight="fill" />
          {receiving ? "Restart run" : "Generate"}
          <ArrowUpRight size={16} />
        </button>
        {receiving && <button onClick={cancel}>Cancel</button>}
      </div>
      <div className="config-line">
        <div className="mode-control">
          <span>Source</span>
          {(["mock", "lab", "live"] as const).map((m) => (
            <button
              key={m}
              className={config.mode === m ? "active" : ""}
              onClick={() =>
                setConfig({
                  mode: m,
                  family:
                    m === "live"
                      ? "hosted"
                      : m === "lab"
                        ? "diffusion"
                        : config.family,
                  steps: m === "lab" ? 4 : config.steps,
                })
              }
            >
              {m === "mock" ? "Demo" : m === "lab" ? "Local lab" : "Live API"}
            </button>
          ))}
        </div>
        <label className="family-label">
          Model family{" "}
          <select
            aria-label="Model family"
            value={config.family}
            onChange={(e) => {
              const c = {
                ...config,
                family: e.target.value as RunConfig["family"],
              };
              setConfig(c);
              if (c.mode === "mock") void generate(c, false);
            }}
          >
            <option value="diffusion" disabled={config.mode === "live"}>
              Diffusion
            </option>
            <option value="autoregressive" disabled={config.mode !== "mock"}>
              Autoregressive
            </option>
            <option value="hosted" disabled={config.mode === "lab"}>
              Hosted · black box
            </option>
          </select>
        </label>
        <label className="seed-label">
          Seed{" "}
          <input
            aria-label="Random seed"
            type="number"
            min="0"
            max="4294967295"
            step="1"
            value={config.seed}
            onChange={(e) =>
              setConfig({ seed: clampSeed(Number(e.target.value)) })
            }
          />
        </label>
        <label className="top-speed">
          Speed
          <select
            aria-label="Top playback speed"
            value={speed}
            onChange={(e) => scheduler.setSpeed(Number(e.target.value))}
          >
            {Array.from(new Set([0.1, 0.25, 0.5, 1, 2, 4, speed]))
              .sort((a, b) => a - b)
              .map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
          </select>
        </label>
        <button className="preset-trigger" onClick={presets}>
          Try a preset <CaretDown size={12} />
        </button>
        <span className="source-status">
          <span className="live-dot" />
          {config.mode === "mock"
            ? "Prerecorded presets · no key needed"
            : config.mode === "lab"
              ? "Local model connection"
              : "Keys stay on your server"}
        </span>
      </div>
      {config.mode === "mock" && (
        <div className="demo-preview-note" role="status">
          <span>
            {getPromptPreset(config.prompt)
              ? `Demo preview: ${getPromptPreset(config.prompt)?.name}. Prerecorded imagery; simulated pipeline.`
              : "Custom prompt in Demo: the alpine example illustrates the pipeline. This mode does not generate custom images."}
          </span>
          <button
            onClick={() => {
              setConfig({ mode: "live", family: "hosted" });
              settings();
            }}
          >
            Generate custom images <ArrowUpRight size={12} />
          </button>
        </div>
      )}
      {config.reference && (
        <div className="reference-strip">
          <img src={config.reference} alt="Attached reference" />
          <span>Reference attached</span>
          <label>
            Edit strength{" "}
            <input
              aria-label="Edit strength"
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={config.strength}
              onChange={(e) => setConfig({ strength: Number(e.target.value) })}
            />
            {config.strength}
          </label>
          <button onClick={() => setConfig({ reference: undefined })}>
            Remove
          </button>
        </div>
      )}
    </section>
  );
}
