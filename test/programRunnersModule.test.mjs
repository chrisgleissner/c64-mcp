import test from "#test/runner";
import assert from "#test/assert";
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

test("load_prg_file returns structured content with path", async () => {
  const calls = [];
  const ctx = {
    client: {
      async loadPrgFile(path) {
        calls.push(path);
        return { success: true, details: { ok: true } };
      },
    },
    logger: createLogger(),
  };

  const result = await programRunnersModule.invoke(
    "load_prg_file",
    { path: "//USB0/demo.prg" },
    ctx,
  );

  assert.equal(result.isError, undefined);
  assert.ok(result.structuredContent && result.structuredContent.type === "json");
  const data = result.structuredContent.data;
  assert.equal(data.kind, "load_prg_file");
  assert.equal(data.format, "prg");
  assert.equal(data.path, "//USB0/demo.prg");
  assert.deepEqual(calls, ["//USB0/demo.prg"]);
});

test("run_prg_file returns structured content with path", async () => {
  const calls = [];
  const ctx = {
    client: {
      async runPrgFile(path) {
        calls.push(path);
        return { success: true, details: { ok: true } };
      },
    },
    logger: createLogger(),
  };

  const result = await programRunnersModule.invoke(
    "run_prg_file",
    { path: "//USB0/run.prg" },
    ctx,
  );

  assert.equal(result.isError, undefined);
  assert.ok(result.structuredContent && result.structuredContent.type === "json");
  const data = result.structuredContent.data;
  assert.equal(data.kind, "run_prg_file");
  assert.equal(data.format, "prg");
  assert.equal(data.path, "//USB0/run.prg");
  assert.deepEqual(calls, ["//USB0/run.prg"]);
});

test("run_crt_file returns structured content with path", async () => {
  const calls = [];
  const ctx = {
    client: {
      async runCrtFile(path) {
        calls.push(path);
        return { success: true, details: { ok: true } };
      },
    },
    logger: createLogger(),
  };

  const result = await programRunnersModule.invoke(
    "run_crt_file",
    { path: "//USB0/game.crt" },
    ctx,
  );

  assert.equal(result.isError, undefined);
  assert.ok(result.structuredContent && result.structuredContent.type === "json");
  const data = result.structuredContent.data;
  assert.equal(data.kind, "run_crt_file");
  assert.equal(data.format, "crt");
  assert.equal(data.path, "//USB0/game.crt");
  assert.deepEqual(calls, ["//USB0/game.crt"]);
});

