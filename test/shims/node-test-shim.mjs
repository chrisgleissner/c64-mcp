import { test as bunTest } from "bun:test";

function runCleanups(cleanups) {
  for (const fn of cleanups.splice(0, cleanups.length)) {
    try {
      const r = fn();
      if (r && typeof r.then === "function") {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        r.catch(() => {});
      }
    } catch {}
  }
}

export default function test(name, fn) {
  if (typeof name !== "string" || typeof fn !== "function") {
    throw new TypeError("node:test shim only supports (name: string, fn: Function)");
  }
  bunTest(name, async () => {
    const cleanups = [];
    let skipped = false;

    const makeT = () => ({
      test: async (subName, subFn) => {
        // Execute subtests inline to avoid nested test() which Bun doesn't support yet
        await subFn(makeT());
      },
      after: (cb) => {
        if (typeof cb === "function") cleanups.push(cb);
      },
      skip: (_msg) => {
        // Mark as skipped by short-circuiting; Bun does not support dynamic skip
        skipped = true;
      },
    });

    const t = makeT();
    if (skipped) return;
    await fn(t);
    runCleanups(cleanups);
  });
}
export { default as test };
