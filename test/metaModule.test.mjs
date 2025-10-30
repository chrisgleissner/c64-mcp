import test from "#test/runner";
import assert from "#test/assert";
import fs from "node:fs/promises";
import path from "node:path";
import { metaModule } from "../src/tools/meta/index.js";

function createLogger() {
  return { debug() {}, info() {}, warn() {}, error() {} };
}

function tmpPath(subdir, name) {
  const root = path.resolve("test/tmp/metaModule");
  const dir = path.join(root, subdir);
  return { dir, file: path.join(dir, name) };
}

await fs.mkdir("test/tmp/metaModule", { recursive: true });

async function waitForTaskCompletion(name, ctx, { timeoutMs = 10000, pollIntervalMs = 20 } = {}) {
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
  const { file, dir } = tmpPath("background", "tasks.json");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, JSON.stringify({ tasks: [] }, null, 2));
  process.env.C64_TASK_STATE_FILE = file;
  const ctx = {
    client: {
      async readMemory(address, length) { return { success: true, data: "$00" }; },
    },
    logger: createLogger(),
  };

  let result = await metaModule.invoke("start_background_task", { name: "t1", operation: "read_memory", arguments: { address: "$0400", length: 1 }, intervalMs: 5, maxIterations: 2 }, ctx);
  assert.equal(result.metadata?.success, true);

  const t1 = await waitForTaskCompletion("t1", ctx);
  assert.ok(t1, "background task t1 should be present after completion window");
  assert.ok(t1.status === "completed" || t1.status === "stopped", `unexpected status ${String(t1.status)}`);

  const stopped = await metaModule.invoke("stop_background_task", { name: "t1" }, ctx);
  assert.equal(stopped.metadata?.success, true);

  const data = JSON.parse(await fs.readFile(file, "utf8"));
  assert.ok(Array.isArray(data.tasks));
});

