import test from "#test/runner";
import assert from "#test/assert";
import fs from "node:fs/promises";
import { toolRegistry } from "../src/tools/registry.js";
import { getPlatformStatus, setPlatform } from "../src/platform.js";
import { createLogger, tmpPath } from "./meta/helpers.mjs";

const originalPlatform = getPlatformStatus().id;

test.after(() => {
  setPlatform(originalPlatform);
});

test("grouped tools appear in registry list", () => {
  const toolNames = toolRegistry.list().map((descriptor) => descriptor.name);
  assert.ok(toolNames.includes("c64.program"), "c64.program should be registered");
  assert.ok(toolNames.includes("c64.memory"), "c64.memory should be registered");
  assert.ok(toolNames.includes("c64.sound"), "c64.sound should be registered");
  assert.ok(toolNames.includes("c64.system"), "c64.system should be registered");
});

test("c64.program run_prg delegates to legacy handler", async () => {
  const calls = [];
  const stubClient = {
    async runPrgFile(path) {
      calls.push({ method: "runPrgFile", path });
      return { success: true, details: {} };
    },
    async uploadAndRunBasic() {
      throw new Error("not used");
    },
    async uploadAndRunAsm() {
      throw new Error("not used");
    },
    async loadPrgFile() {
      throw new Error("not used");
    },
    async runCrtFile() {
      throw new Error("not used");
    },
  };

  const ctx = {
    client: stubClient,
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const result = await toolRegistry.invoke("c64.program", { op: "run_prg", path: "//USB0/demo.prg" }, ctx);
  assert.equal(result.isError, undefined);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "runPrgFile");
  assert.equal(calls[0].path, "//USB0/demo.prg");
});

