import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve("test/tmp/meta");
await fs.mkdir(ROOT, { recursive: true });

export function createLogger() {
  return { debug() {}, info() {}, warn() {}, error() {} };
}

export function tmpPath(subdir, name) {
  const dir = path.join(ROOT, subdir);
  return { dir, file: path.join(dir, name) };
}

export async function waitForTaskCompletion(metaModule, name, ctx, { timeoutMs = 10000, pollIntervalMs = 20 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastMatch = null;
  while (Date.now() < deadline) {
    const result = await metaModule.invoke("list_background_tasks", {}, ctx);
    const tasks = result.structuredContent?.data?.tasks ?? [];
    const match = tasks.find((task) => task.name === name);
    if (match) {
      lastMatch = match;
      if (match.status !== "running") {
        return match;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  return lastMatch;
}
