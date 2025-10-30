import test from "#test/runner";
import assert from "#test/assert";
import { pollForProgramOutcome, loadPollConfig } from "../src/tools/pollValidator.js";

function createLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

test("loadPollConfig uses defaults when env vars not set", () => {
  delete process.env.C64BRIDGE_POLL_MAX_MS;
  delete process.env.C64BRIDGE_POLL_INTERVAL_MS;
  
  const config = loadPollConfig();
  
  // In test mode, uses shorter timeouts
  const isTestMode = process.env.C64_TEST_TARGET === "mock" || process.env.NODE_ENV === "test";
  if (isTestMode) {
    assert.equal(config.maxMs, 100);
    assert.equal(config.intervalMs, 30);
  } else {
    assert.equal(config.maxMs, 2000);
    assert.equal(config.intervalMs, 200);
  }
});

test("loadPollConfig reads from environment variables", () => {
  process.env.C64BRIDGE_POLL_MAX_MS = "3000";
  process.env.C64BRIDGE_POLL_INTERVAL_MS = "150";
  
  const config = loadPollConfig();
  
  assert.equal(config.maxMs, 3000);
  assert.equal(config.intervalMs, 150);
  
  delete process.env.C64BRIDGE_POLL_MAX_MS;
  delete process.env.C64BRIDGE_POLL_INTERVAL_MS;
});

test("loadPollConfig handles invalid env values with defaults", () => {
  process.env.C64BRIDGE_POLL_MAX_MS = "invalid";
  process.env.C64BRIDGE_POLL_INTERVAL_MS = "-100";
  
  const config = loadPollConfig();
  
  // In test mode, uses shorter timeouts
  const isTestMode = process.env.C64_TEST_TARGET === "mock" || process.env.NODE_ENV === "test";
  if (isTestMode) {
    assert.equal(config.maxMs, 100);
    assert.equal(config.intervalMs, 30);
  } else {
    assert.equal(config.maxMs, 2000);
    assert.equal(config.intervalMs, 200);
  }
  
  delete process.env.C64BRIDGE_POLL_MAX_MS;
  delete process.env.C64BRIDGE_POLL_INTERVAL_MS;
});

test("pollForProgramOutcome BASIC detects syntax error", async () => {
  const screens = [
    "READY.\n",
    "RUN\n",
    "?SYNTAX ERROR\nREADY.\n",
  ];
  
  const client = {
    async readScreen() {
      const screen = screens.shift();
      if (!screen) return "READY.\n";
      return screen;
    },
  };
  
  const result = await pollForProgramOutcome(
    "BASIC",
    client,
    createLogger(),
    { maxMs: 200, intervalMs: 20 },
  );
  
  assert.equal(result.status, "error");
  assert.equal(result.type, "BASIC");
  assert.equal(result.message, "SYNTAX");
});

test("pollForProgramOutcome BASIC detects error with line number", async () => {
  const screens = [
    "READY.\n",
    "RUN\n",
    "?SYNTAX ERROR IN 120\nREADY.\n",
  ];
  
  const client = {
    async readScreen() {
      const screen = screens.shift();
      if (!screen) return "READY.\n";
      return screen;
    },
  };
  
  const result = await pollForProgramOutcome(
    "BASIC",
    client,
    createLogger(),
    { maxMs: 200, intervalMs: 20 },
  );
  
  assert.equal(result.status, "error");
  assert.equal(result.type, "BASIC");
  assert.equal(result.message, "SYNTAX");
  assert.equal(result.line, 120);
});

test("pollForProgramOutcome BASIC returns ok when no error", async () => {
  const screens = [
    "READY.\n",
    "RUN\n",
    "HELLO WORLD\n",
    "READY.\n",
  ];
  
  const client = {
    async readScreen() {
      const screen = screens.shift();
      if (!screen) return "READY.\n";
      return screen;
    },
  };
  
  const result = await pollForProgramOutcome(
    "BASIC",
    client,
    createLogger(),
    { maxMs: 100, intervalMs: 20 },
  );
  
  assert.equal(result.status, "ok");
  assert.equal(result.type, "BASIC");
});

test("pollForProgramOutcome BASIC detects TYPE MISMATCH error", async () => {
  const screens = [
    "READY.\n",
    "RUN\n",
    "?TYPE MISMATCH ERROR IN 20\nREADY.\n",
  ];
  
  const client = {
    async readScreen() {
      const screen = screens.shift();
      if (!screen) return "READY.\n";
      return screen;
    },
  };
  
  const result = await pollForProgramOutcome(
    "BASIC",
    client,
    createLogger(),
    { maxMs: 200, intervalMs: 20 },
  );
  
  assert.equal(result.status, "error");
  assert.equal(result.type, "BASIC");
  assert.equal(result.message, "TYPE MISMATCH");
  assert.equal(result.line, 20);
});

