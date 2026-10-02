import { create } from "zustand";
import { defaultConfig, type RunConfig, type PipelineEvent } from "./types";
import { Scheduler } from "./scheduler";
interface State {
  config: RunConfig;
  events: PipelineEvent[];
  index: number;
  playing: boolean;
  speed: number;
  receiving: boolean;
  error: string;
  setConfig: (c: Partial<RunConfig>) => void;
  setReceiving: (b: boolean) => void;
  setError: (e: string) => void;
  sync: () => void;
}
export const scheduler = new Scheduler(() => useStore.getState().sync());
export const useStore = create<State>((set) => ({
  config: defaultConfig,
  events: [],
  index: 0,
  playing: false,
  speed: 0.25,
  receiving: false,
  error: "",
  setConfig: (c) => set((s) => ({ config: { ...s.config, ...c } })),
  setReceiving: (receiving) => set({ receiving }),
  setError: (error) => set({ error }),
  sync: () =>
    set({
      events: [...scheduler.events],
      index: scheduler.index,
      playing: scheduler.playing,
      speed: scheduler.speed,
    }),
}));
