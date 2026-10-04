/**
 * A scheduler on virtual time. The website demo and tests use it so ten
 * minute timers can be fast-forwarded; the agent uses RealClock instead.
 */
export interface Clock {
  now(): Date;
  schedule(at: Date, key: string, fn: () => void | Promise<void>): void;
  cancel(key: string): void;
}

export class VirtualClock implements Clock {
  private t: number;
  private timers = new Map<string, { at: number; fn: () => void | Promise<void> }>();

  constructor(start: Date) {
    this.t = start.getTime();
  }

  now(): Date {
    return new Date(this.t);
  }

  schedule(at: Date, key: string, fn: () => void | Promise<void>): void {
    this.timers.set(key, { at: at.getTime(), fn });
  }

  cancel(key: string): void {
    this.timers.delete(key);
  }

  pending(): Array<{ key: string; at: Date }> {
    return [...this.timers].map(([key, v]) => ({ key, at: new Date(v.at) })).sort((a, b) => a.at.getTime() - b.at.getTime());
  }

  /** Moves time forward, firing due timers in order (including ones they schedule). */
  async advanceTo(target: Date): Promise<void> {
    const end = target.getTime();
    for (;;) {
      let next: [string, { at: number; fn: () => void | Promise<void> }] | undefined;
      for (const entry of this.timers) if (entry[1].at <= end && (!next || entry[1].at < next[1].at)) next = entry;
      if (!next) break;
      this.timers.delete(next[0]);
      this.t = Math.max(this.t, next[1].at);
      await next[1].fn();
    }
    this.t = Math.max(this.t, end);
  }

  advanceMinutes(minutes: number): Promise<void> {
    return this.advanceTo(new Date(this.t + minutes * 60_000));
  }
}

export class RealClock implements Clock {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  now(): Date {
    return new Date();
  }

  schedule(at: Date, key: string, fn: () => void | Promise<void>): void {
    this.cancel(key);
    const delay = Math.max(0, at.getTime() - Date.now());
    // setTimeout caps near 24.8 days; plans are same-day, so one hop is enough.
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        void Promise.resolve(fn()).catch((err) => console.error(`timer ${key} failed`, err));
      }, Math.min(delay, 2 ** 31 - 1)),
    );
  }

  cancel(key: string): void {
    const t = this.timers.get(key);
    if (t) clearTimeout(t);
    this.timers.delete(key);
  }
}
