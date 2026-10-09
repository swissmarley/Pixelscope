import { create } from "zustand";
import { defaultConfig, type RunConfig, type PipelineEvent } from "./types";
import { Scheduler } from "./scheduler";
import { pickSettings, sanitizeSettings } from "./settings";
interface State {
  config: RunConfig;
  autoPause: boolean;
  events: PipelineEvent[];
  index: number;
  playing: boolean;
  speed: number;
  receiving: boolean;
  error: string;
  /** Whether the current error can be fixed in Connection settings. */
  errorInSettings: boolean;
  setConfig: (c: Partial<RunConfig>) => void;
  setAutoPause: (b: boolean) => void;
  setReceiving: (b: boolean) => void;
  setError: (e: string, inSettings?: boolean) => void;
  sync: () => void;
}
const settingsKey = "pixelscope-settings";
function loadSettings() {
  try {
    const stored: unknown = JSON.parse(
      localStorage.getItem(settingsKey) || "{}",
    );
    const s = (stored || {}) as { config?: unknown; autoPause?: unknown };
    return {
      config: { ...defaultConfig, ...sanitizeSettings(s.config) },
      autoPause: s.autoPause === true,
    };
  } catch {
    return { config: defaultConfig, autoPause: false };
  }
}
const initial = loadSettings();
export const scheduler = new Scheduler(() => useStore.getState().sync());
scheduler.autoPause = initial.autoPause;
export const useStore = create<State>((set) => ({
  config: initial.config,
  autoPause: initial.autoPause,
  events: [],
  index: 0,
  playing: false,
  speed: 0.25,
  receiving: false,
  error: "",
  errorInSettings: false,
  setConfig: (c) => set((s) => ({ config: { ...s.config, ...c } })),
  setAutoPause: (autoPause) => {
    scheduler.autoPause = autoPause;
    set({ autoPause });
  },
  setReceiving: (receiving) => set({ receiving }),
  setError: (error, errorInSettings = false) => set({ error, errorInSettings }),
  sync: () =>
    set({
      events: [...scheduler.events],
      index: scheduler.index,
      playing: scheduler.playing,
      speed: scheduler.speed,
    }),
}));
// Save settings only when they change, not on every playback tick.
let saved = JSON.stringify({
  config: pickSettings(initial.config),
  autoPause: initial.autoPause,
});
useStore.subscribe((s, previous) => {
  if (s.config === previous.config && s.autoPause === previous.autoPause)
    return;
  const next = JSON.stringify({
    config: pickSettings(s.config),
    autoPause: s.autoPause,
  });
  if (next === saved) return;
  saved = next;
  try {
    localStorage.setItem(settingsKey, next);
  } catch {
    /* Settings still apply for this session. */
  }
});