test("c64.program upload_run_basic uses shared BASIC handler", async () => {
  const uploads = [];
  let screenReads = 0;
  const stubClient = {
    async runPrgFile() {
      throw new Error("not used");
    },
    async uploadAndRunBasic(program) {
      uploads.push(program);
      return { success: true };
    },
    async uploadAndRunAsm() {
      throw new Error("not used");
    },
    async loadPrgFile() {
      throw new Error("not used");
    },
    async runCrtFile() {
      throw new Error("not used");
    },
    async readScreen() {
      screenReads += 1;
      return "READY.\n";
    },
  };

  const ctx = {
    client: stubClient,
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const result = await toolRegistry.invoke(
    "c64.program",
    { op: "upload_run_basic", program: '10 PRINT "HI"\n20 END' },
    ctx,
  );

  assert.equal(result.isError, undefined);
  assert.equal(uploads.length, 1);
  assert.ok(screenReads >= 1);
});

test("c64.memory read delegates to legacy handler", async () => {
  const calls = [];
  const stubClient = {
    async readMemory(address, length) {
      calls.push({ method: "readMemory", address, length });
      return { success: true, data: "$AA", details: { address: "0400", length: 1 } };
    },
    async writeMemory() {
      throw new Error("not used");
    },
    async readScreen() {
      return "READY.";
    },
  };

  const ctx = {
    client: stubClient,
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const result = await toolRegistry.invoke("c64.memory", { op: "read", address: "$0400", length: 1 }, ctx);
  assert.equal(result.isError, undefined);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "readMemory");
  assert.equal(calls[0].address, "$0400");
  assert.equal(calls[0].length, "1");
});

test("c64.memory wait_for_text polls screen", async () => {
  let readCount = 0;
  const stubClient = {
    async readMemory() {
      throw new Error("not used");
    },
    async writeMemory() {
      throw new Error("not used");
    },
    async readScreen() {
      readCount += 1;
      return "READY.";
    },
  };

  const ctx = {
    client: stubClient,
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const result = await toolRegistry.invoke("c64.memory", { op: "wait_for_text", pattern: "READY." }, ctx);
  assert.equal(result.isError, undefined);
  assert.ok(readCount >= 1, "readScreen should be called at least once");
});

test("c64.memory write with verify pauses, writes, and resumes", async () => {
  const callLog = [];
  let readInvocation = 0;

  const stubClient = {
    async pause() {
      callLog.push("pause");
      return { success: true };
    },
    async resume() {
      callLog.push("resume");
      return { success: true };
    },
    async readMemory(address, length) {
      callLog.push({ method: "readMemory", address, length });
      readInvocation += 1;
      if (readInvocation === 1) {
        return { success: true, data: "$0000" };
      }
      return { success: true, data: "$ABCD" };
    },
    async writeMemory(address, bytes) {
      callLog.push({ method: "writeMemory", address, bytes });
      return { success: true, details: { address: "$0400", length: 2 } };
    },
    async readScreen() {
      throw new Error("not used");
    },
  };

  const ctx = {
    client: stubClient,
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const result = await toolRegistry.invoke(
    "c64.memory",
    { op: "write", address: "$0400", bytes: "$ABCD", verify: true },
    ctx,
  );

  assert.equal(result.isError, undefined);
  assert.equal(result.metadata?.verified, true);

  const callNames = callLog.map((entry) => (typeof entry === "string" ? entry : entry.method));
  assert.deepEqual(callNames.filter((name) => name === "pause"), ["pause"]);
  assert.deepEqual(callNames.filter((name) => name === "writeMemory"), ["writeMemory"]);
  assert.deepEqual(callNames.filter((name) => name === "resume"), ["resume"]);

  const readCalls = callLog.filter((entry) => typeof entry === "object" && entry.method === "readMemory");
  assert.equal(readCalls.length, 2, "should read before and after write when verify is true");
  assert.equal(readCalls[0].address, "$0400");
  assert.equal(readCalls[1].address, "$0400");
});

test("c64.sound note_on delegates to legacy handler", async () => {
  const calls = [];
  const stubClient = {
    async sidNoteOn(payload) {
      calls.push({ method: "sidNoteOn", payload });
      return { success: true };
    },
  };

  const ctx = {
    client: stubClient,
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const result = await toolRegistry.invoke(
    "c64.sound",
    { op: "note_on", voice: 2, note: "G4", waveform: "tri" },
    ctx,
  );

  assert.equal(result.isError, undefined);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "sidNoteOn");
  assert.equal(calls[0].payload.voice, 2);
  assert.equal(calls[0].payload.note, "G4");
});

test("c64.sound silence_all verify runs audio analyzer", async () => {
  const stubClient = {
    async sidSilenceAll() {
      return { success: true };
    },
    async recordAndAnalyzeAudio({ durationSeconds }) {
      return {
        analysis: {
          durationSeconds,
          global_metrics: {
            average_rms: 0.01,
            max_rms: 0.015,
          },
        },
      };
    },
  };

  const ctx = {
    client: stubClient,
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const result = await toolRegistry.invoke(
    "c64.sound",
    { op: "silence_all", verify: true },
    ctx,
  );

  assert.equal(result.isError, undefined);
  assert.equal(result.metadata?.verify, true);
  assert.equal(result.metadata?.verification?.silent, true);
  assert.ok(result.metadata?.verification?.maxRms <= 0.02);
});

test("c64.system reset delegates to machine control", async () => {
  const calls = [];
  const stubClient = {
    async reset() {
      calls.push("reset");
      return { success: true, details: {} };
    },
  };

  const ctx = {
    client: stubClient,
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const result = await toolRegistry.invoke("c64.system", { op: "reset" }, ctx);

  assert.equal(result.isError, undefined);
  assert.deepEqual(calls, ["reset"]);
  assert.equal(result.metadata?.success, true);
});

test("c64.system background task lifecycle proxies to meta tools", async () => {
  const { file, dir } = tmpPath("grouped-system", "tasks.json");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, JSON.stringify({ tasks: [] }, null, 2));
  const previous = process.env.C64_TASK_STATE_FILE;
  process.env.C64_TASK_STATE_FILE = file;

  try {
    const stubClient = {
      async readMemory() {
        return { success: true, data: "$00" };
      },
    };

    const ctx = {
      client: stubClient,
      rag: {},
      logger: createLogger(),
      platform: getPlatformStatus(),
      setPlatform,
    };

    const start = await toolRegistry.invoke(
      "c64.system",
      { op: "start_task", name: "grouped-task", operation: "read_memory", intervalMs: 10, maxIterations: 1 },
      ctx,
    );
    assert.equal(start.metadata?.success, true);

  await new Promise((resolve) => setTimeout(resolve, 50));

    const list = await toolRegistry.invoke("c64.system", { op: "list_tasks" }, ctx);
    assert.equal(list.metadata?.success, true);
    const tasks = list.structuredContent?.data?.tasks ?? [];
    const match = tasks.find((task) => task.name === "grouped-task");
    assert.ok(match, "background task should be present");

    const stop = await toolRegistry.invoke("c64.system", { op: "stop_all_tasks" }, ctx);
    assert.equal(stop.metadata?.success, true);
  } finally {
    if (previous === undefined) delete process.env.C64_TASK_STATE_FILE;
    else process.env.C64_TASK_STATE_FILE = previous;
  }
});
