import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { metaModule } from "../src/tools/meta.js";

function createLogger() {
  return { debug() {}, info() {}, warn() {}, error() {} };
}

function tmpPath(name) {
  const dir = path.resolve("/workspace/.tmp-meta-tests");
  return { dir, file: path.join(dir, name) };
}

await fs.mkdir("/workspace/.tmp-meta-tests", { recursive: true });

// --- firmware_info_and_healthcheck ---

test("firmware_info_and_healthcheck reports healthy when endpoints work", async () => {
  const ctx = {
    client: {
      async version() { return { version: "1.0.0" }; },
      async info() { return { device: "u64" }; },
      async readMemory() { return { success: true, data: "$00", details: { address: "0000", length: 1 } }; },
    },
    logger: createLogger(),
  };
  const res = await metaModule.invoke("firmware_info_and_healthcheck", {}, ctx);
  assert.equal(res.structuredContent?.type, "json");
  assert.equal(res.metadata?.success, true);
  assert.equal(res.structuredContent?.data?.isHealthy, true);
});

test("firmware_info_and_healthcheck reports unhealthy on failures", async () => {
  const ctx = {
    client: {
      async version() { throw new Error("offline"); },
      async info() { return { device: "u64" }; },
      async readMemory() { return { success: true, data: "$00" }; },
    },
    logger: createLogger(),
  };
  const res = await metaModule.invoke("firmware_info_and_healthcheck", {}, ctx);
  assert.equal(res.metadata?.success, false);
  assert.equal(res.structuredContent?.data?.isHealthy, false);
});

// --- wait_for_screen_text ---

test("wait_for_screen_text resolves when pattern appears", async () => {
  let calls = 0;
  const ctx = {
    client: {
      async readScreen() { calls += 1; return calls < 2 ? "booting..." : "READY."; },
    },
    logger: createLogger(),
  };
  const res = await metaModule.invoke("wait_for_screen_text", { pattern: "READY.", timeoutMs: 500, intervalMs: 10 }, ctx);
  assert.equal(res.metadata?.success, true);
  const body = res.structuredContent?.data;
  assert.equal(body?.matched, true);
  assert.ok(body?.elapsedMs >= 0);
});

test("wait_for_screen_text fails on timeout", async () => {
  const ctx = {
    client: { async readScreen() { return "never"; } },
    logger: createLogger(),
  };
  const res = await metaModule.invoke("wait_for_screen_text", { pattern: "READY.", timeoutMs: 50, intervalMs: 5 }, ctx);
  assert.equal(res.isError, true);
  assert.equal(res.metadata?.error?.kind, "execution");
});

// --- verify_and_write_memory ---

test("verify_and_write_memory writes and verifies", async () => {
  let written = false;
  let paused = false;
  let resumed = false;
  const ctx = {
    client: {
      async pause() { paused = true; return { success: true }; },
      async resume() { resumed = true; return { success: true }; },
      async readMemory(addr, len) {
        if (!written) return { success: true, data: "$0000" };
        return { success: true, data: "$AA55" };
      },
      async writeMemory(addr, bytes) { assert.equal(bytes, "$AA55"); written = true; return { success: true }; },
    },
    logger: createLogger(),
  };
  const res = await metaModule.invoke("verify_and_write_memory", { address: "$0400", expected: "$0000", bytes: "$AA55" }, ctx);
  assert.equal(res.metadata?.success, true);
  assert.equal(paused, true);
  assert.equal(resumed, true);
});

test("verify_and_write_memory aborts on pre-verify mismatch", async () => {
  let resumed = false;
  const ctx = {
    client: {
      async pause() { return { success: true }; },
      async resume() { resumed = true; return { success: true }; },
      async readMemory() { return { success: true, data: "$0102" }; },
      async writeMemory() { throw new Error("should not write"); },
    },
    logger: createLogger(),
  };
  const res = await metaModule.invoke("verify_and_write_memory", { address: "$0400", expected: "$0000", bytes: "$AA55" }, ctx);
  assert.equal(res.isError, true);
  assert.equal(res.metadata?.error?.kind, "execution");
  assert.equal(resumed, true);
});