test("pollForProgramOutcome ASM detects screen change", async () => {
  let screenCallCount = 0;
  let memoryCallCount = 0;
  const client = {
    async readScreen() {
      screenCallCount++;
      if (screenCallCount === 1) return "READY.\n";
      if (screenCallCount === 2) return "RUN\nSYS 2061\n";
      return "READY.\n";
    },
    async readMemoryRaw(address, length) {
      memoryCallCount++;
      // Simulate hardware activity by returning different values after first poll cycle
      // Each poll cycle calls readMemoryRaw 3 times (I/O, jiffy, screen)
      // So after 3 calls, start returning different values
      if (memoryCallCount <= 3) {
        // First poll cycle - stable
        return new Uint8Array(length).fill(0);
      }
      // Later reads - changed (simulating activity)
      return new Uint8Array(length).fill(1);
    },
  };
  
  const result = await pollForProgramOutcome(
    "ASM",
    client,
    createLogger(),
    { maxMs: 200, intervalMs: 20 },
  );
  
  assert.equal(result.status, "ok");
  assert.equal(result.type, "ASM");
});

test("pollForProgramOutcome ASM detects crash when no screen change", async () => {
  const screens = [
    "READY.\n",
    "RUN\nSYS 2061\n",
    "RUN\nSYS 2061\n",
    "RUN\nSYS 2061\n",
  ];
  
  const client = {
    async readScreen() {
      const screen = screens.shift();
      if (!screen) return "RUN\nSYS 2061\n";
      return screen;
    },
    async readMemoryRaw(address, length) {
      // Return same values every time (no activity)
      return new Uint8Array(length).fill(0);
    },
  };
  
  const result = await pollForProgramOutcome(
    "ASM",
    client,
    createLogger(),
    { maxMs: 100, intervalMs: 20 },
  );
  
  assert.equal(result.status, "crashed");
  assert.equal(result.type, "ASM");
  assert.equal(result.reason, "no VIC/CIA/TI/screen progression within window");
});

test("pollForProgramOutcome handles screen read failures gracefully", async () => {
  let callCount = 0;
  
  const client = {
    async readScreen() {
      callCount++;
      if (callCount < 3) {
        throw new Error("Screen read failed");
      }
      if (callCount === 3) return "RUN\n";
      return "READY.\n";
    },
  };
  
  const result = await pollForProgramOutcome(
    "BASIC",
    client,
    createLogger(),
    { maxMs: 150, intervalMs: 20 },
  );
  
  assert.equal(result.status, "ok");
  assert.equal(result.type, "BASIC");
});

test("pollForProgramOutcome BASIC returns ok if RUN not detected", async () => {
  const client = {
    async readScreen() {
      return "READY.\n";
    },
  };
  
  const result = await pollForProgramOutcome(
    "BASIC",
    client,
    createLogger(),
    { maxMs: 50, intervalMs: 10 },
  );
  
  assert.equal(result.status, "ok");
  assert.equal(result.type, "BASIC");
});

test("pollForProgramOutcome ASM returns ok if RUN not detected", async () => {
  const client = {
    async readScreen() {
      return "READY.\n";
    },
  };
  
  const result = await pollForProgramOutcome(
    "ASM",
    client,
    createLogger(),
    { maxMs: 50, intervalMs: 10 },
  );
  
  assert.equal(result.status, "ok");
  assert.equal(result.type, "ASM");
});

test("pollForProgramOutcome BASIC case-insensitive RUN detection", async () => {
  const screens = [
    "ready.\n",
    "run\n",
    "?syntax error\nready.\n",
  ];
  
  const client = {
    async readScreen() {
      const screen = screens.shift();
      if (!screen) return "ready.\n";
      return screen;
    },
  };
  
  const result = await pollForProgramOutcome(
    "BASIC",
    client,
    createLogger(),
    { maxMs: 200, intervalMs: 20 },
  );
  
  assert.equal(result.status, "error");
  assert.equal(result.type, "BASIC");
});

test("pollForProgramOutcome detects BASIC error without line number", async () => {
  const screens = [
    "READY.\n",
    "RUN\n",
    "?OUT OF MEMORY ERROR\nREADY.\n",
  ];
  
  const client = {
    async readScreen() {
      const screen = screens.shift();
      if (!screen) return "READY.\n";
      return screen;
    },
  };
  
  const result = await pollForProgramOutcome(
    "BASIC",
    client,
    createLogger(),
    { maxMs: 200, intervalMs: 20 },
  );
  
  assert.equal(result.status, "error");
  assert.equal(result.type, "BASIC");
  assert.equal(result.message, "OUT OF MEMORY");
  assert.equal(result.line, undefined);
});
