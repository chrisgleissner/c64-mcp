import test from "#test/runner";
import assert from "#test/assert";
import { toolRegistry } from "../src/tools/registry.js";
import { getPlatformStatus, setPlatform } from "../src/platform.js";

const originalPlatform = getPlatformStatus().id;

test.after(() => {
  setPlatform(originalPlatform);
});

test("grouped tools appear in registry list", () => {
  const toolNames = toolRegistry.list().map((descriptor) => descriptor.name);
  assert.ok(toolNames.includes("c64.program"), "c64.program should be registered");
  assert.ok(toolNames.includes("c64.memory"), "c64.memory should be registered");
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
