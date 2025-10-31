import test from "#test/runner";
import assert from "#test/assert";
import { programRunnersModule } from "../src/tools/programRunners.js";

function createLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

function withPollStabilize(ms) {
  const previous = process.env.C64BRIDGE_POLL_STABILIZE_MS;
  process.env.C64BRIDGE_POLL_STABILIZE_MS = String(ms);
  return () => {
    if (previous === undefined) {
      delete process.env.C64BRIDGE_POLL_STABILIZE_MS;
    } else {
      process.env.C64BRIDGE_POLL_STABILIZE_MS = previous;
    }
  };
}

test("ASM program with screen changes is detected as ok", async () => {
  const restoreStabilize = withPollStabilize(0);
  const screens = [
    "READY.\n",
    "RUN\nSYS 2061\n",
    "HELLO FROM ASM\n", // Screen changed
  ];
  let memoryCallCount = 0;
  
  const ctx = {
    client: {
      async uploadAndRunAsm(program) {
        return { success: true };
      },
      async readScreen() {
        const screen = screens.shift();
        if (!screen) return "READY.\n";
        return screen;
      },
      async readMemoryRaw(address, length) {
        memoryCallCount++;
        // Simulate hardware activity by changing values after first poll
        if (memoryCallCount <= 3) {
          return new Uint8Array(length).fill(0);
        }
        return new Uint8Array(length).fill(1);
      },
    },
    logger: createLogger(),
  };
  
  try {
    const result = await programRunnersModule.invoke(
      "upload_run_asm",
      { program: ".org $0801\n lda #$01\n sta $0400\n rts" },
      ctx,
    );
    
    assert.equal(result.isError, undefined);
    assert.ok(result.structuredContent && result.structuredContent.type === "json");
    const data = result.structuredContent.data;
    assert.equal(data.kind, "upload_run_asm");
  } finally {
    restoreStabilize();
  }
});

test("ASM program with no screen changes is detected as crashed", async () => {
  const restoreStabilize = withPollStabilize(0);
  const screens = [
    "READY.\n",
    "RUN\nSYS 2061\n",
    "RUN\nSYS 2061\n", // No change
    "RUN\nSYS 2061\n", // No change
  ];
  
  const ctx = {
    client: {
      async uploadAndRunAsm(program) {
        return { success: true };
      },
      async readScreen() {
        const screen = screens.shift();
        if (!screen) return "RUN\nSYS 2061\n";
        return screen;
      },
      async readMemoryRaw(address, length) {
        // Return same values every time (no activity)
        return new Uint8Array(length).fill(0);
      },
    },
    logger: createLogger(),
  };
  
  try {
    const result = await programRunnersModule.invoke(
      "upload_run_asm",
      { program: ".org $0801\nloop: jmp loop" }, // Infinite loop
      ctx,
    );
    
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes("crashed"));
  } finally {
    restoreStabilize();
  }
});

test("ASM polling respects environment variables", async () => {
  const restoreStabilize = withPollStabilize(0);
  // Set very short timeout
  process.env.C64BRIDGE_POLL_MAX_MS = "50";
  process.env.C64BRIDGE_POLL_INTERVAL_MS = "10";
  
  const screens = [
    "READY.\n",
    "RUN\nSYS 2061\n",
    "RUN\nSYS 2061\n",
  ];
  
  const ctx = {
    client: {
      async uploadAndRunAsm(program) {
        return { success: true };
      },
      async readScreen() {
        const screen = screens.shift();
        if (!screen) return "RUN\nSYS 2061\n";
        return screen;
      },
      async readMemoryRaw(address, length) {
        // Return same values (no activity)
        return new Uint8Array(length).fill(0);
      },
    },
    logger: createLogger(),
  };
  
  try {
    const result = await programRunnersModule.invoke(
      "upload_run_asm",
      { program: ".org $0801\nrts" },
      ctx,
    );
    
    // With short timeout, should quickly timeout and report crashed
    assert.equal(result.isError, true);
  } finally {
    delete process.env.C64BRIDGE_POLL_MAX_MS;
    delete process.env.C64BRIDGE_POLL_INTERVAL_MS;
    restoreStabilize();
  }
});

test("ASM program that executes instantly without RUN showing is ok", async () => {
  const restoreStabilize = withPollStabilize(0);
  const ctx = {
    client: {
      async uploadAndRunAsm(program) {
        return { success: true };
      },
      async readScreen() {
        // Program executed so fast RUN never showed
        return "READY.\n";
      },
    },
    logger: createLogger(),
  };
  
  try {
    const result = await programRunnersModule.invoke(
      "upload_run_asm",
      { program: ".org $0801\nrts" }, // Instant return
      ctx,
    );
    
    // Should be considered ok (instant execution)
    assert.equal(result.isError, undefined);
  } finally {
    restoreStabilize();
  }
});
