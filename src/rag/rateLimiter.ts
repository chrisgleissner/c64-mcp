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
