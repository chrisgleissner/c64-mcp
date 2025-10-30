import test from "#test/runner";
import assert from "#test/assert";
import { metaModule } from "../../src/tools/meta/index.js";
import { createLogger } from "./helpers.mjs";

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

  const res = await metaModule.invoke("program_shuffle", { root: "/games", durationMs: 5, maxPrograms: 2, captureScreen: true }, ctx);
  assert.equal(res.metadata?.success, true);
  const data = res.structuredContent?.data ?? {};
  assert.equal(data.programs, 2);
  assert.equal(runPrgCount, 2);
  assert.equal(resetCount, 2);
  assert.ok(data.logPath);
});

test("program_shuffle handles no programs found", async () => {
  const ctx = {
    client: {
      async filesInfo() { return []; },
    },
    logger: createLogger(),
  };

  const res = await metaModule.invoke("program_shuffle", { root: "/empty", durationMs: 5 }, ctx);
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

  const res = await metaModule.invoke("program_shuffle", { root: "/games", extensions: ["prg"], durationMs: 5, captureScreen: false }, ctx);
  assert.equal(res.metadata?.success, true);
  const data = res.structuredContent?.data ?? {};
  assert.equal(data.errors, 1);
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

  const res = await metaModule.invoke("program_shuffle", { root: "/games", extensions: ["crt"], durationMs: 5, maxPrograms: 1 }, ctx);
  assert.equal(res.metadata?.success, true);
  const data = res.structuredContent?.data ?? {};
  assert.equal(data.programs, 1);
});

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
    durationMs: 5,
  }, ctx);

  assert.equal(res.metadata?.success, true);
  const data = res.structuredContent?.data ?? {};
  assert.equal(data.summary?.total, 1);
  assert.equal(data.summary?.passed, 1);
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
    durationMs: 5,
  }, ctx);

  assert.equal(res.metadata?.success, false);
  const data = res.structuredContent?.data ?? {};
  assert.equal(data.summary?.failed, 1);
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
    durationMs: 5,
  }, ctx);

  assert.equal(res.metadata?.success, true);
  const data = res.structuredContent?.data ?? {};
  assert.equal(data.summary?.passed, 1);
});

test("batch_run_with_assertions checks sid_silent assertion", async () => {
  const ctx = {
    client: {
      async runPrgFile() { return { success: true }; },
      async readMemory(addr) {
        if (addr === "$D404") return { success: true, data: "$00" };
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
    durationMs: 5,
  }, ctx);

  assert.equal(res.metadata?.success, true);
  const data = res.structuredContent?.data ?? {};
  assert.equal(data.summary?.passed, 1);
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
    durationMs: 5,
  }, ctx);

  assert.equal(res.metadata?.success, false);
  const data = res.structuredContent?.data ?? {};
  assert.equal(data.summary?.total, 2);
  assert.equal(data.summary?.errors, 1);
});
