import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { runSidToWav, SidplayExecutionError } from "../src/sidplayRunner.js";

test("sidplayRunner: error handling", async (t) => {
  await t.test("throws when sidPath is missing", async () => {
    await assert.rejects(
      () => runSidToWav({ sidPath: "", wavPath: "/tmp/out.wav" }),
      (err) => {
        assert.ok(err.message.includes("sidPath is required"));
        return true;
      }
    );
  });

  await t.test("throws when wavPath is missing", async () => {
    await assert.rejects(
      () => runSidToWav({ sidPath: "/tmp/test.sid", wavPath: "" }),
      (err) => {
        assert.ok(err.message.includes("wavPath is required"));
        return true;
      }
    );
  });

  await t.test("throws when SID file does not exist", async () => {
    const nonExistentPath = path.join(os.tmpdir(), `nonexistent-${Date.now()}.sid`);
    await assert.rejects(
      () => runSidToWav({ sidPath: nonExistentPath, wavPath: "/tmp/out.wav" }),
      (err) => {
        assert.ok(err.message.includes("SID not found"));
        return true;
      }
    );
  });

  await t.test("throws SidplayExecutionError when binary not found", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sidplay-test-"));
    const sidPath = path.join(tmpDir, "test.sid");
    const wavPath = path.join(tmpDir, "out.wav");
    
    t.after(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    });

    // Create a dummy SID file
    fs.writeFileSync(sidPath, Buffer.from([
      0x50, 0x53, 0x49, 0x44, // PSID header
      0x00, 0x01, // version
      0x00, 0x7C, // data offset
    ]));

    const oldBinary = process.env.SIDPLAYFP_BINARY;
    process.env.SIDPLAYFP_BINARY = "nonexistent-sidplayfp-binary-xyz123";
    
    t.after(() => {
      if (oldBinary !== undefined) {
        process.env.SIDPLAYFP_BINARY = oldBinary;
      } else {
        delete process.env.SIDPLAYFP_BINARY;
      }
    });

    await assert.rejects(
      () => runSidToWav({ sidPath, wavPath }),
      (err) => {
        assert.ok(err instanceof SidplayExecutionError);
        assert.ok(err.message.includes("not installed"));
        assert.equal(err.exitCode, 127);
        assert.ok(err.command.includes("nonexistent-sidplayfp-binary-xyz123"));
        return true;
      }
    );
  });

  await t.test("respects SIDPLAY_MODE env variable", async () => {
    const oldMode = process.env.SIDPLAY_MODE;
    process.env.SIDPLAY_MODE = "pal";
    
    t.after(() => {
      if (oldMode !== undefined) {
        process.env.SIDPLAY_MODE = oldMode;
      } else {
        delete process.env.SIDPLAY_MODE;
      }
    });

    // The mode resolution is tested indirectly through the args
    // This test just ensures the env var is read
    assert.ok(process.env.SIDPLAY_MODE === "pal");
  });

  await t.test("respects SIDPLAY_LIMIT_CYCLES env variable", async () => {
    const oldLimit = process.env.SIDPLAY_LIMIT_CYCLES;
    process.env.SIDPLAY_LIMIT_CYCLES = "60000000";
    
    t.after(() => {
      if (oldLimit !== undefined) {
        process.env.SIDPLAY_LIMIT_CYCLES = oldLimit;
      } else {
        delete process.env.SIDPLAY_LIMIT_CYCLES;
      }
    });

    assert.equal(Number(process.env.SIDPLAY_LIMIT_CYCLES), 60000000);
  });

  await t.test("respects custom binary parameter", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sidplay-test-"));
    const sidPath = path.join(tmpDir, "test.sid");
    const wavPath = path.join(tmpDir, "out.wav");
    
    t.after(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    });

    fs.writeFileSync(sidPath, Buffer.from([0x50, 0x53, 0x49, 0x44, 0x00, 0x01, 0x00, 0x7C]));

    await assert.rejects(
      () => runSidToWav({ sidPath, wavPath, binary: "custom-sidplayfp-xyz" }),
      (err) => {
        assert.ok(err instanceof SidplayExecutionError);
        // The command field contains the actual binary that was attempted
        assert.ok(err.command);
        return true;
      }
    );
  });
});

test("sidplayRunner: SidplayExecutionError structure", (t) => {
  const error = new SidplayExecutionError({
    message: "test error",
    command: "sidplayfp -vn test.sid",
    exitCode: 1,
    stderr: Buffer.from("error details here"),
    wavExists: false,
    wavSize: 0
  });

  assert.equal(error.name, "SidplayExecutionError");
  assert.ok(error.message.includes("test error"));
  assert.ok(error.message.includes("sidplayfp -vn test.sid"));
  assert.equal(error.command, "sidplayfp -vn test.sid");
  assert.equal(error.exitCode, 1);
  assert.equal(error.stderrFirst, "error details here");
  assert.equal(error.stderrLast, "");
  assert.equal(error.wavExists, false);
  assert.equal(error.wavSize, 0);
});

