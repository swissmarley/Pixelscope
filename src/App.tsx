import { useEffect, useState } from "react";
import { motion, MotionConfig } from "motion/react";
import {
  Aperture,
  ArrowUpRight,
  ClockCounterClockwise,
  GearSix,
  Question,
  Check,
  Waveform,
} from "@phosphor-icons/react";
import { scheduler, useStore } from "./core/store";
import { familyStages, stages, type SavedRun } from "./core/types";
import {
  clearRuns,
  deleteRuns,
  getRuns,
  releaseRuns,
} from "./core/persistence";
import { usePipeline } from "./core/usePipeline";
import { demoAssets } from "./core/presets";
import { Settings, History, Tour, Presets } from "./components/Overlays";
import Compose from "./components/Compose";
import Transport from "./components/Transport";
import Inspector from "./components/Inspector";
import Scene from "./components/Scene";
export default function App() {
  const {
    config,
    setConfig,
    events,
    index,
    playing,
    receiving,
    error,
    errorInSettings,
    setError,
  } = useStore();
  const { generate, runConfig, setRunConfig, cancel } = usePipeline();
  const [math, setMath] = useState(false);
  const [settings, setSettings] = useState(false);
  const [history, setHistory] = useState<SavedRun[] | null>(null);
  const [compare, setCompare] = useState<SavedRun[]>([]);
  const [presets, setPresets] = useState(false);
  const [tour, setTour] = useState<number | null>(null);
  useEffect(() => {
    try {
      if (!localStorage.getItem("pixelscope-tour")) setTour(0);
    } catch {
      /* Tour remains available through Help. */
    }
  }, []);
  const closeTour = () => {
    setTour(null);
    try {
      localStorage.setItem("pixelscope-tour", "complete");
    } catch {
      /* Storage is optional. */
    }
  };
  const event = events[index];
  const activeStages = familyStages(runConfig);
  const selected = stages.find((s) => s.id === event?.stage);
  const ordinal = activeStages.findIndex((s) => s.id === event?.stage) + 1;
  const pastStages = activeStages.filter(
    (stage) =>
      stage.id !== event?.stage &&
      events.findIndex((e) => e.stage === stage.id) >= 0 &&
      events.findIndex((e) => e.stage === stage.id) < index,
  );
  return (
    <MotionConfig reducedMotion="user">
      <div className="app">
        <header className="topbar">
          <a
            className="brand"
            href={import.meta.env.BASE_URL}
            aria-label="Pixelscope home"
          >
            <span className="brand-mark">
              <Aperture size={25} />
            </span>
            Pixelscope
          </a>
          <span className="brand-tagline">A look inside image generation.</span>
          <nav>
            <button
              onClick={() => {
                void getRuns()
                  .then(setHistory)
                  .catch(() =>
                    setError("Run history is unavailable in this browser."),
                  );
              }}
            >
              <ClockCounterClockwise size={17} />
              Run history
            </button>
            <button aria-label="Settings" onClick={() => setSettings(true)}>
              <GearSix size={19} />
            </button>
            <button aria-label="Help" onClick={() => setTour(0)}>
              <Question size={19} />
            </button>
          </nav>
        </header>
        <Compose
          generate={generate}
          presets={() => setPresets(true)}
          cancel={cancel}
          settings={() => setSettings(true)}
        />
        {error && (
          <div role="alert" className="error-banner">
            {error}{" "}
            {errorInSettings ? (
              <button onClick={() => setSettings(true)}>
                Connection settings
              </button>
            ) : (
              <button onClick={() => setError("")}>Dismiss</button>
            )}
          </div>
        )}
        <div className={`workspace ${!event ? "without-inspector" : ""}`}>
          <aside className="progress-rail" aria-label="Pipeline stages">
            <div className="rail-title">
              THE PIPELINE <span>{activeStages.length} stages</span>
            </div>
            {activeStages.map((stage, i) => {
              const first = events.findIndex((e) => e.stage === stage.id);
              const past = first >= 0 && first < index;
              return (
                <button
                  key={stage.id}
                  className={`rail-item ${event?.stage === stage.id ? "selected" : ""} ${past ? "completed" : ""}`}
                  onClick={() => first >= 0 && scheduler.scrub(first)}
                  disabled={first < 0}
                >
                  <span className="stage-number">
                    {past ? (
                      <Check size={12} />
                    ) : (
                      String(i + 1).padStart(2, "0")
                    )}
                  </span>
                  <span>{stage.short}</span>
                  {event?.stage === stage.id && (
                    <span className="rail-current" />
                  )}
                </button>
              );
            })}
            <div className="rail-bottom">
              <div className="mini-image">
                <img
                  src={demoAssets(runConfig.prompt).image}
                  alt="Current demo preview"
                />
              </div>
              <span>FROM IDEA TO IMAGE</span>
              <p>Watch a prompt turn from noise into an image.</p>
              <button
                onClick={() => {
                  scheduler.scrub(0);
                  scheduler.toggle();
                }}
              >
                Replay the journey <ArrowUpRight size={13} />
              </button>
            </div>
          </aside>
          <main className="journey">
            <div className="journey-top">
              <div>
                <span className="eyebrow">
                  {runConfig.family === "diffusion"
                    ? "THE DIFFUSION PROCESS"
                    : runConfig.family === "autoregressive"
                      ? "THE AUTOREGRESSIVE PROCESS"
                      : "THE OBSERVABLE PROCESS"}
                </span>
                <h1 aria-live="polite">
                  {selected?.title || "Ready when you are"}
                  <span className="scene-period">.</span>
                </h1>
              </div>
              <span className="stage-index">
                {String(ordinal).padStart(2, "0")}{" "}
                <span>/ {String(activeStages.length).padStart(2, "0")}</span>
              </span>
            </div>
            <div className="scene-subtitle">
              {event?.stage === "request"
                ? "An idea, a few instructions, and a world of possibilities."
                : "Slow it down. See what happens between the prompt and the pixels."}
            </div>
            {event ? (
              <motion.div
                className="scene"
                key={event.stage}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
              >
                <Scene
                  event={event}
                  events={events.slice(0, index + 1)}
                  config={{
                    ...runConfig,
                    seed:
                      event.stage === "noise" && runConfig.mode === "mock"
                        ? config.seed
                        : runConfig.seed,
                    guidance:
                      event.stage === "guidance"
                        ? config.guidance
                        : runConfig.guidance,
                  }}
                />
              </motion.div>
            ) : (
              <div className="waiting-scene">
                <Waveform size={34} />
                <h2>
                  {receiving
                    ? "Connecting to the model…"
                    : error
                      ? "The connection needs attention."
                      : "Your next journey starts here."}
                </h2>
                <p>
                  {receiving
                    ? "Events will appear as the server sends them. Model loading can take time."
                    : error
                      ? "Check your server connection in Settings, or explore the bundled demo right away."
                      : "Enter a prompt and press Generate to watch the pipeline unfold."}
                </p>
                {!receiving && (
                  <button
                    onClick={() =>
                      void generate(
                        { ...config, mode: "mock", family: "diffusion" },
                        false,
                      )
                    }
                  >
                    Open the demo <ArrowUpRight size={14} />
                  </button>
                )}
              </div>
            )}
            {event && (
              <div className="scene-footer">
                <span
                  className={`badge ${event.provenance === "illustrative" ? "illustrative" : ""}`}
                >
                  {event.provenance === "observed"
                    ? "Observed"
                    : "Illustrative"}{" "}
                  {runConfig.mode === "mock" ? "demo" : "event"}
                </span>
                <span>
                  {playing
                    ? "Playing the journey"
                    : receiving
                      ? "Receiving events"
                      : "Paused for exploration"}
                </span>
                <button onClick={() => scheduler.stage(1)}>
                  Next stage <ArrowUpRight size={13} />
                </button>
              </div>
            )}
            {pastStages.length > 0 && (
              <details className="completed-stages">
                <summary>
                  {pastStages.length} earlier stages · explore again
                </summary>
                {pastStages.map((stage) => (
                  <button
                    key={stage.id}
                    onClick={() =>
                      scheduler.scrub(
                        events.findIndex((e) => e.stage === stage.id),
                      )
                    }
                  >
                    <Check size={12} />
                    <span>{stage.title}</span>
                    <ArrowUpRight size={12} />
                  </button>
                ))}
              </details>
            )}
          </main>
          {event && <Inspector event={event} math={math} setMath={setMath} />}
        </div>
        <Transport />
        {history && (
          <History
            runs={history}
            compare={compare}
            setCompare={setCompare}
            onReplay={(run) => {
              releaseRuns(
                history.filter(
                  (r) => r.id !== run.id && !compare.some((c) => c.id === r.id),
                ),
              );
              cancel();
              setConfig(run.config);
              setRunConfig(run.config);
              scheduler.load(run.events);
              setHistory(null);
            }}
            onDelete={(run) => {
              void deleteRuns([run.id]).then(
                () => {
                  releaseRuns([run]);
                  setCompare(compare.filter((c) => c.id !== run.id));
                  setHistory(history.filter((r) => r.id !== run.id));
                },
                () => setError("This run could not be deleted."),
              );
            }}
            onClear={() => {
              void clearRuns().then(
                () => {
                  releaseRuns(history);
                  setCompare([]);
                  setHistory([]);
                },
                () => setError("Run history could not be cleared."),
              );
            }}
            onClose={() => {
              releaseRuns(
                history.filter((r) => !compare.some((c) => c.id === r.id)),
              );
              setHistory(null);
            }}
          />
        )}
        {settings && (
          <Settings
            config={config}
            onChange={setConfig}
            onClose={() => setSettings(false)}
          />
        )}{" "}
        {presets && (
          <Presets
            onSelect={(change) => {
              const next = { ...config, ...change };
              setConfig(next);
              if (next.mode === "mock") {
                const previousStage = event?.stage;
                void generate(next, false).then(() => {
                  if (useStore.getState().config.prompt !== next.prompt) return;
                  const nextIndex = scheduler.events.findIndex((e) =>
                    previousStage === "delivery"
                      ? e.type === "done"
                      : e.stage === previousStage,
                  );
                  if (nextIndex >= 0) scheduler.scrub(nextIndex);
                });
              }
            }}
            onClose={() => setPresets(false)}
          />
        )}{" "}
        {tour !== null && (
          <Tour step={tour} onStep={setTour} onClose={closeTour} />
        )}
      </div>
    </MotionConfig>
  );
}
