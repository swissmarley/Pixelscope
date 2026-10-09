import { scheduler, useStore } from "../core/store";
import { MockSource } from "../core/sources";
import type { PipelineEvent, RunConfig } from "../core/types";
import { NoiseCanvas, EmbeddingMap } from "./Visual";
import Denoising from "./Denoising";
import Delivery from "./Delivery";
import Sequence from "./Sequence";
export default function Scene({
  event,
  events,
  config,
}: {
  event: PipelineEvent;
  events: PipelineEvent[];
  config: RunConfig;
}) {
  if (event.stage === "sequence") return <Sequence events={events} />;
  if (["decode", "edit", "delivery"].includes(event.stage))
    return <Delivery event={event} events={events} config={config} />;
  if (event.type === "denoise_step")
    return <Denoising event={event} config={config} events={events} />;
  const tokens = events.find((e) => e.type === "prompt_tokenized");
  const embedded = events.find((e) => e.type === "text_embedded");
  if (event.stage === "request")
    return (
      <div className="request-scene">
        <div className="flow-diagram">
          <div className="flow-end">
            <span className="flow-symbol">Aa</span>
            <b>Your prompt</b>
            <span>Human language</span>
          </div>
          <div className="flow-line">
            <span className="packet">↗</span>
          </div>
          <div className="model-box">
            <span className="model-core">✳</span>
            <b>{config.family === "hosted" ? "Hosted model" : "Image model"}</b>
            <span>
              {event.type === "sent" ? event.model : "Ready to receive"}
            </span>
          </div>
        </div>
        {config.family === "hosted" && (
          <div className="blackbox-note">
            <span className="badge">Architecture unknown</span>
            <h3>A request goes in. An image comes out.</h3>
            <p>
              Only returned data is observable. Explore diffusion or
              autoregressive generation as possible mechanisms in a separate
              illustrative demo.
            </p>
            <div>
              {(["diffusion", "autoregressive"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => {
                    const c = { ...config, mode: "mock" as const, family: f };
                    useStore.getState().setConfig(c);
                    void (async () => {
                      const list = [];
                      for await (const e of new MockSource().stream(
                        c,
                        new AbortController().signal,
                      ))
                        list.push(e);
                      scheduler.load(list);
                    })();
                  }}
                >
                  Explore {f}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="request-details">
          <div>
            <span className="eyebrow">A LITTLE STRUCTURE FOR YOUR IDEA</span>
            <h3>Words in. Possibilities out.</h3>
            <p>
              Your prompt travels with a few instructions. These become the
              starting conditions for the image.
            </p>
            <span className="badge">
              {event.provenance === "observed"
                ? "Actual request"
                : "Illustrative request"}
            </span>
          </div>
          <pre>
            {JSON.stringify(
              event.type === "request_built"
                ? event.request
                : {
                    status: "sent",
                    model: event.type === "sent" ? event.model : config.model,
                    prompt: config.prompt,
                  },
              null,
              2,
            )}
          </pre>
        </div>
      </div>
    );
  if (event.stage === "tokens")
    return (
      <div className="tokens-scene">
        <div className="big-prompt">“{config.prompt}”</div>
        <div className="token-connector">↓</div>
        <div className="tokens-grid">
          {tokens?.type === "prompt_tokenized" &&
            tokens.tokens.map((t, i) => (
              <button
                className={`token t${i % 4}`}
                key={i}
                title={`Token ID: ${t.id}`}
              >
                <span>{t.text}</span>
                <small>{t.id}</small>
              </button>
            ))}
        </div>
        <div className="scene-caption">
          <span className="mono">
            {tokens?.type === "prompt_tokenized"
              ? `${Math.min(tokens.total, tokens.limit)} / ${tokens.limit} tokens`
              : ""}
          </span>
          <span>
            {tokens?.type === "prompt_tokenized" && tokens.total > tokens.limit
              ? "Context limit reached; remaining tokens truncated."
              : "Special tokens mark the beginning and end. Remaining context is padded."}
          </span>
        </div>
      </div>
    );
  if (event.stage === "embeddings")
    return (
      <div className="embeddings-scene">
        <div>
          <span className="eyebrow">TOKEN × DIMENSION</span>
          <div className="matrix">
            {embedded?.type === "text_embedded" &&
              embedded.vectors.map((row, i) => (
                <div key={i}>
                  <span className="mono">
                    {tokens?.type === "prompt_tokenized"
                      ? tokens.tokens[i]?.text
                      : `t${i}`}
                  </span>
                  {row.slice(0, 32).map((v, j) => (
                    <i
                      key={j}
                      style={{
                        background:
                          v > 0
                            ? `rgba(175,154,249,${Math.max(0.12, Math.abs(v))})`
                            : `rgba(121,216,231,${Math.max(0.12, Math.abs(v))})`,
                      }}
                    />
                  ))}
                </div>
              ))}
          </div>
        </div>
        <div>
          <span className="eyebrow">MEANING, PROJECTED INTO 2D</span>
          <EmbeddingMap
            projection={
              embedded?.type === "text_embedded" ? embedded.projection : []
            }
          />
          <p className="muted">
            Many dimensions. One glimpse of their relationships.
          </p>
        </div>
      </div>
    );
  if (event.stage === "noise")
    return (
      <div className="noise-scene">
        <div className="image-frame">
          {event.type === "noise_initialized" && event.preview ? (
            <img
              className="observed-noise"
              src={event.preview}
              alt="Measured initial latent projection"
            />
          ) : (
            <NoiseCanvas seed={config.seed} />
          )}
          <span className="image-label">
            {event.provenance === "observed"
              ? "INITIAL LATENT · MEASURED PROJECTION"
              : "INITIAL LATENT · N(0, I)"}
          </span>
        </div>
        <div className="noise-description">
          <span className="eyebrow">A BLANK CANVAS, IN DISGUISE</span>
          <h3>
            Nothing.
            <br />
            And everything.
          </h3>
          <p>
            Every pixel you’ll see starts here, in a compact cloud of Gaussian
            noise.
          </p>
          <div className="metrics">
            <div>
              <b>{config.seed}</b>
              <span>Random seed</span>
            </div>
            <div>
              <b>64 × 64 × 4</b>
              <span>Latent dimensions</span>
            </div>
            <div>
              <b>512 × 512</b>
              <span>Output pixels</span>
            </div>
          </div>
          <span className="muted">
            Change the seed above to see a different starting point.
          </span>
        </div>
      </div>
    );
  return (
    <div className="coming-scene">
      <NoiseCanvas seed={config.seed} />
      <p>Pipeline event: {event.type}</p>
    </div>
  );
}