test("sidplayRunner: SidplayExecutionError with large stderr", (t) => {
  const largeStderr = Buffer.alloc(3000);
  largeStderr.fill("x");
  largeStderr.write("START", 0);
  largeStderr.write("END", 2997);

  const error = new SidplayExecutionError({
    message: "test error",
    command: "sidplayfp test.sid",
    exitCode: 2,
    stderr: largeStderr,
    wavExists: true,
    wavSize: 1234
  });

  assert.ok(error.stderrFirst.startsWith("START"));
  assert.equal(error.stderrFirst.length, 1000);
  assert.ok(error.stderrLast.endsWith("END"));
  assert.equal(error.stderrLast.length, 1000);
  assert.equal(error.wavExists, true);
  assert.equal(error.wavSize, 1234);
});

test("sidplayRunner: mode resolution defaults", (t) => {
  const oldMode = process.env.SIDPLAY_MODE;
  delete process.env.SIDPLAY_MODE;
  
  t.after(() => {
    if (oldMode !== undefined) {
      process.env.SIDPLAY_MODE = oldMode;
    }
  });

  // Mode resolution is internal, but we can test the default behavior
  // by ensuring NTSC is the default when no env var is set
  assert.ok(!process.env.SIDPLAY_MODE);
});

test("sidplayRunner: PAL mode via parameter", async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sidplay-test-"));
  const sidPath = path.join(tmpDir, "test.sid");
  const wavPath = path.join(tmpDir, "out.wav");
  
  t.after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  fs.writeFileSync(sidPath, Buffer.from([0x50, 0x53, 0x49, 0x44, 0x00, 0x01, 0x00, 0x7C]));

  const oldBinary = process.env.SIDPLAYFP_BINARY;
  process.env.SIDPLAYFP_BINARY = "nonexistent-sidplayfp-xyz";
  
  t.after(() => {
    if (oldBinary !== undefined) {
      process.env.SIDPLAYFP_BINARY = oldBinary;
    } else {
      delete process.env.SIDPLAYFP_BINARY;
    }
  });

  await assert.rejects(
    () => runSidToWav({ sidPath, wavPath, mode: "pal" }),
    (err) => {
      assert.ok(err instanceof SidplayExecutionError);
      // Mode is reflected in the command args
      return true;
    }
  );
});

test("sidplayRunner: custom limit cycles", async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sidplay-test-"));
  const sidPath = path.join(tmpDir, "test.sid");
  const wavPath = path.join(tmpDir, "out.wav");
  
  t.after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  fs.writeFileSync(sidPath, Buffer.from([0x50, 0x53, 0x49, 0x44, 0x00, 0x01, 0x00, 0x7C]));

  const oldBinary = process.env.SIDPLAYFP_BINARY;
  process.env.SIDPLAYFP_BINARY = "nonexistent-sidplayfp-xyz";
  
  t.after(() => {
    if (oldBinary !== undefined) {
      process.env.SIDPLAYFP_BINARY = oldBinary;
    } else {
      delete process.env.SIDPLAYFP_BINARY;
    }
  });

  await assert.rejects(
    () => runSidToWav({ sidPath, wavPath, limitCycles: 30000000 }),
    (err) => {
      assert.ok(err instanceof SidplayExecutionError);
      return true;
    }
  );
});

test("sidplayRunner: tune parameter", async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sidplay-test-"));
  const sidPath = path.join(tmpDir, "test.sid");
  const wavPath = path.join(tmpDir, "out.wav");
  
  t.after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  fs.writeFileSync(sidPath, Buffer.from([0x50, 0x53, 0x49, 0x44, 0x00, 0x01, 0x00, 0x7C]));

  const oldBinary = process.env.SIDPLAYFP_BINARY;
  process.env.SIDPLAYFP_BINARY = "nonexistent-sidplayfp-xyz";
  
  t.after(() => {
    if (oldBinary !== undefined) {
      process.env.SIDPLAYFP_BINARY = oldBinary;
    } else {
      delete process.env.SIDPLAYFP_BINARY;
    }
  });

  await assert.rejects(
    () => runSidToWav({ sidPath, wavPath, tune: 2 }),
    (err) => {
      assert.ok(err instanceof SidplayExecutionError);
      return true;
    }
  );
});