test("background tasks handle unknown operation and stop all", async () => {
  const { file, dir } = tmpPath("background2", "tasks.json");
  await fs.mkdir(dir, { recursive: true });
  process.env.C64_TASK_STATE_FILE = file;
  const ctx = { client: {}, logger: createLogger() };

  // start a task with unknown op (no-op) and then stop all
  let res = await metaModule.invoke("start_background_task", { name: "noop", operation: "unknown_op", intervalMs: 5, maxIterations: 1 }, ctx);
  assert.equal(res.metadata?.success, true);
  await new Promise((r) => setTimeout(r, 20));
  res = await metaModule.invoke("stop_all_background_tasks", {}, ctx);
  assert.equal(res.metadata?.success, true);
  const list = await metaModule.invoke("list_background_tasks", {}, ctx);
  assert.equal(list.metadata?.success, true);
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

test("find_paths_by_name supports object payload shape from firmware", async () => {
  const ctx = {
    client: {
      async filesInfo() { return { paths: ["/USB0/Demo1.PRG", "/USB0/Readme.TXT"] }; },
    },
    logger: createLogger(),
  };
  // case-insensitive search
  const res = await metaModule.invoke("find_paths_by_name", { root: "/USB0", nameContains: "demo", caseInsensitive: true }, ctx);
  assert.equal(res.metadata?.success, true);
  const results = res.structuredContent?.data?.results;
  assert.ok(results.includes("/USB0/Demo1.PRG"));
});

test("find_paths_by_name limits by maxResults and honors case sensitive flag", async () => {
  const paths = ["/a/demo.prg", "/b/DEMO.prg", "/c/demo.sid", "/d/other.txt"];
  const ctx = { client: { async filesInfo() { return paths; } }, logger: createLogger() };
  const res1 = await metaModule.invoke("find_paths_by_name", { root: "/", nameContains: "demo", maxResults: 2 }, ctx);
  assert.equal(res1.metadata?.count <= 2, true);
  const res2 = await metaModule.invoke("find_paths_by_name", { root: "/", nameContains: "DEMO", caseInsensitive: false }, ctx);
  const results2 = res2.structuredContent?.data?.results;
  // only exact-case match when caseInsensitive=false
  assert.deepEqual(results2, ["/b/DEMO.prg"]);
});

// --- memory_dump_to_file ---

test("memory_dump_to_file writes hex and manifest", async () => {
  const { file, dir } = tmpPath("memory", "dump.hex");
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
  const { file, dir } = tmpPath("config", "config-snapshot.json");
  await fs.mkdir(dir, { recursive: true });
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

test("config_snapshot_and_restore diff reports changes", async () => {
  const { file, dir } = tmpPath("config", "config-diff.json");
  await fs.mkdir(dir, { recursive: true });
  // Write a snapshot with one category
  const snapshot = {
    createdAt: new Date().toISOString(),
    version: { v: 1 },
    info: { device: "u64" },
    categories: { Audio: { Volume: "10" } },
  };
  await fs.writeFile(file, JSON.stringify(snapshot, null, 2), "utf8");

  const ctx = {
    client: {
      async configsList() { return { categories: ["Audio"] }; },
      async configGet(cat) { return cat === "Audio" ? { Volume: "11" } : {}; },
    },
    logger: createLogger(),
  };

  const res = await metaModule.invoke("config_snapshot_and_restore", { action: "diff", path: file }, ctx);
  assert.equal(res.metadata?.success, true);
  assert.equal(res.metadata?.changed, 1);
  const diff = res.structuredContent?.data?.diff;
  assert.ok(diff.Audio);
});

test("config_snapshot_and_restore validates snapshot input", async () => {
  const { file, dir } = tmpPath("config", "invalid.json");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, "not json", "utf8");
  const ctx = { client: {}, logger: createLogger() };
  const res = await metaModule.invoke("config_snapshot_and_restore", { action: "restore", path: file }, ctx);
  assert.equal(res.isError, true);
});

// --- Phase 1 tests ---

// --- program_shuffle ---

test("program_shuffle discovers and runs programs", async () => {
  let resetCount = 0;
  let runPrgCount = 0;
  const ctx = {
    client: {
      async filesInfo(pattern) {
        if (pattern.includes("prg")) return ["/games/demo1.prg", "/games/demo2.prg"];
        return [];
      },
      async runPrgFile() { runPrgCount += 1; return { success: true }; },
      async readScreen() { return "TEST SCREEN"; },
      async reset() { resetCount += 1; return { success: true }; },
    },
    logger: createLogger(),
  };
  
  const res = await metaModule.invoke("program_shuffle", { root: "/games", durationMs: 100, maxPrograms: 2, captureScreen: true }, ctx);
  assert.equal(res.metadata?.success, true);
  const data = res.structuredContent?.data;
  assert.equal(data?.programs, 2);
  assert.equal(runPrgCount, 2);
  assert.equal(resetCount, 2);
  assert.ok(data?.logPath);
});

test("program_shuffle handles no programs found", async () => {
  const ctx = {
    client: {
      async filesInfo() { return []; },
    },
    logger: createLogger(),
  };
  
  const res = await metaModule.invoke("program_shuffle", { root: "/empty", durationMs: 100 }, ctx);
  assert.equal(res.isError, true);
  assert.equal(res.metadata?.error?.kind, "execution");
});

test("program_shuffle handles program run errors gracefully", async () => {
  const ctx = {
    client: {
      async filesInfo() { return ["/games/broken.prg"]; },
      async runPrgFile() { throw new Error("run failed"); },
      async reset() { return { success: true }; },
    },
    logger: createLogger(),
  };
  
  const res = await metaModule.invoke("program_shuffle", { root: "/games", extensions: ["prg"], durationMs: 100, captureScreen: false }, ctx);
  assert.equal(res.metadata?.success, true);
  const data = res.structuredContent?.data;
  assert.equal(data?.errors, 1);
});

// --- batch_run_with_assertions ---

test("batch_run_with_assertions runs programs with assertions", async () => {
  const ctx = {
    client: {
      async runPrgFile() { return { success: true }; },
      async readScreen() { return "READY."; },
      async readMemory() { return { success: true, data: "$FF" }; },
      async reset() { return { success: true }; },
    },
    logger: createLogger(),
  };
  
  const res = await metaModule.invoke("batch_run_with_assertions", {
    programs: [
      { path: "/test.prg", assertions: [{ type: "screen_contains", pattern: "READY." }] },
    ],
    durationMs: 100,
  }, ctx);
  
  assert.equal(res.metadata?.success, true);
  const data = res.structuredContent?.data;
  assert.equal(data?.summary?.total, 1);
  assert.equal(data?.summary?.passed, 1);
});

test("batch_run_with_assertions detects assertion failures", async () => {
  const ctx = {
    client: {
      async runPrgFile() { return { success: true }; },
      async readScreen() { return "DIFFERENT TEXT"; },
      async reset() { return { success: true }; },
    },
    logger: createLogger(),
  };
  
  const res = await metaModule.invoke("batch_run_with_assertions", {
    programs: [
      { path: "/test.prg", assertions: [{ type: "screen_contains", pattern: "READY." }] },
    ],
    durationMs: 100,
  }, ctx);
  
  assert.equal(res.metadata?.success, false);
  const data = res.structuredContent?.data;
  assert.equal(data?.summary?.failed, 1);
});

test("batch_run_with_assertions validates memory_equals assertion", async () => {
  const ctx = {
    client: {
      async runPrgFile() { return { success: true }; },
      async readMemory(addr) {
        if (addr === "$0400") return { success: true, data: "$AA" };
        return { success: true, data: "$00" };
      },
      async reset() { return { success: true }; },
    },
    logger: createLogger(),
  };
  
  const res = await metaModule.invoke("batch_run_with_assertions", {
    programs: [
      { path: "/test.prg", assertions: [{ type: "memory_equals", address: "$0400", expected: "$AA" }] },
    ],
    durationMs: 100,
  }, ctx);
  
  assert.equal(res.metadata?.success, true);
  const data = res.structuredContent?.data;
  assert.equal(data?.summary?.passed, 1);
});

test("batch_run_with_assertions checks sid_silent assertion", async () => {
  const ctx = {
    client: {
      async runPrgFile() { return { success: true }; },
      async readMemory(addr) {
        if (addr === "$D404") return { success: true, data: "$00" }; // gate off
        return { success: true, data: "$00" };
      },
      async reset() { return { success: true }; },
    },
    logger: createLogger(),
  };
  
  const res = await metaModule.invoke("batch_run_with_assertions", {
    programs: [
      { path: "/test.prg", assertions: [{ type: "sid_silent" }] },
    ],
    durationMs: 100,
  }, ctx);
  
  assert.equal(res.metadata?.success, true);
  const data = res.structuredContent?.data;
  assert.equal(data?.summary?.passed, 1);
});

test("batch_run_with_assertions continues on error when flag set", async () => {
  let runCount = 0;
  const ctx = {
    client: {
      async runPrgFile() { 
        runCount += 1;
        if (runCount === 1) throw new Error("first failed");
        return { success: true };
      },
      async readScreen() { return "READY."; },
      async reset() { return { success: true }; },
    },
    logger: createLogger(),
  };
  
  const res = await metaModule.invoke("batch_run_with_assertions", {
    programs: [
      { path: "/test1.prg", assertions: [{ type: "screen_contains", pattern: "READY." }] },
      { path: "/test2.prg", assertions: [{ type: "screen_contains", pattern: "READY." }] },
    ],
    continueOnError: true,
    durationMs: 100,
  }, ctx);
  
  assert.equal(res.metadata?.success, false); // has errors
  const data = res.structuredContent?.data;
  assert.equal(data?.summary?.total, 2);
  assert.equal(data?.summary?.errors, 1);
});

// --- bundle_run_artifacts ---

test("bundle_run_artifacts captures screen and memory", async () => {
  const { file, dir } = tmpPath("artifacts", "bundle");
  const ctx = {
    client: {
      async readScreen() { return "CAPTURED SCREEN"; },
      async readMemory() { return { success: true, data: "$AABBCC" }; },
      async debugregRead() { return { value: "0000" }; },
    },
    logger: createLogger(),
  };
  
  const res = await metaModule.invoke("bundle_run_artifacts", {
    runId: "test_001",
    outputPath: dir,
    captureScreen: true,
    memoryRanges: [{ address: "$0400", length: 16 }],
    captureDebugReg: true,
  }, ctx);
  
  assert.equal(res.metadata?.success, true);
  const data = res.structuredContent?.data;
  assert.equal(data?.runId, "test_001");
  assert.ok(data?.artifacts?.screen);
  assert.ok(data?.artifacts?.memory_range_0);
  assert.ok(data?.artifacts?.debugreg);
});

test("bundle_run_artifacts works with minimal options", async () => {
  const { file, dir } = tmpPath("artifacts", "minimal");
  const ctx = {
    client: {
      async readScreen() { return "SCREEN"; },
      async debugregRead() { return { value: "0000" }; },
    },
    logger: createLogger(),
  };
  
  const res = await metaModule.invoke("bundle_run_artifacts", {
    runId: "test_002",
    outputPath: dir,
  }, ctx);
  
  assert.equal(res.metadata?.success, true);
  const data = res.structuredContent?.data;
  assert.equal(data?.runId, "test_002");
});

// --- compile_run_verify_cycle ---

test("compile_run_verify_cycle compiles and verifies BASIC", async () => {
  const { file, dir } = tmpPath("cycle", "basic");
  const ctx = {
    client: {
      async uploadAndRunBasic() { return { success: true }; },
      async readScreen() { return "HELLO WORLD"; },
    },
    logger: createLogger(),
  };
  
  const res = await metaModule.invoke("compile_run_verify_cycle", {
    sourceType: "basic",
    source: "10 PRINT \"HELLO WORLD\"",
    verifyScreen: "HELLO",
    durationMs: 100,
    outputPath: dir,
  }, ctx);
  
  assert.equal(res.metadata?.success, true);
  const data = res.structuredContent?.data;
  assert.equal(data?.compiled, true);
  assert.equal(data?.ran, true);
  assert.equal(data?.verified, true);
});

test("compile_run_verify_cycle handles ASM source", async () => {
  const { file, dir } = tmpPath("cycle", "asm");
  const ctx = {
    client: {
      async uploadAndRunAsm() { return { success: true }; },
      async readScreen() { return "ASM OUTPUT"; },
    },
    logger: createLogger(),
  };
  
  const res = await metaModule.invoke("compile_run_verify_cycle", {
    sourceType: "asm",
    source: "LDA #$00",
    verifyScreen: "ASM",
    durationMs: 100,
    outputPath: dir,
  }, ctx);
  
  assert.equal(res.metadata?.success, true);
  const data = res.structuredContent?.data;
  assert.equal(data?.compiled, true);
  assert.equal(data?.verified, true);
});

test("compile_run_verify_cycle detects verification failure", async () => {
  const { file, dir } = tmpPath("cycle", "fail");
  const ctx = {
    client: {
      async uploadAndRunBasic() { return { success: true }; },
      async readScreen() { return "WRONG OUTPUT"; },
    },
    logger: createLogger(),
  };
  
  const res = await metaModule.invoke("compile_run_verify_cycle", {
    sourceType: "basic",
    source: "10 PRINT \"TEST\"",
    verifyScreen: "EXPECTED",
    durationMs: 100,
    outputPath: dir,
  }, ctx);
  
  assert.equal(res.metadata?.success, false);
  const data = res.structuredContent?.data;
  assert.equal(data?.verified, false);
});

test("compile_run_verify_cycle handles SIDWAVE source", async () => {
  const { file, dir } = tmpPath("cycle", "sidwave");
  const ctx = {
    client: {
      async musicCompileAndPlay() { return { success: true }; },
      async readScreen() { return "SID PLAYING"; },
    },
    logger: createLogger(),
  };
  
  const res = await metaModule.invoke("compile_run_verify_cycle", {
    sourceType: "sidwave",
    source: "note C4 100",
    durationMs: 100,
    outputPath: dir,
  }, ctx);
  
  assert.equal(res.metadata?.success, true);
  const data = res.structuredContent?.data;
  assert.equal(data?.compiled, true);
});

test("compile_run_verify_cycle succeeds without verification", async () => {
  const { file, dir } = tmpPath("cycle", "noverify");
  const ctx = {
    client: {
      async uploadAndRunBasic() { return { success: true }; },
      async readScreen() { return "ANY OUTPUT"; },
    },
    logger: createLogger(),
  };
  
  const res = await metaModule.invoke("compile_run_verify_cycle", {
    sourceType: "basic",
    source: "10 PRINT \"TEST\"",
    durationMs: 100,
    outputPath: dir,
  }, ctx);
  
  assert.equal(res.metadata?.success, true);
  const data = res.structuredContent?.data;
  assert.equal(data?.compiled, true);
});

test("compile_run_verify_cycle handles compile errors", async () => {
  const { file, dir } = tmpPath("cycle", "error");
  const ctx = {
    client: {
      async uploadAndRunBasic() { throw new Error("compilation failed"); },
      async readScreen() { return "ERROR"; },
    },
    logger: createLogger(),
  };
  
  const res = await metaModule.invoke("compile_run_verify_cycle", {
    sourceType: "basic",
    source: "INVALID BASIC",
    durationMs: 100,
    outputPath: dir,
  }, ctx);
  
  assert.equal(res.isError, true);
  assert.equal(res.metadata?.error?.kind, "execution");
});

test("bundle_run_artifacts handles errors gracefully", async () => {
  const { file, dir } = tmpPath("artifacts", "error");
  const ctx = {
    client: {
      async readScreen() { throw new Error("screen read failed"); },
    },
    logger: createLogger(),
  };
  
  const res = await metaModule.invoke("bundle_run_artifacts", {
    runId: "test_error",
    outputPath: dir,
    captureScreen: true,
  }, ctx);
  
  assert.equal(res.isError, true);
});

test("program_shuffle with CRT files", async () => {
  const ctx = {
    client: {
      async filesInfo(pattern) {
        if (pattern.includes("crt")) return ["/games/demo.crt"];
        return [];
      },
      async runCrtFile() { return { success: true }; },
      async readScreen() { return "CRT SCREEN"; },
      async reset() { return { success: true }; },
    },
    logger: createLogger(),
  };
  
  const res = await metaModule.invoke("program_shuffle", { root: "/games", extensions: ["crt"], durationMs: 100, maxPrograms: 1 }, ctx);
  assert.equal(res.metadata?.success, true);
  const data = res.structuredContent?.data;
  assert.equal(data?.programs, 1);
});
