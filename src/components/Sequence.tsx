import type { PipelineEvent } from "../core/types";
export default function Sequence({
  event,
  events,
}: {
  event: PipelineEvent;
  events: PipelineEvent[];
}) {
  const sampled = [...events]
    .reverse()
    .find((e) => e.type === "image_token_sampled");
  const progress = [...events]
    .reverse()
    .find((e) => e.type === "grid_progress");
  const filled =
    progress?.type === "grid_progress"
      ? progress.filled
      : sampled?.type === "image_token_sampled"
        ? sampled.position
        : 0;
  const image =
    progress?.type === "grid_progress" ? progress.preview : "/demo/final.webp";
  return (
    <div className="sequence-scene">
      <div className="sequence-layout">
        <div>
          <div className="preview-head">
            <span>IMAGE TOKEN GRID · 8 × 8</span>
            <span className="mono">{filled} / 64</span>
          </div>
          <div className="image-token-grid">
            {Array.from({ length: 64 }, (_, i) => (
              <div
                key={i}
                className={`${i < filled ? "filled" : ""} ${i === filled ? "sampling" : ""}`}
                style={
                  i < filled
                    ? {
                        backgroundImage: `url(${image})`,
                        backgroundSize: "800% 800%",
                        backgroundPosition: `${((i % 8) / 7) * 100}% ${(Math.floor(i / 8) / 7) * 100}%`,
                      }
                    : {}
                }
              >
                <span>
                  {i === filled
                    ? "…"
                    : i < filled
                      ? ""
                      : String(i).padStart(2, "0")}
                </span>
              </div>
            ))}
          </div>
          <p className="muted">
            Patch views are an analogy for discrete image tokens.
          </p>
        </div>
        <div className="candidate-panel">
          <span className="eyebrow">NEXT TOKEN CANDIDATES</span>
          <h3>
            {sampled?.type === "image_token_sampled"
              ? `Position ${sampled.position + 1}`
              : "Planning the grid"}
          </h3>
          <p>
            Each choice considers the prompt and everything generated so far.
          </p>
          {sampled?.type === "image_token_sampled" &&
            sampled.candidates.map((c, i) => (
              <div
                className={`candidate ${i === 0 ? "chosen" : ""}`}
                key={c.id}
              >
                <span
                  className="candidate-patch"
                  style={{
                    backgroundColor: c.color,
                    backgroundImage: `linear-gradient(135deg,transparent,${c.color}),url(${image})`,
                    backgroundSize: "cover",
                  }}
                />
                <div>
                  <b>Token {c.id}</b>
                  <span>{i === 0 ? "Sampled choice" : "Alternative"}</span>
                </div>
                <span className="mono">{Math.round(c.probability * 100)}%</span>
              </div>
            ))}
          <div className="context-size">
            <span>GROWING CONTEXT</span>
            <b>Prompt + {filled} image tokens</b>
            <div>
              {Array.from({ length: 32 }, (_, i) => (
                <i key={i} className={i < filled / 2 ? "filled" : ""} />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="family-comparison">
        <div>
          <span className="eyebrow">DIFFUSION</span>
          <h4>Refine the whole picture.</h4>
          <div className="parallel-diagram">
            {Array.from({ length: 4 }, (_, i) => (
              <span key={i} style={{ opacity: (i + 1) / 4 }}>
                ▦
              </span>
            ))}
          </div>
          <p>
            Updates the full latent at each step. Often efficient at
            synthesizing detailed textures; precise counts and lettering can be
            difficult.
          </p>
        </div>
        <div>
          <span className="eyebrow">AUTOREGRESSIVE · ILLUSTRATIVE</span>
          <h4>Build the sequence.</h4>
          <div className="sequential-diagram">
            {Array.from({ length: 12 }, (_, i) => (
              <span key={i} className={i < 7 ? "filled" : ""} />
            ))}
          </div>
          <p>
            Predicts tokens using prior context. Can model structured
            relationships, but sequential sampling may add latency. Capabilities
            depend on the specific model.
          </p>
        </div>
      </div>
    </div>
  );
}
