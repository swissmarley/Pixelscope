import { useState } from "react";
import {
  DownloadSimple,
  Copy,
  ArrowUpRight,
  Check,
} from "@phosphor-icons/react";
import type { PipelineEvent, RunConfig } from "../core/types";
import { NoiseCanvas } from "./Visual";
import { demoAssets } from "../core/presets";
import { imageExtension } from "../core/image";
export default function Delivery({
  event,
  events,
  config,
}: {
  event: PipelineEvent;
  events: PipelineEvent[];
  config: RunConfig;
}) {
  const [reveal, setReveal] = useState(65);
  const [copied, setCopied] = useState(false);
  const imageEvent = [...events].reverse().find((e) => "image" in e);
  const image =
    imageEvent && "image" in imageEvent
      ? imageEvent.image
      : demoAssets(config.prompt).image;
  const metadata = event.type === "done" ? event.metadata : undefined;
  const decode = event.stage === "decode";
  const diffusion = config.family === "diffusion";
  const editing = event.stage === "edit";
  return (
    <div className="delivery-scene">
      <div className="delivery-layout">
        <div>
          <div className="preview-head">
            <span>
              {decode
                ? "LATENT → PIXELS"
                : editing
                  ? "REFERENCE → NOISED LATENT"
                  : "THE FINAL IMAGE"}
            </span>
            <span className="mono">{metadata?.size || "512 × 512"}</span>
          </div>
          <div className="image-frame result-frame">
            <img
              src={editing && config.reference ? config.reference : image}
              alt={
                editing
                  ? "Reference image"
                  : `Image result for: ${config.prompt}`
              }
            />
            {decode && (
              <div className="decode-overlay" style={{ width: `${reveal}%` }}>
                <img
                  src={image}
                  alt="Pixelated representation of latent space"
                />
                <span>Latent analogy</span>
              </div>
            )}
            {editing && (
              <div className="edit-noise" style={{ opacity: config.strength }}>
                <NoiseCanvas seed={config.seed} />
              </div>
            )}
            {decode && (
              <div className="reveal-line" style={{ left: `${reveal}%` }}>
                ↔
              </div>
            )}
          </div>
          {decode && (
            <label className="decode-control">
              <input
                aria-label="Latent to pixels reveal"
                type="range"
                min="0"
                max="100"
                value={reveal}
                onChange={(e) => setReveal(Number(e.target.value))}
              />
              <span>Compact latent analogy</span>
              <span>Decoded pixels</span>
            </label>
          )}
        </div>
        <div className="delivery-info">
          <span className="eyebrow">
            {decode
              ? "THE LAST TRANSFORMATION"
              : editing
                ? "REIMAGINE, WITH A STARTING POINT"
                : "FROM YOUR WORDS TO YOUR WORLD"}
          </span>
          <h3>
            {decode
              ? "A world of detail."
              : editing
                ? "A little room to change."
                : "An idea, made visible."}
          </h3>
          <p>
            {decode
              ? "The decoder expands a compact representation into a full-resolution image."
              : editing
                ? "The reference is encoded and partially noised before the new prompt guides refinement."
                : "Every journey leaves a trace. Explore it again, or save the result."}
          </p>
          {decode ? (
            <div className="decode-dimensions">
              <span>{diffusion ? "64 × 64 × 4" : "8 × 8 tokens"}</span>
              <ArrowUpRight size={25} />
              <span>512 × 512 × 3</span>
              <small>
                {diffusion
                  ? "Diffusion: 8× expansion per side. This view is illustrative."
                  : "Token-grid patches are decoded into pixels. This view is illustrative."}
              </small>
            </div>
          ) : editing ? (
            <div className="metrics">
              <div>
                <b>{Math.round(config.strength * 100)}%</b>
                <span>Editing strength</span>
              </div>
              <p className="muted">
                Demo visualizes reference noising and plays a prerecorded edit
                preview. Lab and Live perform an actual edit.
              </p>
            </div>
          ) : (
            <>
              <div className="result-metadata">
                {Object.entries({
                  Model: metadata?.model || config.model,
                  Seed: metadata?.seed ?? "Not returned",
                  Steps: metadata?.steps ?? "Not returned",
                  Guidance: metadata?.guidance ?? "Not returned",
                  Time: metadata
                    ? `${metadata.seconds.toFixed(1)}s`
                    : "Receiving…",
                }).map(([k, v]) => (
                  <div key={k}>
                    <span>{k}</span>
                    <b>{v}</b>
                  </div>
                ))}
              </div>
              <div className="result-actions">
                <button
                  className="download"
                  onClick={async () => {
                    const blob = await (await fetch(image)).blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `pixelscope-${config.seed}.${imageExtension(blob.type)}`;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }}
                >
                  <DownloadSimple size={15} />
                  Download
                </button>
                <button
                  aria-label="Copy prompt"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(config.prompt)
                      .then(() => setCopied(true));
                  }}
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                </button>
              </div>
              <div className="safety-note">
                <Check size={12} />
                <span>
                  {config.mode === "mock"
                    ? "Safety step: illustrative. Demo asset reviewed."
                    : "Provider safety systems enabled. No internal safety result is inferred."}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
      {config.mode === "mock" && !decode && !editing && (
        <div className="process-note">
          <span className="note-line" />
          <p>
            Prerecorded Demo preview. Presets select matching imagery; custom
            prompts need Lab or Live API for a newly generated image.
          </p>
        </div>
      )}
    </div>
  );
}
