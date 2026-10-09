import { useEffect, useRef, useState } from "react";
import { X, ArrowRight, Check, Trash } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { RunConfig, SavedRun } from "../core/types";
import { useStore } from "../core/store";
import { demoAssetUrl, promptPresets } from "../core/presets";
import { serverUrlProblem } from "../core/settings";
import { MAX_SAVED_RUNS, storageUsage } from "../core/persistence";
export function Dialog({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const el = ref.current;
    el?.querySelector<HTMLElement>("button,input,select")?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === "Tab" && el) {
        const list = Array.from(
          el.querySelectorAll<HTMLElement>(
            "button,input,select,textarea,a[href]",
          ),
        ).filter((x) => !x.hasAttribute("disabled"));
        const first = list[0];
        const last = list.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={ref}
        className={`modal ${wide ? "history-modal" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function Settings({
  config,
  onChange,
  onClose,
}: {
  config: RunConfig;
  onChange: (c: Partial<RunConfig>) => void;
  onClose: () => void;
}) {
  const { autoPause, setAutoPause } = useStore();
  const proxyProblem = serverUrlProblem(config.proxyUrl);
  const labProblem = serverUrlProblem(config.labUrl);
  return (
    <Dialog title="Connection settings" onClose={onClose}>
      <p className="muted">
        Configure your local servers. API keys belong in the proxy’s .env file.
      </p>
      <label>
        Provider
        <select
          aria-label="Provider"
          value={config.provider}
          onChange={(e) =>
            onChange({
              provider: e.target.value as RunConfig["provider"],
              model:
                e.target.value === "openai"
                  ? "gpt-image-1"
                  : "gemini-2.5-flash-image",
            })
          }
        >
          <option value="openai">OpenAI</option>
          <option value="gemini">Google Gemini</option>
        </select>
      </label>
      <label>
        Hosted model
        <input
          aria-label="Hosted model"
          value={config.model}
          onChange={(e) => onChange({ model: e.target.value })}
        />
      </label>
      <label>
        Proxy URL
        <input
          aria-label="Proxy URL"
          type="url"
          value={config.proxyUrl}
          aria-invalid={Boolean(proxyProblem)}
          aria-describedby={proxyProblem ? "proxy-url-error" : undefined}
          onChange={(e) => onChange({ proxyUrl: e.target.value })}
        />
        {proxyProblem && (
          <small id="proxy-url-error" className="field-error">
            {proxyProblem}
          </small>
        )}
      </label>
      <label>
        Lab URL
        <input
          aria-label="Lab URL"
          type="url"
          value={config.labUrl}
          aria-invalid={Boolean(labProblem)}
          aria-describedby={labProblem ? "lab-url-error" : undefined}
          onChange={(e) => onChange({ labUrl: e.target.value })}
        />
        {labProblem && (
          <small id="lab-url-error" className="field-error">
            {labProblem}
          </small>
        )}
      </label>
      <div className="settings-grid">
        <label>
          Denoising steps
          <input
            aria-label="Denoising steps"
            type="number"
            min="1"
            max="50"
            value={config.steps}
            onChange={(e) =>
              onChange({
                steps: Math.max(1, Math.min(50, Number(e.target.value))),
              })
            }
          />
        </label>
        <label>
          Sampler
          <select
            aria-label="Sampler"
            value={config.sampler}
            onChange={(e) =>
              onChange({ sampler: e.target.value as RunConfig["sampler"] })
            }
          >
            <option>Euler</option>
            <option>DDIM</option>
          </select>
        </label>
        <label>
          Guidance (CFG)
          <input
            aria-label="Guidance scale (CFG)"
            type="number"
            min="0"
            max="15"
            step="0.5"
            value={config.guidance}
            onChange={(e) =>
              onChange({
                guidance: Math.max(
                  0,
                  Math.min(15, Number(e.target.value) || 0),
                ),
              })
            }
          />
        </label>
      </div>
      <label>
        Negative prompt
        <input
          aria-label="Negative prompt"
          value={config.negative}
          onChange={(e) => onChange({ negative: e.target.value })}
        />
      </label>
      <label className="check-setting">
        <input
          type="checkbox"
          checked={autoPause}
          onChange={(e) => setAutoPause(e.target.checked)}
        />
        Pause at each new stage
      </label>
      <div className="settings-note">
        SD-Turbo uses up to four steps with CFG disabled. For classic CFG in
        Local lab, load an SD 1.x model and set guidance above 1. Hosted
        providers receive their supported settings only. Demo presets use
        prerecorded previews; custom prompts use the alpine example. Settings
        are saved in this browser.
      </div>
      <button className="primary-button" onClick={onClose}>
        Done <Check size={14} />
      </button>
    </Dialog>
  );
}
export function History({
  runs,
  compare,
  setCompare,
  onReplay,
  onDelete,
  onClear,
  onClose,
}: {
  runs: SavedRun[];
  compare: SavedRun[];
  setCompare: (runs: SavedRun[]) => void;
  onReplay: (run: SavedRun) => void;
  onDelete: (run: SavedRun) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [usage, setUsage] = useState<number>();
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => {
    void storageUsage().then(setUsage);
  }, [runs]);
  return (
    <Dialog title="Run history" onClose={onClose} wide>
      <p className="muted">
        Saved in this browser, including every frame and any reference image.
        Select two runs to compare. The newest {MAX_SAVED_RUNS} runs are kept.
      </p>
      {runs.length > 0 && (
        <div className="history-tools">
          <span>
            {runs.length} {runs.length === 1 ? "run" : "runs"}
            {usage !== undefined &&
              ` · about ${(usage / 1024 / 1024).toFixed(1)} MB stored`}
          </span>
          {confirmClear ? (
            <>
              <span>Delete every saved run?</span>
              <button
                onClick={() => {
                  setConfirmClear(false);
                  onClear();
                }}
              >
                Delete all
              </button>
              <button onClick={() => setConfirmClear(false)}>Keep</button>
            </>
          ) : (
            <button onClick={() => setConfirmClear(true)}>
              <Trash size={13} /> Clear history
            </button>
          )}
        </div>
      )}
      {runs.length === 0 && (
        <p>Generate an image to save your first journey.</p>
      )}
      <div className="history-list">
        {runs.map((run) => (
          <div key={run.id}>
            <img src={run.thumbnail} alt={`Result for: ${run.config.prompt}`} />
            <div>
              <b>{run.config.prompt}</b>
              <span>
                {run.config.mode} · {run.config.family}
                {run.config.reference ? " · reference edit" : ""} ·{" "}
                {new Date(run.created).toLocaleString()}
              </span>
              <button onClick={() => onReplay(run)}>Replay</button>
              <button
                onClick={() =>
                  setCompare(
                    compare.some((c) => c.id === run.id)
                      ? compare.filter((c) => c.id !== run.id)
                      : [...compare.slice(-1), run],
                  )
                }
              >
                {compare.some((c) => c.id === run.id) ? "Selected" : "Compare"}
              </button>
              <button
                aria-label={`Delete run: ${run.config.prompt}`}
                onClick={() => onDelete(run)}
              >
                <Trash size={13} /> Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      {compare.length === 2 && (
        <div className="compare-grid">
          {compare.map((run) => (
            <figure key={run.id}>
              <img src={run.thumbnail} alt="Comparison result" />
              <figcaption>
                Seed {run.config.seed} · CFG {run.config.guidance}
                <br />
                {run.config.prompt}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </Dialog>
  );
}
const tourSteps = [
  {
    target: ".prompt-wrap",
    title: "Start with a little imagination.",
    text: "Write a prompt or choose a preset. Attach a reference image to explore editing.",
  },
  {
    target: ".mode-control",
    title: "Choose your window into the model.",
    text: "Demo works instantly. Lab captures a local diffusion model. Live API records observable provider output.",
  },
  {
    target: ".family-label",
    title: "Two ways to make an image.",
    text: "Diffusion refines the whole image. Our illustrative autoregressive track builds a token sequence.",
  },
  {
    target: ".progress-rail",
    title: "Follow the journey.",
    text: "Every stage stays clickable. Jump from your words to noise, refinement, and the finished image.",
  },
  {
    target: ".transport",
    title: "Time is yours to control.",
    text: "Play, pause, step, or scrub. Use Space and arrow keys. Brackets change playback speed.",
  },
  {
    target: ".inspector",
    title: "Understand every moment.",
    text: "Read the explanation, inspect an event, or turn on the math. Your runs are saved in local history.",
  },
];
export function Tour({
  step,
  onStep,
  onClose,
}: {
  step: number;
  onStep: (step: number) => void;
  onClose: () => void;
}) {
  const current = tourSteps[step];
  useEffect(() => {
    const target = document.querySelector(current.target);
    target?.classList.add("tour-highlight");
    return () => target?.classList.remove("tour-highlight");
  }, [current]);
  return (
    <aside
      className="tour-card"
      role="dialog"
      aria-label="Pixelscope guided tour"
    >
      <div>
        <span className="eyebrow">A QUICK LOOK AROUND · {step + 1} / 6</span>
        <button aria-label="Skip tour" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <h2>{current.title}</h2>
      <p>{current.text}</p>
      <footer>
        <button onClick={onClose}>Skip tour</button>
        <div className="tour-dots">
          {tourSteps.map((_, i) => (
            <button
              key={i}
              aria-label={`Tour step ${i + 1}`}
              className={step === i ? "active" : ""}
              onClick={() => onStep(i)}
            />
          ))}
        </div>
        <button
          className="primary-button"
          onClick={() => (step === 5 ? onClose() : onStep(step + 1))}
        >
          {step === 5 ? "Let’s explore" : "Next"}
          <ArrowRight size={14} />
        </button>
      </footer>
    </aside>
  );
}
export function Presets({
  onSelect,
  onClose,
}: {
  onSelect: (c: Partial<RunConfig>) => void;
  onClose: () => void;
}) {
  return (
    <Dialog title="Prompt presets" onClose={onClose}>
      <p className="muted">
        Each preset has a matching prerecorded Demo preview. Custom images are
        generated in Local lab or Live API.
      </p>
      <div className="presets-list">
        {promptPresets.map((p) => (
          <button
            key={p.name}
            onClick={async () => {
              let reference;
              if (p.reference) {
                const blob = await (
                  await fetch(demoAssetUrl(p.reference))
                ).blob();
                reference = await new Promise<string>((resolve) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(String(reader.result));
                  reader.readAsDataURL(blob);
                });
              }
              onSelect({ prompt: p.prompt, reference });
              onClose();
            }}
          >
            <span>
              <b>{p.name}</b>
              <small>{p.description}</small>
            </span>
            <ArrowRight size={15} />
          </button>
        ))}
      </div>
    </Dialog>
  );
}
