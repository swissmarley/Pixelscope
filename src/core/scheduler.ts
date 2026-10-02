import type { PipelineEvent } from "./types";
export class Scheduler {
  events: PipelineEvent[] = [];
  index = 0;
  speed = 0.25;
  playing = false;
  progress = 0;
  autoPause = false;
  constructor(private onChange: () => void = () => {}) {}
  load(events: PipelineEvent[]) {
    this.events = events;
    this.index = 0;
    this.progress = 0;
    this.playing = false;
    this.onChange();
  }
  append(event: PipelineEvent) {
    this.events.push(event);
    this.onChange();
  }
  setSpeed(speed: number) {
    this.speed = Math.max(0.1, Math.min(4, speed));
    this.onChange();
  }
  toggle() {
    if (this.index === this.events.length - 1 && !this.playing) this.index = 0;
    this.playing = !this.playing;
    this.onChange();
  }
  pause() {
    this.playing = false;
    this.onChange();
  }
  scrub(index: number) {
    this.index = Math.max(0, Math.min(this.events.length - 1, index));
    this.progress = 0;
    this.onChange();
  }
  step(delta: number) {
    this.pause();
    this.scrub(this.index + delta);
  }
  stage(delta: number) {
    const current = this.events[this.index]?.stage;
    if (delta > 0) {
      const next = this.events.findIndex(
        (e, i) => i > this.index && e.stage !== current,
      );
      this.step(
        next < 0 ? this.events.length - 1 - this.index : next - this.index,
      );
    } else {
      let i = this.index - 1;
      while (i >= 0 && this.events[i].stage === current) i--;
      const prior = this.events[i]?.stage;
      while (i > 0 && this.events[i - 1].stage === prior) i--;
      this.step(i - this.index);
    }
  }
  tick(ms: number) {
    if (!this.playing || !this.events[this.index]) return;
    this.progress += ms * this.speed;
    let changed = false;
    while (this.progress >= this.events[this.index].duration) {
      if (this.index >= this.events.length - 1) {
        this.progress = 0;
        break;
      }
      this.progress -= this.events[this.index].duration;
      const before = this.events[this.index].stage;
      this.index++;
      changed = true;
      if (this.autoPause && before !== this.events[this.index].stage) {
        this.playing = false;
        this.progress = 0;
        break;
      }
    }
    if (changed) this.onChange();
  }
  finish() {
    if (this.playing && this.index >= this.events.length - 1) {
      this.playing = false;
      this.onChange();
    }
  }
}
