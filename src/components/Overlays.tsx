import { useEffect, useRef } from "react";
import { X, ArrowRight, Check } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { RunConfig, SavedRun } from "../core/types";
import { scheduler } from "../core/store";
import { promptPresets } from "../core/presets";
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
          onChange={(e) => onChange({ proxyUrl: e.target.value })}
        />
      </label>
      <label>
        Lab URL
        <input
          aria-label="Lab URL"
          type="url"
          value={config.labUrl}
          onChange={(e) => onChange({ labUrl: e.target.value })}
        />
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
          defaultChecked={scheduler.autoPause}
          onChange={(e) => {
            scheduler.autoPause = e.target.checked;
          }}
        />
        Pause at each new stage
      </label>
      <div className="settings-note">
        SD-Turbo uses up to four steps with CFG disabled. Hosted providers
        receive their supported settings only. Demo presets use prerecorded
        previews; custom prompts use the alpine example.
      </div>
      <button className="primary-button" onClick={onClose}>
        Save settings <Check size={14} />
      </button>
    </Dialog>
  );
}
export function History({
  runs,
  compare,
  setCompare,
  onReplay,
  onClose,
}: {
  runs: SavedRun[];
  compare: SavedRun[];
  setCompare: (runs: SavedRun[]) => void;
  onReplay: (run: SavedRun) => void;
  onClose: () => void;
}) {
  return (
    <Dialog title="Run history" onClose={onClose} wide>
      <p className="muted">
        Saved locally, including every frame. Select two runs to compare.
      </p>
      {runs.length === 0 && (
        <p>Generate an image to save your first journey.</p>
      )}
      <div className="history-list">
        {runs.map((run) => (
          <div key={run.id}>
            <img src={run.thumbnail} alt="Saved run" />
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
                const blob = await (await fetch(p.reference)).blob();
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
