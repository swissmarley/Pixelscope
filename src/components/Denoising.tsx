import { useState } from "react";
import { line, curveMonotoneX } from "d3";
import { motion } from "motion/react";
import type { PipelineEvent, RunConfig } from "../core/types";
import { scheduler, useStore } from "../core/store";
import { sigmaAt } from "../core/math";
import { NoiseCanvas } from "./Visual";
type StepEvent = Extract<PipelineEvent, { type: "denoise_step" }>;
export function SchedulePlot({ step, total }: { step: number; total: number }) {
  const points = Array.from({ length: total + 1 }, (_, i) => [
    (i / total) * 210 + 10,
    100 - sigmaAt(i, total) * 85,
  ]);
  const path =
    line<number[]>()
      .x((d) => d[0])
      .y((d) => d[1])
      .curve(curveMonotoneX)(points) || "";
  return (
    <svg
      className="schedule-plot"
      viewBox="0 0 230 120"
      aria-label="Illustrative decreasing noise schedule"
    >
      <path d="M10 10 V100 H220" stroke="#343a48" fill="none" />
      {[25, 50, 75].map((y) => (
        <path
          key={y}
          d={`M10 ${y} H220`}
          stroke="#272c37"
          strokeDasharray="3 4"
        />
      ))}
      <path d={path} fill="none" stroke="#af9af9" strokeWidth="2" />
      <circle
        cx={(step / total) * 210 + 10}
        cy={100 - sigmaAt(step, total) * 85}
        r="4"
        fill="#d2c5ff"
      />
      <text x="10" y="116" fill="#737f92" fontSize="7">
        HIGH NOISE
      </text>
      <text x="177" y="116" fill="#737f92" fontSize="7">
        CLEAR IMAGE
      </text>
    </svg>
  );
}
export default function Denoising({
  event,
  config,
  events,
}: {
  event: StepEvent;
  config: RunConfig;
  events: PipelineEvent[];
}) {
  const { setConfig } = useStore();
  const [token, setToken] = useState("cabin");
  const [split, setSplit] = useState(false);
  const tokens = events.find((e) => e.type === "prompt_tokenized");
  const full = useStore((s) => s.events);
  const attention = event.stage === "attention";
  const guidance = event.stage === "guidance";
  const keys = Object.keys(event.attention);
  const selected = keys.includes(token)
    ? token
    : keys.find((t) => t.includes("cabin")) || keys[2];
  return (
    <div className="denoising-scene">
      <div className="denoise-layout">
        <div className="preview-column">
          <div className="preview-head">
            <span>
              <span className="live-dot" /> LATENT PREVIEW
            </span>
            <button onClick={() => setSplit(!split)}>
              {split ? "Single view" : "Split view"}
            </button>
          </div>
          <div
            className={`image-frame denoise-frame ${split ? "split-view" : ""}`}
          >
            <motion.img
              key={event.preview}
              src={event.preview}
              alt={`Illustrative image refinement at step ${event.step}`}
              initial={{ opacity: 0.4 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.45 }}
            />
            {attention && (
              <NoiseCanvas values={event.attention[selected]} heat />
            )}
            {split && (
              <div className="prediction-half">
                {event.noisePrediction ? (
                  <img
                    src={event.noisePrediction}
                    alt="Measured noise prediction projection"
                  />
                ) : event.guidance.difference ? (
                  <img
                    src={event.guidance.difference}
                    alt="Guidance prediction difference"
                  />
                ) : (
                  <NoiseCanvas
                    seed={config.seed + event.step}
                    values={event.prediction}
                  />
                )}
                <span>
                  {event.noisePrediction
                    ? "Predicted noise · measured"
                    : event.guidance.difference
                      ? "CFG difference · measured"
                      : "Noise prediction analogy · illustrative"}
                </span>
              </div>
            )}
            <span className="image-label">
              {attention
                ? `ATTENTION · ${selected}`
                : `STEP ${String(event.step).padStart(2, "0")} OF ${event.total}`}
            </span>
          </div>
          <div className="step-scrub">
            <input
              aria-label="Denoising step"
              type="range"
              min={1}
              max={event.total}
              value={event.step}
              onChange={(e) => {
                const i = full.findIndex(
                  (v) =>
                    v.type === "denoise_step" &&
                    v.stage === "denoise" &&
                    v.step === Number(e.target.value),
                );
                if (i >= 0) scheduler.scrub(i);
              }}
            />
            <div>
              <span>Structure & color</span>
              <span>Texture & detail</span>
            </div>
          </div>
        </div>
        <div className="denoise-stats">
          <div className="step-count">
            <span>REFINEMENT STEP</span>
            <b>
              {String(event.step).padStart(2, "0")}
              <small> / {event.total}</small>
            </b>
            <p>Finding the image in the noise.</p>
          </div>
          <div className="noise-level">
            <span>
              Noise level <b>{event.sigma.toFixed(3)}</b>
            </span>
            <div>
              <i style={{ width: `${Math.min(1, event.sigma) * 100}%` }} />
            </div>
          </div>
          <div className="schedule-block">
            <span className="eyebrow">
              {event.provenance === "observed"
                ? "CURRENT TIMESTEP"
                : "ILLUSTRATIVE SCHEDULE"}
            </span>
            {event.provenance === "illustrative" ? (
              <SchedulePlot step={event.step} total={event.total} />
            ) : (
              <div className="actual-timestep mono">t = {event.timestep}</div>
            )}
            <div className="scheduler-meta">
              <span>{config.sampler} scheduler</span>
              <span className="mono">t = {event.timestep}</span>
            </div>
          </div>
          <div className="denoise-mini">
            <div className="tiny-noise">
              <NoiseCanvas seed={config.seed + event.step} />
            </div>
            <div>
              <b>
                {event.provenance === "observed"
                  ? "Noise analogy"
                  : "Predicted noise"}
              </b>
              <p>
                {event.provenance === "observed"
                  ? "Illustrative, not the model prediction."
                  : "What the model learns to remove. Illustrative."}
              </p>
            </div>
          </div>
        </div>
      </div>
      {attention ? (
        <div className="attention-selector">
          <span>Where are the words looking?</span>
          <div>
            {tokens?.type === "prompt_tokenized" &&
              tokens.tokens
                .filter((t) => !t.text.startsWith("<"))
                .map((t, i) => (
                  <button
                    key={i}
                    className={selected === t.text ? "active" : ""}
                    onClick={() => setToken(t.text)}
                  >
                    {t.text}
                  </button>
                ))}
          </div>
          {keys.length === 0 && (
            <p className="muted">This model did not expose attention maps.</p>
          )}
        </div>
      ) : guidance ? (
        <div className="cfg-playground">
          <div>
            <span className="eyebrow">CLASSIFIER-FREE GUIDANCE</span>
            <p>The prompt’s influence, turned up.</p>
          </div>
          <label>
            <span>
              Guidance scale <b>{config.guidance.toFixed(1)}</b>
            </span>
            <input
              aria-label="Guidance scale"
              type="range"
              min="0"
              max="15"
              step="0.5"
              value={config.guidance}
              onChange={(e) => setConfig({ guidance: Number(e.target.value) })}
            />
            <small>
              {config.mode === "mock"
                ? "Illustrative formula; guidance does not regenerate the prerecorded preview."
                : "Generate again to run with the updated guidance."}
            </small>
          </label>
          <div className="cfg-equation mono">
            εu + {config.guidance} × (εc − εu)
          </div>
          {event.guidance.unconditional && (
            <div className="cfg-images">
              {(["unconditional", "conditional", "difference"] as const).map(
                (k) =>
                  event.guidance[k] && (
                    <figure key={k}>
                      <img src={event.guidance[k]} alt={`${k} prediction`} />
                      <figcaption>{k}</figcaption>
                    </figure>
                  ),
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="process-note">
          <span className="note-line" />
          <p>A little less noise. A little more of your idea.</p>
          <span className="mono">
            {event.provenance === "observed"
              ? "MEASURED LATENT PREVIEW"
              : "COARSE → FINE"}
          </span>
        </div>
      )}
    </div>
  );
}
