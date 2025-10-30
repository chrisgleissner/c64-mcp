import test from "#test/runner";
import assert from "#test/assert";
import { machineControlModule } from "../src/tools/machineControl.js";

function createLogger() {
  return { debug() {}, info() {}, warn() {}, error() {} };
}

function createMockClient(overrides = {}) {
  return {
    async reset() { return { success: true, details: { message: "reset ok" } }; },
    async reboot() { return { success: true, details: { message: "reboot ok" } }; },
    async pause() { return { success: true, details: { message: "paused" } }; },
    async resume() { return { success: true, details: { message: "resumed" } }; },
    async poweroff() { return { success: true, details: { message: "powered off" } }; },
    async menuButton() { return { success: true, details: { message: "menu toggled" } }; },
    ...overrides,
  };
}

// --- reset_c64 ---

test("reset_c64 succeeds with valid response", async () => {
  const ctx = {
    client: createMockClient(),
    logger: createLogger(),
  };
  const res = await machineControlModule.invoke("reset_c64", {}, ctx);
  assert.equal(res.content?.[0].type, "text");
  assert.ok(res.content?.[0].text.includes("reset command issued successfully"));
  assert.equal(res.metadata?.success, true);
});

test("reset_c64 handles failure response", async () => {
  const ctx = {
    client: createMockClient({
      async reset() { return { success: false, details: { error: "hardware fault" } }; },
    }),
    logger: createLogger(),
  };
  const res = await machineControlModule.invoke("reset_c64", {}, ctx);
  assert.equal(res.isError, true);
  assert.equal(res.metadata?.error?.kind, "execution");
});

test("reset_c64 handles exception", async () => {
  const ctx = {
    client: createMockClient({
      async reset() { throw new Error("network error"); },
    }),
    logger: createLogger(),
  };
  const res = await machineControlModule.invoke("reset_c64", {}, ctx);
  assert.equal(res.isError, true);
  assert.equal(res.metadata?.error?.kind, "unknown");
});

test("reset_c64 handles failure with scalar details", async () => {
  const ctx = {
    client: createMockClient({
      async reset() { return { success: false, details: "simple error" }; },
    }),
    logger: createLogger(),
  };
  const res = await machineControlModule.invoke("reset_c64", {}, ctx);
  assert.equal(res.isError, true);
  assert.equal(res.metadata?.error?.kind, "execution");
});

// --- reboot_c64 ---

test("reboot_c64 succeeds with valid response", async () => {
  const ctx = {
    client: createMockClient(),
    logger: createLogger(),
  };
  const res = await machineControlModule.invoke("reboot_c64", {}, ctx);
  assert.equal(res.content?.[0].type, "text");
  assert.ok(res.content?.[0].text.includes("reboot command issued successfully"));
  assert.equal(res.metadata?.success, true);
});

test("reboot_c64 handles failure response", async () => {
  const ctx = {
    client: createMockClient({
      async reboot() { return { success: false, details: null }; },
    }),
    logger: createLogger(),
  };
  const res = await machineControlModule.invoke("reboot_c64", {}, ctx);
  assert.equal(res.isError, true);
  assert.equal(res.metadata?.error?.kind, "execution");
});

test("reboot_c64 handles exception", async () => {
  const ctx = {
    client: createMockClient({
      async reboot() { throw new Error("connection refused"); },
    }),
    logger: createLogger(),
  };
  const res = await machineControlModule.invoke("reboot_c64", {}, ctx);
  assert.equal(res.isError, true);
  assert.equal(res.metadata?.error?.kind, "unknown");
});

// --- pause ---

test("pause succeeds with valid response", async () => {
  const ctx = {
    client: createMockClient(),
    logger: createLogger(),
  };
  const res = await machineControlModule.invoke("pause", {}, ctx);
  assert.equal(res.content?.[0].type, "text");
  assert.ok(res.content?.[0].text.includes("execution paused"));
  assert.equal(res.metadata?.success, true);
});

