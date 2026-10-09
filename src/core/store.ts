import { create } from "zustand";
import { defaultConfig, type RunConfig, type PipelineEvent } from "./types";
import { Scheduler } from "./scheduler";
import { pickSettings, sanitizeProxyToken, sanitizeSettings } from "./settings";
interface State {
  config: RunConfig;
  autoPause: boolean;
  /** Sent to the proxy only; kept out of RunConfig so it never reaches the Lab or history. */
  proxyToken: string;
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
  setProxyToken: (token: string) => void;
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
    const s = (stored || {}) as {
      config?: unknown;
      autoPause?: unknown;
      proxyToken?: unknown;
    };
    return {
      config: { ...defaultConfig, ...sanitizeSettings(s.config) },
      autoPause: s.autoPause === true,
      proxyToken: sanitizeProxyToken(s.proxyToken),
    };
  } catch {
    return { config: defaultConfig, autoPause: false, proxyToken: "" };
  }
}
const initial = loadSettings();
export const scheduler = new Scheduler(() => useStore.getState().sync());
scheduler.autoPause = initial.autoPause;
export const useStore = create<State>((set) => ({
  config: initial.config,
  autoPause: initial.autoPause,
  proxyToken: initial.proxyToken,
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
  setProxyToken: (token) => set({ proxyToken: sanitizeProxyToken(token) }),
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
const persisted = (s: Pick<State, "config" | "autoPause" | "proxyToken">) =>
  JSON.stringify({
    config: pickSettings(s.config),
    autoPause: s.autoPause,
    proxyToken: s.proxyToken,
  });
let saved = persisted(initial);
useStore.subscribe((s, previous) => {
  if (
    s.config === previous.config &&
    s.autoPause === previous.autoPause &&
    s.proxyToken === previous.proxyToken
  )
    return;
  const next = persisted(s);
  if (next === saved) return;
  saved = next;
  try {
    localStorage.setItem(settingsKey, next);
  } catch {
    /* Settings still apply for this session. */
  }
});
