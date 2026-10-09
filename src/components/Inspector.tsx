import { useState } from "react";
import { BracketsCurly, Info, ArrowUpRight } from "@phosphor-icons/react";
import katex from "katex";
import type { PipelineEvent } from "../core/types";
import { explanation } from "../core/explain";
export default function Inspector({
  event,
  math,
  setMath,
}: {
  event: PipelineEvent;
  math: boolean;
  setMath: (v: boolean) => void;
}) {
  const [raw, setRaw] = useState(false);
  const info = explanation[event.stage];
  const safeEvent = JSON.parse(
    JSON.stringify(event, (_, v: unknown) =>
      typeof v === "string" && v.length > 240
        ? `${v.slice(0, 80)}… [image data omitted]`
        : v,
    ),
  ) as unknown;
  return (
    <aside className="inspector" aria-label="Inside the model">
      <div className="inspector-title">
        <Info size={16} />
        <span>Inside the model</span>
        <span className="live-dot" />
      </div>
      <div className="inspector-tabs">
        <button className={!raw ? "active" : ""} onClick={() => setRaw(false)}>
          The explanation
        </button>
        <button className={raw ? "active" : ""} onClick={() => setRaw(true)}>
          <BracketsCurly size={13} />
          Event JSON
        </button>
      </div>
      {raw ? (
        <pre className="event-json">{JSON.stringify(safeEvent, null, 2)}</pre>
      ) : (
        <>
          <div className="inspector-icon">
            <Info size={23} />
          </div>
          <h3>What’s happening?</h3>
          <p>{info.short}</p>
          <div className="inspector-note">
            <span
              className={`badge ${event.provenance === "illustrative" ? "illustrative" : ""}`}
            >
              {event.provenance === "illustrative"
                ? "Illustrative data"
                : "Observed data"}
            </span>
            <p>
              {event.provenance === "illustrative"
                ? "A visual explanation, not measurements from a real model."
                : "Captured from the local model or returned by the provider."}
            </p>
          </div>
          <details open>
            <summary>
              Go a little deeper <ArrowUpRight size={13} />
            </summary>
            <p>{info.deep}</p>
          </details>
          <div className="math-toggle">
            <span>Show the math</span>
            <button
              role="switch"
              aria-checked={math}
              aria-label="Show the math"
              className={`switch ${math ? "on" : ""}`}
              onClick={() => setMath(!math)}
            >
              <span />
            </button>
          </div>
          {math && (
            <div
              className="equation"
              dangerouslySetInnerHTML={{
                __html: katex.renderToString(info.equation, {
                  throwOnError: false,
                  displayMode: true,
                }),
              }}
            />
          )}
          <div className="inspector-bottom">
            <span>LEARNING TIP</span>
            <p>Pause anywhere. Every event is a moment you can explore.</p>
            <div>
              <kbd>SPACE</kbd> pause <kbd>← →</kbd> step
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