test("upload_and_run_basic is available on vice", async () => {
  const calls = [];
  const ctx = {
    client: {
      async uploadAndRunBasic(program) {
        calls.push(program);
        return { success: true };
      },
      async readScreen() {
        return "READY.\n";
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
  // Structured output should be present with entryAddress and prgSize
  assert.ok(result.structuredContent && result.structuredContent.type === "json");
  const data = result.structuredContent.data;
  assert.equal(data.kind, "upload_and_run_basic");
  assert.equal(data.format, "prg");
  assert.ok(typeof data.entryAddress === "number");
  assert.ok(typeof data.prgSize === "number" && data.prgSize > 2);
  assert.equal(data.screen, "READY.\n");
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

test("load_prg_file reports firmware failure", async () => {
  const ctx = {
    client: {
      async loadPrgFile() {
        return { success: false, details: { error: "load error" } };
      },
    },
    logger: createLogger(),
  };

  const result = await programRunnersModule.invoke(
    "load_prg_file",
    { path: "//USB0/demo.prg" },
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
      async readScreen() {
        return "?SYNTAX ERROR IN 10\n";
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

test("upload_and_run_basic auto-fixes missing closing quote", async () => {
  const calls = [];
  const screens = [
    { kind: "value", value: "?SYNTAX ERROR IN 10\nREADY.\n" },
    { kind: "error", error: new Error("screen offline after retry") },
  ];
  const ctx = {
    client: {
      async uploadAndRunBasic(program) {
        calls.push(program);
        return { success: true };
      },
      async readScreen() {
        const next = screens.shift();
        if (!next) {
          return "READY.\n";
        }
        if (next.kind === "error") {
          throw next.error;
        }
        return next.value;
      },
    },
    logger: createLogger(),
  };

  const program = '10 PRINT "HELLO\n20 END';
  const result = await programRunnersModule.invoke(
    "upload_and_run_basic",
    { program },
    ctx,
  );

  assert.equal(result.isError, undefined);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].includes('10 PRINT "HELLO"'));
  assert.ok(result.content[0].text.includes("auto-fix"));
  assert.equal(result.metadata.autoFix.applied, true);
  assert.equal(result.metadata.autoFix.changes[0].line, 10);
  assert.ok(result.structuredContent && result.structuredContent.type === "json");
  const data = result.structuredContent.data;
  assert.equal(data.autoFix.changes[0].line, 10);
  assert.equal(data.autoFix.originalErrors[0].line, 10);
});

test("upload_and_run_basic verify true annotates metadata", async () => {
  const originalMax = process.env.C64BRIDGE_POLL_MAX_MS;
  const originalInterval = process.env.C64BRIDGE_POLL_INTERVAL_MS;
  process.env.C64BRIDGE_POLL_MAX_MS = "30";
  process.env.C64BRIDGE_POLL_INTERVAL_MS = "1";

  try {
    let screenReads = 0;
    const ctx = {
      client: {
        async uploadAndRunBasic() {
          return { success: true };
        },
        async readScreen() {
          screenReads += 1;
          return "READY.\n";
        },
      },
      logger: createLogger(),
    };

    const result = await programRunnersModule.invoke(
      "upload_and_run_basic",
      { program: '10 PRINT "HI"\n20 END', verify: true },
      ctx,
    );

    assert.equal(result.isError, undefined);
    assert.ok(screenReads >= 1);
    assert.equal(result.metadata.verified, true);
    assert.ok(result.structuredContent && result.structuredContent.type === "json");
    assert.equal(result.structuredContent.data.verified, true);
  } finally {
    if (originalMax === undefined) {
      delete process.env.C64BRIDGE_POLL_MAX_MS;
    } else {
      process.env.C64BRIDGE_POLL_MAX_MS = originalMax;
    }
    if (originalInterval === undefined) {
      delete process.env.C64BRIDGE_POLL_INTERVAL_MS;
    } else {
      process.env.C64BRIDGE_POLL_INTERVAL_MS = originalInterval;
    }
  }
});

test("upload_and_run_basic reports failure when auto-fix not possible", async () => {
  const ctx = {
    client: {
      async uploadAndRunBasic() {
        return { success: true };
      },
      async readScreen() {
        return "?TYPE MISMATCH ERROR IN 20\nREADY.\n";
      },
    },
    logger: createLogger(),
  };

  const result = await programRunnersModule.invoke(
    "upload_and_run_basic",
    { program: "10 PRINT 1\n20 PRINT \"A\"+5" },
    ctx,
  );

  assert.equal(result.isError, true);
  assert.equal(result.metadata.error.kind, "execution");
  assert.ok(result.content[0].text.includes("runtime errors"));
  assert.ok(result.structuredContent && result.structuredContent.type === "json");
  const data = result.structuredContent.data;
  assert.equal(data.autoFix.attempted, false);
  assert.equal(data.errors[0].line, 20);
  assert.ok(String(data.errors[0].text).includes("ERROR IN 20"));
});

test("upload_and_run_basic reports firmware failure after auto-fix retry", async () => {
  const uploads = [];
  const screens = [
    "?SYNTAX ERROR IN 10\nREADY.\n",
  ];
  const ctx = {
    client: {
      async uploadAndRunBasic(program) {
        uploads.push(program);
        if (uploads.length === 1) {
          return { success: true };
        }
        return { success: false, details: { error: "still broken" } };
      },
      async readScreen() {
        const value = screens.shift();
        if (value === undefined) return "READY.\n";
        return value;
      },
    },
    logger: createLogger(),
  };

  const program = '10 PRINT "HELLO\n20 END';
  const result = await programRunnersModule.invoke(
    "upload_and_run_basic",
    { program },
    ctx,
  );

  assert.equal(result.isError, true);
  assert.equal(result.metadata.error.kind, "execution");
  assert.ok(result.structuredContent && result.structuredContent.type === "json");
  const data = result.structuredContent.data;
  assert.equal(data.kind, "basic_runtime_error");
  assert.equal(data.autoFix.attempted, true);
  assert.equal(data.autoFix.failure.reason, "firmware_failure");
  assert.equal(data.autoFix.changes[0].line, 10);
  assert.equal(uploads.length, 2);
});

test("upload_and_run_basic reports remaining errors after auto-fix retry", async () => {
  const uploads = [];
  const screens = [
    "?SYNTAX ERROR IN 10\nREADY.\n",
    "?TYPE MISMATCH ERROR IN 10\nREADY.\n",
  ];
  const ctx = {
    client: {
      async uploadAndRunBasic(program) {
        uploads.push(program);
        return { success: true };
      },
      async readScreen() {
        const value = screens.shift();
        if (value === undefined) return "READY.\n";
        return value;
      },
    },
    logger: createLogger(),
  };

  const program = '10 PRINT "HELLO\n20 END';
  const result = await programRunnersModule.invoke(
    "upload_and_run_basic",
    { program },
    ctx,
  );

  assert.equal(result.isError, true);
  assert.equal(result.metadata.error.kind, "execution");
  assert.ok(result.structuredContent && result.structuredContent.type === "json");
  const data = result.structuredContent.data;
  assert.equal(data.kind, "basic_runtime_error");
  assert.equal(data.autoFix.attempted, true);
  assert.ok(Array.isArray(data.autoFix.resultingErrors));
  assert.equal(data.autoFix.resultingErrors[0].line, 10);
  assert.equal(uploads.length, 2);
});

test("upload_and_run_basic handles screen read failures without errors", async () => {
  const uploads = [];
  const ctx = {
    client: {
      async uploadAndRunBasic(program) {
        uploads.push(program);
        return { success: true };
      },
      async readScreen() {
        throw new Error("screen read failed");
      },
    },
    logger: createLogger(),
  };

  const program = '10 PRINT "HI"\n20 END';
  const result = await programRunnersModule.invoke(
    "upload_and_run_basic",
    { program },
    ctx,
  );

  assert.equal(result.isError, undefined);
  assert.ok(result.content[0].text.includes("BASIC program uploaded"));
  assert.equal(uploads.length, 1);
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
  // Should return an error with text message
  const text = String(result.content?.[0]?.text ?? "");
  assert.ok(text.length > 0);
});

test("upload_and_run_asm returns structured content on success", async () => {
  const calls = [];
  const ctx = {
    client: {
      async uploadAndRunAsm(program) {
        calls.push(program);
        return { success: true, details: { ok: true } };
      },
    },
    logger: createLogger(),
  };

  const result = await programRunnersModule.invoke(
    "upload_and_run_asm",
    { program: ".org $0801\n rts" },
    ctx,
  );

  assert.equal(result.isError, undefined);
  assert.ok(result.structuredContent && result.structuredContent.type === "json");
  const data = result.structuredContent.data;
  assert.equal(data.kind, "upload_and_run_asm");
  assert.equal(data.format, "prg");
  assert.ok(typeof data.entryAddress === "number");
  assert.ok(typeof data.prgSize === "number" && data.prgSize > 2);
  assert.equal(calls.length, 1);
});

test("upload_and_run_asm verify true annotates metadata", async () => {
  const originalMax = process.env.C64BRIDGE_POLL_MAX_MS;
  const originalInterval = process.env.C64BRIDGE_POLL_INTERVAL_MS;
  process.env.C64BRIDGE_POLL_MAX_MS = "40";
  process.env.C64BRIDGE_POLL_INTERVAL_MS = "1";

  try {
    let screenCall = 0;
    let lowMemCall = 0;
    const ctx = {
      client: {
        async uploadAndRunAsm() {
          return { success: true };
        },
        async readScreen() {
          screenCall += 1;
          return screenCall === 1 ? "RUN\n" : "READY.\n";
        },
        async readMemoryRaw(address, length) {
          if (address === 0xD000) {
            return new Uint8Array(length);
          }
          if (address === 0x0000) {
            const buffer = new Uint8Array(length);
            buffer[0xA0] = lowMemCall & 0xff;
            lowMemCall += 1;
            return buffer;
          }
          throw new Error(`unexpected address ${address}`);
        },
      },
      logger: createLogger(),
    };

    const asmSource = ".org $0801\nstart: lda #$00\n sta $0400\n rts";
    const result = await programRunnersModule.invoke(
      "upload_and_run_asm",
      { program: asmSource, verify: true },
      ctx,
    );

    assert.equal(result.isError, undefined);
    assert.equal(result.metadata.verified, true);
    assert.ok(result.structuredContent && result.structuredContent.type === "json");
    assert.equal(result.structuredContent.data.verified, true);
  } finally {
    if (originalMax === undefined) {
      delete process.env.C64BRIDGE_POLL_MAX_MS;
    } else {
      process.env.C64BRIDGE_POLL_MAX_MS = originalMax;
    }
    if (originalInterval === undefined) {
      delete process.env.C64BRIDGE_POLL_INTERVAL_MS;
    } else {
      process.env.C64BRIDGE_POLL_INTERVAL_MS = originalInterval;
    }
  }
});
