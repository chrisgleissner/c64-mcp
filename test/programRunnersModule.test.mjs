import test from "node:test";
import assert from "node:assert/strict";
import { programRunnersModule } from "../src/tools/programRunners.js";
import { ToolUnsupportedPlatformError } from "../src/tools/errors.js";

function createLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

test("run_prg_file executes via client", async () => {
  const calls = [];
  const ctx = {
    client: {
      async runPrgFile(path) {
        calls.push(path);
        return { success: true, details: { prgLength: 4096 } };
      },
    },
    logger: createLogger(),
  };

  const result = await programRunnersModule.invoke(
    "run_prg_file",
    { path: "//USB0/demo.prg" },
    ctx,
  );

  assert.equal(result.content[0].type, "text");
  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.path, "//USB0/demo.prg");
  assert.deepEqual(result.metadata.details, { prgLength: 4096 });
  assert.deepEqual(calls, ["//USB0/demo.prg"]);
});

test("upload_and_run_basic is available on vice", async () => {
  const calls = [];
  const ctx = {
    client: {
      async uploadAndRunBasic(program) {
        calls.push(program);
        return { success: true };
      },
    },
    logger: createLogger(),
    platform: { id: "vice", features: [], limitedFeatures: [] },
    setPlatform: () => ({ id: "vice", features: [], limitedFeatures: [] }),
  };

  const result = await programRunnersModule.invoke(
    "upload_and_run_basic",
    { program: '10 PRINT "HELLO"\n20 END' },
    ctx,
  );

  assert.equal(result.isError, undefined);
  assert.ok(result.content[0].text.includes("BASIC program uploaded"));
  assert.equal(calls.length, 1);
});

test("load_prg_file rejects vice platform", async () => {
  const ctx = {
    client: {
      async loadPrgFile() {
        throw new Error("should not execute on unsupported platform");
      },
    },
    logger: createLogger(),
    platform: { id: "vice", features: [], limitedFeatures: [] },
    setPlatform: () => ({ id: "vice", features: [], limitedFeatures: [] }),
  };

  await assert.rejects(
    () => programRunnersModule.invoke("load_prg_file", { path: "//USB0/demo.prg" }, ctx),
    ToolUnsupportedPlatformError,
  );
});

test("load_prg_file validates path", async () => {
  const ctx = {
    client: {
      async loadPrgFile() {
        throw new Error("should not run");
      },
    },
    logger: createLogger(),
  };

  const result = await programRunnersModule.invoke("load_prg_file", {}, ctx);
  assert.equal(result.isError, true);
  assert.equal(result.metadata.error.kind, "validation");
});

test("run_crt_file reports firmware failure", async () => {
  const ctx = {
    client: {
      async runCrtFile() {
        return { success: false, details: { code: "FAIL" } };
      },
    },
    logger: createLogger(),
  };

  const result = await programRunnersModule.invoke(
    "run_crt_file",
    { path: "//USB0/game.crt" },
    ctx,
  );

  assert.equal(result.isError, true);
  assert.equal(result.metadata.error.kind, "execution");
  assert.deepEqual(result.metadata.error.details, { code: "FAIL" });
});

test("run_prg_file reports firmware failure", async () => {
  const ctx = {
    client: {
      async runPrgFile() {
        return { success: false, details: { error: "prg error" } };
      },
    },
    logger: createLogger(),
  };

  const result = await programRunnersModule.invoke(
    "run_prg_file",
    { path: "//USB0/test.prg" },
    ctx,
  );

  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes("firmware reported failure"));
});

test("upload_and_run_basic validates program input", async () => {
  const ctx = {
    client: {
      async uploadAndRunBasic() {
        throw new Error("should not run");
      },
    },
    logger: createLogger(),
  };

  const result = await programRunnersModule.invoke("upload_and_run_basic", {}, ctx);

  assert.equal(result.isError, true);
  assert.equal(result.metadata.error.kind, "validation");
});

test("upload_and_run_basic handles firmware failure", async () => {
  const ctx = {
    client: {
      async uploadAndRunBasic() {
        return { success: false, details: { error: "upload failed" } };
      },
    },
    logger: createLogger(),
  };

  const result = await programRunnersModule.invoke(
    "upload_and_run_basic",
    { program: "10 PRINT" },
    ctx,
  );

  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes("firmware reported failure"));
});

test("upload_and_run_asm validates source input", async () => {
  const ctx = {
    client: {
      async uploadAndRunAsm() {
        throw new Error("should not run");
      },
    },
    logger: createLogger(),
  };

  const result = await programRunnersModule.invoke("upload_and_run_asm", {}, ctx);

  assert.equal(result.isError, true);
  assert.equal(result.metadata.error.kind, "validation");
});

test("upload_and_run_asm handles firmware failure", async () => {
  const ctx = {
    client: {
      async uploadAndRunAsm() {
        return { success: false, details: { error: "asm upload failed" } };
      },
    },
    logger: createLogger(),
  };

  const result = await programRunnersModule.invoke(
    "upload_and_run_asm",
    { program: "NOP" },
    ctx,
  );

  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes("firmware reported failure"));
});