// --- background tasks ---

test("background tasks persist and complete iterations", async () => {
  const { file } = tmpPath("tasks.json");
  process.env.C64_TASK_STATE_FILE = file;
  const ctx = {
    client: {
      async readMemory(address, length) { return { success: true, data: "$00" }; },
    },
    logger: createLogger(),
  };

  let result = await metaModule.invoke("start_background_task", { name: "t1", operation: "read_memory", arguments: { address: "$0400", length: 1 }, intervalMs: 5, maxIterations: 2 }, ctx);
  assert.equal(result.metadata?.success, true);

  // wait for completion
  await new Promise((r) => setTimeout(r, 40));

  result = await metaModule.invoke("list_background_tasks", {}, ctx);
  const tasks = result.structuredContent?.data?.tasks;
  const t1 = tasks.find((t) => t.name === "t1");
  assert.ok(t1);
  assert.equal(t1.status === "completed" || t1.status === "stopped", true);

  const stopped = await metaModule.invoke("stop_background_task", { name: "t1" }, ctx);
  assert.equal(stopped.metadata?.success, true);

  const data = JSON.parse(await fs.readFile(file, "utf8"));
  assert.ok(Array.isArray(data.tasks));
});

// --- find_paths_by_name ---

test("find_paths_by_name filters by substring and extension", async () => {
  const ctx = {
    client: {
      async filesInfo() { return ["/games/demo.prg", "/games/other.crt", "/music/demo.sid"]; },
    },
    logger: createLogger(),
  };
  const res = await metaModule.invoke("find_paths_by_name", { root: "/", nameContains: "demo", extensions: ["prg", "sid"] }, ctx);
  assert.equal(res.metadata?.success, true);
  const results = res.structuredContent?.data?.results;
  assert.deepEqual(results.sort(), ["/games/demo.prg", "/music/demo.sid"].sort());
});

// --- memory_dump_to_file ---

test("memory_dump_to_file writes hex and manifest", async () => {
  const { file, dir } = tmpPath("dump.hex");
  const ctx = {
    client: {
      async pause() { return { success: true }; },
      async resume() { return { success: true }; },
      async readMemory(address, length) {
        const len = Number(length);
        const bytes = Array.from({ length: len }, (_, i) => i & 0xff);
        const hex = "$" + Buffer.from(bytes).toString("hex").toUpperCase();
        return { success: true, data: hex };
      },
    },
    logger: createLogger(),
  };
  const res = await metaModule.invoke("memory_dump_to_file", { address: "$C000", length: 32, outputPath: file, format: "hex", chunkSize: 8 }, ctx);
  assert.equal(res.metadata?.success, true);
  const stat = await fs.stat(file);
  assert.ok(stat.size > 0);
  const manifest = JSON.parse(await fs.readFile(`${file}.json`, "utf8"));
  assert.equal(manifest.length, 32);
  assert.ok(manifest.checksum);
});

// --- config_snapshot_and_restore ---

test("config_snapshot_and_restore snapshot and restore", async () => {
  const { file } = tmpPath("config-snapshot.json");
  let batchUpdated = false;
  const ctx = {
    client: {
      async version() { return { version: "1.0.0" }; },
      async info() { return { device: "u64" }; },
      async configsList() { return { categories: ["Audio"] }; },
      async configGet(cat) { return cat === "Audio" ? { Volume: "10" } : {}; },
      async configBatchUpdate(payload) { batchUpdated = true; return { success: true }; },
      async configSaveToFlash() { return { success: true }; },
    },
    logger: createLogger(),
  };

  const snap = await metaModule.invoke("config_snapshot_and_restore", { action: "snapshot", path: file }, ctx);
  assert.equal(snap.metadata?.success, true);
  const content = JSON.parse(await fs.readFile(file, "utf8"));
  assert.ok(content.categories?.Audio);

  const restore = await metaModule.invoke("config_snapshot_and_restore", { action: "restore", path: file, applyToFlash: true }, ctx);
  assert.equal(restore.metadata?.success, true);
  assert.equal(batchUpdated, true);
});

