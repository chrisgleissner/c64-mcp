import test from "#test/runner";
import assert from "#test/assert";
import { metaModule } from "../../src/tools/meta/index.js";
import { createLogger, tmpPath } from "./helpers.mjs";

test("bundle_run_artifacts captures screen and memory", async () => {
  const { dir } = tmpPath("artifacts", "bundle");
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
  const data = res.structuredContent?.data ?? {};
  assert.equal(data.runId, "test_001");
  assert.ok(data.artifacts?.screen);
  assert.ok(data.artifacts?.memory_range_0);
  assert.ok(data.artifacts?.debugreg);
});

test("bundle_run_artifacts works with minimal options", async () => {
  const { dir } = tmpPath("artifacts", "minimal");
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
  const data = res.structuredContent?.data ?? {};
  assert.equal(data.runId, "test_002");
});

test("bundle_run_artifacts handles errors gracefully", async () => {
  const { dir } = tmpPath("artifacts", "error");
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
