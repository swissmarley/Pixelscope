import { describe, it, expect } from "vitest";
import { Scheduler } from "../src/core/scheduler";
import { sigmaAt, cfg, noising, random, gaussian } from "../src/core/math";
import type { PipelineEvent } from "../src/core/types";
const events: PipelineEvent[] = ["request", "tokens", "denoise", "denoise"].map(
  (stage, i) => ({
    id: String(i),
    stage: stage as PipelineEvent["stage"],
    duration: 400,
    elapsed: i * 400,
    provenance: "illustrative",
    type: "sent",
    model: "test",
  }),
);
describe("Scheduler", () => {
  it("scales elapsed time by speed and preserves accumulated progress", () => {
    const s = new Scheduler();
    s.load(events);
    s.toggle();
    s.tick(1000);
    expect(s.index).toBe(0);
    s.tick(600);
    expect(s.index).toBe(1);
    s.setSpeed(2);
    s.tick(200);
    expect(s.index).toBe(2);
  });
  it("pauses, steps, clamps scrub and moves by stages", () => {
    const s = new Scheduler();
    s.load(events);
    s.toggle();
    s.pause();
    s.tick(2000);
    expect(s.index).toBe(0);
    s.step(1);
    expect(s.index).toBe(1);
    s.stage(1);
    expect(s.index).toBe(2);
    s.scrub(500);
    expect(s.index).toBe(3);
    s.stage(-1);
    expect(s.index).toBe(1);
    s.scrub(-1);
    expect(s.index).toBe(0);
  });
  it("auto pauses on a stage boundary and consumes multiple events", () => {
    const s = new Scheduler();
    s.load(events);
    s.autoPause = true;
    s.toggle();
    s.tick(4000);
    expect(s.index).toBe(1);
    expect(s.playing).toBe(false);
    s.autoPause = false;
    s.toggle();
    s.tick(10000);
    expect(s.index).toBe(3);
  });
});
describe("math", () => {
  it("schedule decreases monotonically to zero", () => {
    const a = Array.from({ length: 25 }, (_, i) => sigmaAt(i, 24));
    expect(a[0]).toBe(1);
    expect(a[24]).toBe(0);
    expect(a.every((v, i) => i === 0 || v <= a[i - 1])).toBe(true);
  });
  it("CFG interpolates and extrapolates", () => {
    expect(cfg(2, 4, 0)).toBe(2);
    expect(cfg(2, 4, 1)).toBe(4);
    expect(cfg(2, 4, 7.5)).toBe(17);
  });
  it("noising endpoints and seeded Gaussian reproducibility", () => {
    expect(noising(4, 2, 1)).toBe(4);
    expect(noising(4, 2, 0)).toBe(2);
    expect(gaussian(random(5))).toBe(gaussian(random(5)));
  });
});
