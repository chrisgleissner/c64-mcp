/*
C64 MCP - Simple per-domain rate limiter
GPL-2.0-only
*/

export interface TimeSource {
  nowMs(): number;
  sleepMs(ms: number): Promise<void>;
}

export class RealTimeSource implements TimeSource {
  nowMs(): number {
    return Date.now();
  }
  async sleepMs(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Sliding-window rate limiter enforcing at most `maxPerSecond` events per key.
 */
export class SlidingWindowRateLimiter {
  private readonly maxPerSecond: number;
  private readonly timeSource: TimeSource;
  private readonly keyToTimestamps: Map<string, number[]> = new Map();

  constructor(maxPerSecond: number, timeSource: TimeSource = new RealTimeSource()) {
    this.maxPerSecond = maxPerSecond;
    this.timeSource = timeSource;
  }

  private pruneOld(key: string, now: number): void {
    const windowStart = now - 1000;
    const arr = this.keyToTimestamps.get(key);
    if (!arr) return;
    let startIdx = 0;
    while (startIdx < arr.length && arr[startIdx] < windowStart) startIdx++;
    if (startIdx > 0) arr.splice(0, startIdx);
  }

  /**
   * Wait until a token is available for the given key, then consume it.
   */
  async consume(key: string): Promise<void> {
    if (this.maxPerSecond === Infinity) return; // disabled
    if (this.maxPerSecond <= 0) throw new Error("maxPerSecond must be > 0 or Infinity");

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const now = this.timeSource.nowMs();
      const arr = this.keyToTimestamps.get(key) ?? [];
      this.pruneOld(key, now);
      const inWindow = arr.length;
      if (inWindow < this.maxPerSecond) {
        arr.push(now);
        this.keyToTimestamps.set(key, arr);
        return;
      }
      const oldest = arr[0];
      const waitMs = Math.max(0, 1000 - (now - oldest));
      await this.timeSource.sleepMs(Math.min(waitMs, 50));
    }
  }
}

/** Adaptive per-key rate limiter with decay and slow recovery. */
export interface AdaptiveLimiterOptions {
  minRps?: number; // default 1
  increaseIntervalMs?: number; // default 15000 (15s)
  increaseStep?: number; // default 1 rps per interval
}

export class AdaptiveRateLimiter {
  private readonly defaultRps: number;
  private readonly timeSource: TimeSource;
  private readonly keyToTimestamps: Map<string, number[]> = new Map();
  private readonly keyToRps: Map<string, number[]> = new Map(); // [currentRps]
  private readonly keyToLastAdjust: Map<string, number> = new Map();
  private readonly minRps: number;
  private readonly increaseIntervalMs: number;
  private readonly increaseStep: number;

  constructor(defaultRps: number, timeSource: TimeSource = new RealTimeSource(), opts: AdaptiveLimiterOptions = {}) {
    if (!(defaultRps > 0)) throw new Error("defaultRps must be > 0");
    this.defaultRps = defaultRps;
    this.timeSource = timeSource;
    this.minRps = opts.minRps ?? 1;
    this.increaseIntervalMs = opts.increaseIntervalMs ?? 15000;
    this.increaseStep = opts.increaseStep ?? 1;
  }

  private pruneOld(key: string, now: number): void {
    const arr = this.keyToTimestamps.get(key);
    if (!arr || arr.length === 0) return;
    const cutoff = now - 1000;
    let i = 0;
    while (i < arr.length && arr[i] < cutoff) i++;
    if (i > 0) arr.splice(0, i);
  }

  private currentRps(key: string): number {
    const cur = this.keyToRps.get(key)?.[0];
    if (cur && cur > 0) return cur;
    this.keyToRps.set(key, [this.defaultRps]);
    return this.defaultRps;
  }

  /** Notify the limiter that throttling occurred, reducing RPS for the key. */
  notifyThrottle(key: string, factor: number = 0.5): void {
    const now = this.timeSource.nowMs();
    const cur = this.currentRps(key);
    const next = Math.max(this.minRps, Math.floor(cur * factor));
    this.keyToRps.set(key, [next]);
    this.keyToLastAdjust.set(key, now);
  }

  private maybeRecover(key: string, now: number): void {
    const cur = this.currentRps(key);
    if (cur >= this.defaultRps) return;
    const last = this.keyToLastAdjust.get(key) ?? 0;
    if (now - last >= this.increaseIntervalMs) {
      const next = Math.min(this.defaultRps, cur + this.increaseStep);
      this.keyToRps.set(key, [next]);
      this.keyToLastAdjust.set(key, now);
    }
  }

  /** Wait until a token is available for the given key, then consume it. */
  async consume(key: string): Promise<void> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const now = this.timeSource.nowMs();
      const arr = this.keyToTimestamps.get(key) ?? [];
      this.pruneOld(key, now);
      this.maybeRecover(key, now);
      const maxPerSecond = this.currentRps(key);
      if (arr.length < maxPerSecond) {
        arr.push(now);
        this.keyToTimestamps.set(key, arr);
        return;
      }
      const oldest = arr[0];
      const waitMs = Math.max(0, 1000 - (now - oldest));
      await this.timeSource.sleepMs(Math.min(waitMs, 10));
    }
  }
}