test("pause handles failure response", async () => {
  const ctx = {
    client: createMockClient({
      async pause() { return { success: false, details: undefined }; },
    }),
    logger: createLogger(),
  };
  const res = await machineControlModule.invoke("pause", {}, ctx);
  assert.equal(res.isError, true);
  assert.equal(res.metadata?.error?.kind, "execution");
});

test("pause handles exception", async () => {
  const ctx = {
    client: createMockClient({
      async pause() { throw new Error("timeout"); },
    }),
    logger: createLogger(),
  };
  const res = await machineControlModule.invoke("pause", {}, ctx);
  assert.equal(res.isError, true);
  assert.equal(res.metadata?.error?.kind, "unknown");
});

// --- resume ---

test("resume succeeds with valid response", async () => {
  const ctx = {
    client: createMockClient(),
    logger: createLogger(),
  };
  const res = await machineControlModule.invoke("resume", {}, ctx);
  assert.equal(res.content?.[0].type, "text");
  assert.ok(res.content?.[0].text.includes("execution resumed"));
  assert.equal(res.metadata?.success, true);
});

test("resume handles failure response", async () => {
  const ctx = {
    client: createMockClient({
      async resume() { return { success: false, details: { code: 500 } }; },
    }),
    logger: createLogger(),
  };
  const res = await machineControlModule.invoke("resume", {}, ctx);
  assert.equal(res.isError, true);
  assert.equal(res.metadata?.error?.kind, "execution");
});

test("resume handles exception", async () => {
  const ctx = {
    client: createMockClient({
      async resume() { throw new Error("hardware error"); },
    }),
    logger: createLogger(),
  };
  const res = await machineControlModule.invoke("resume", {}, ctx);
  assert.equal(res.isError, true);
  assert.equal(res.metadata?.error?.kind, "unknown");
});

// --- poweroff ---

test("poweroff succeeds with valid response", async () => {
  const ctx = {
    client: createMockClient(),
    logger: createLogger(),
  };
  const res = await machineControlModule.invoke("poweroff", {}, ctx);
  assert.equal(res.content?.[0].type, "text");
  assert.ok(res.content?.[0].text.includes("Power off command acknowledged"));
  assert.equal(res.metadata?.success, true);
});

test("poweroff handles failure response", async () => {
  const ctx = {
    client: createMockClient({
      async poweroff() { return { success: false, details: 123 }; },
    }),
    logger: createLogger(),
  };
  const res = await machineControlModule.invoke("poweroff", {}, ctx);
  assert.equal(res.isError, true);
  assert.equal(res.metadata?.error?.kind, "execution");
});

test("poweroff handles exception", async () => {
  const ctx = {
    client: createMockClient({
      async poweroff() { throw new Error("communication error"); },
    }),
    logger: createLogger(),
  };
  const res = await machineControlModule.invoke("poweroff", {}, ctx);
  assert.equal(res.isError, true);
  assert.equal(res.metadata?.error?.kind, "unknown");
});

// --- menu_button ---

test("menu_button succeeds with valid response", async () => {
  const ctx = {
    client: createMockClient(),
    logger: createLogger(),
  };
  const res = await machineControlModule.invoke("menu_button", {}, ctx);
  assert.equal(res.content?.[0].type, "text");
  assert.ok(res.content?.[0].text.includes("Menu button command sent"));
  assert.equal(res.metadata?.success, true);
});

test("menu_button handles failure response", async () => {
  const ctx = {
    client: createMockClient({
      async menuButton() { return { success: false, details: "disabled" }; },
    }),
    logger: createLogger(),
  };
  const res = await machineControlModule.invoke("menu_button", {}, ctx);
  assert.equal(res.isError, true);
  assert.equal(res.metadata?.error?.kind, "execution");
});

test("menu_button handles exception", async () => {
  const ctx = {
    client: createMockClient({
      async menuButton() { throw new Error("not available"); },
    }),
    logger: createLogger(),
  };
  const res = await machineControlModule.invoke("menu_button", {}, ctx);
  assert.equal(res.isError, true);
  assert.equal(res.metadata?.error?.kind, "unknown");
});
