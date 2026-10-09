import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  CaretLeft,
  CaretRight,
} from "@phosphor-icons/react";
import { scheduler, useStore } from "../core/store";
export default function Transport() {
  const { events, index, playing, speed, receiving } = useStore();
  const lag = Math.max(
    0,
    ((events.at(-1)?.elapsed || 0) - (events[index]?.elapsed || 0)) / 1000,
  );
  return (
    <footer className="transport">
      <div className="transport-head">
        <span className="transport-label">THE JOURNEY</span>
        <span className="mono">
          {String(events.length ? index + 1 : 0).padStart(2, "0")} /{" "}
          {events.length} events
        </span>
        <span className="replay-lag">
          {receiving ? "Live buffer" : "Replay"} ·{" "}
          {events.length - index - 1 > 0
            ? `${Math.max(0, events.length - index - 1)} events queued`
            : "caught up"}
          {receiving && ` · ${lag.toFixed(1)}s behind`}
          {events.length - index - 1 > 0 && (
            <button onClick={() => scheduler.scrub(events.length - 1)}>
              Catch up
            </button>
          )}
        </span>
        <span className="shortcuts">
          SPACE to {playing ? "pause" : "play"} <kbd>←</kbd> <kbd>→</kbd> to
          step
        </span>
      </div>
      <div className="transport-controls">
        <button aria-label="Previous stage" onClick={() => scheduler.stage(-1)}>
          <SkipBack size={17} />
        </button>
        <button aria-label="Previous event" onClick={() => scheduler.step(-1)}>
          <CaretLeft size={17} />
        </button>
        <button
          className="play"
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => scheduler.toggle()}
        >
          {playing ? (
            <Pause weight="fill" size={19} />
          ) : (
            <Play weight="fill" size={19} />
          )}
        </button>
        <button aria-label="Next event" onClick={() => scheduler.step(1)}>
          <CaretRight size={17} />
        </button>
        <button aria-label="Next stage" onClick={() => scheduler.stage(1)}>
          <SkipForward size={17} />
        </button>
        <div className="timeline">
          <div className="markers">
            {events.map((e, i) => (
              <button
                key={e.id}
                // The timeline slider is the keyboard control; markers are for pointers.
                tabIndex={-1}
                aria-label={`Event ${i + 1}: ${e.stage}, ${e.type}`}
                title={`${e.stage}: ${e.type}`}
                className={`${i <= index ? "passed" : ""} ${i === index ? "current" : ""} ${i === 0 || e.stage !== events[i - 1].stage ? "stage-mark" : ""}`}
                onClick={() => scheduler.scrub(i)}
              />
            ))}
          </div>
          <input
            aria-label="Journey timeline"
            type="range"
            min={0}
            max={Math.max(0, events.length - 1)}
            value={index}
            onChange={(e) => scheduler.scrub(Number(e.target.value))}
          />
          <div className="timeline-labels">
            <span>Prompt</span>
            <span>Model internals</span>
            <span>Image</span>
          </div>
        </div>
        <label className="speed">
          <span>{speed}×</span>
          <input
            aria-label="Playback speed"
            type="range"
            min="0.1"
            max="4"
            step="0.05"
            value={speed}
            onChange={(e) => scheduler.setSpeed(Number(e.target.value))}
          />
        </label>
      </div>
    </footer>
  );
}
