import test from "#test/runner";
import assert from "#test/assert";
import { memoryModule } from "../src/tools/memory.js";

function createLogger() {
  return { debug() {}, info() {}, warn() {}, error() {} };
}

function createMockClient(overrides = {}) {
  return {
    async readScreen() { return "READY.\n"; },
    async readMemory(address, length) {
      return {
        success: true,
        data: "$AABBCCDD",
        details: { address: "0400", length: 4 },
      };
    },
    async writeMemory(address, bytes) {
      return {
        success: true,
        details: { address: "0400", length: 2 },
      };
    },
    ...overrides,
  };
}

// --- read_screen ---

test("read_screen returns screen contents", async () => {
  const ctx = {
    client: createMockClient({
      async readScreen() { return "HELLO WORLD"; },
    }),
    logger: createLogger(),
  };
  const res = await memoryModule.invoke("read_screen", {}, ctx);
  assert.equal(res.content?.[0].type, "text");
  assert.ok(res.content?.[0].text.includes("HELLO WORLD"));
  assert.equal(res.metadata?.success, true);
  assert.equal(res.metadata?.screen, "HELLO WORLD");
});

test("read_screen handles exception", async () => {
  const ctx = {
    client: createMockClient({
      async readScreen() { throw new Error("hardware error"); },
    }),
    logger: createLogger(),
  };
  const res = await memoryModule.invoke("read_screen", {}, ctx);
  assert.equal(res.isError, true);
  assert.equal(res.metadata?.error?.kind, "unknown");
});

// --- read_memory ---

test("read_memory succeeds with valid response", async () => {
  const ctx = {
    client: createMockClient(),
    logger: createLogger(),
  };
  const res = await memoryModule.invoke("read_memory", { address: "$0400", length: 4 }, ctx);
  assert.equal(res.content?.[0].type, "text");
  assert.ok(res.content?.[0].text.includes("Read"));
  assert.equal(res.metadata?.success, true);
  assert.equal(res.metadata?.hexData, "$AABBCCDD");
});

test("read_memory uses default length when not provided", async () => {
  const ctx = {
    client: createMockClient(),
    logger: createLogger(),
  };
  const res = await memoryModule.invoke("read_memory", { address: "$0400" }, ctx);
  assert.equal(res.metadata?.success, true);
});

test("read_memory handles failure response", async () => {
  const ctx = {
    client: createMockClient({
      async readMemory() {
        return { success: false, details: { error: "invalid address" } };
      },
    }),
    logger: createLogger(),
  };
  const res = await memoryModule.invoke("read_memory", { address: "$0400", length: 8 }, ctx);
  assert.equal(res.isError, true);
  assert.equal(res.metadata?.error?.kind, "execution");
});

test("read_memory handles failure with scalar details", async () => {
  const ctx = {
    client: createMockClient({
      async readMemory() {
        return { success: false, details: "address out of range" };
      },
    }),
    logger: createLogger(),
  };
  const res = await memoryModule.invoke("read_memory", { address: "$FFFF", length: 2 }, ctx);
  assert.equal(res.isError, true);
  assert.equal(res.metadata?.error?.kind, "execution");
});

test("read_memory handles failure with null details", async () => {
  const ctx = {
    client: createMockClient({
      async readMemory() {
        return { success: false, details: null };
      },
    }),
    logger: createLogger(),
  };
  const res = await memoryModule.invoke("read_memory", { address: "$0400", length: 1 }, ctx);
  assert.equal(res.isError, true);
  assert.equal(res.metadata?.error?.kind, "execution");
});

test("read_memory handles exception", async () => {
  const ctx = {
    client: createMockClient({
      async readMemory() { throw new Error("network timeout"); },
    }),
    logger: createLogger(),
  };
  const res = await memoryModule.invoke("read_memory", { address: "$0400", length: 8 }, ctx);
  assert.equal(res.isError, true);
  assert.equal(res.metadata?.error?.kind, "unknown");
});

test("read_memory handles response without details", async () => {
  const ctx = {
    client: createMockClient({
      async readMemory() {
        return { success: true, data: "$AA55" };
      },
    }),
    logger: createLogger(),
  };
  const res = await memoryModule.invoke("read_memory", { address: "$0400", length: 2 }, ctx);
  assert.equal(res.metadata?.success, true);
  assert.equal(res.metadata?.hexData, "$AA55");
});

// --- write_memory ---

test("write_memory succeeds with valid response", async () => {
  const ctx = {
    client: createMockClient(),
    logger: createLogger(),
  };
  const res = await memoryModule.invoke("write_memory", { address: "$0400", bytes: "$AA55" }, ctx);
  assert.equal(res.content?.[0].type, "text");
  assert.ok(res.content?.[0].text.includes("Wrote"));
  assert.equal(res.metadata?.success, true);
  assert.equal(res.metadata?.bytes, "$AA55");
});

test("write_memory handles numeric address in details", async () => {
  const ctx = {
    client: createMockClient({
      async writeMemory() {
        return { success: true, details: { address: 1024, length: 2 } };
      },
    }),
    logger: createLogger(),
  };
  const res = await memoryModule.invoke("write_memory", { address: "$0400", bytes: "$AA55" }, ctx);
  assert.equal(res.metadata?.success, true);
  assert.equal(res.metadata?.address, "$0400");
});

test("write_memory handles string address without $ prefix", async () => {
  const ctx = {
    client: createMockClient({
      async writeMemory() {
        return { success: true, details: { address: "0400", length: 2 } };
      },
    }),
    logger: createLogger(),
  };
  const res = await memoryModule.invoke("write_memory", { address: "0400", bytes: "$AA55" }, ctx);
  assert.equal(res.metadata?.success, true);
  assert.ok(res.metadata?.address?.startsWith("$"));
});

test("write_memory handles empty address string in details", async () => {
  const ctx = {
    client: createMockClient({
      async writeMemory() {
        return { success: true, details: { address: "", length: 2 } };
      },
    }),
    logger: createLogger(),
  };
  const res = await memoryModule.invoke("write_memory", { address: "$0400", bytes: "$AA" }, ctx);
  assert.equal(res.metadata?.success, true);
});

test("write_memory handles failure response", async () => {
  const ctx = {
    client: createMockClient({
      async writeMemory() {
        return { success: false, details: { error: "protected memory" } };
      },
    }),
    logger: createLogger(),
  };
  const res = await memoryModule.invoke("write_memory", { address: "$D000", bytes: "$FF" }, ctx);
  assert.equal(res.isError, true);
  assert.equal(res.metadata?.error?.kind, "execution");
});

test("write_memory handles failure with undefined details", async () => {
  const ctx = {
    client: createMockClient({
      async writeMemory() {
        return { success: false, details: undefined };
      },
    }),
    logger: createLogger(),
  };
  const res = await memoryModule.invoke("write_memory", { address: "$0400", bytes: "$AA" }, ctx);
  assert.equal(res.isError, true);
  assert.equal(res.metadata?.error?.kind, "execution");
});

test("write_memory handles exception", async () => {
  const ctx = {
    client: createMockClient({
      async writeMemory() { throw new Error("connection error"); },
    }),
    logger: createLogger(),
  };
  const res = await memoryModule.invoke("write_memory", { address: "$0400", bytes: "$AA55" }, ctx);
  assert.equal(res.isError, true);
  assert.equal(res.metadata?.error?.kind, "unknown");
});

test("write_memory handles response without length in details", async () => {
  const ctx = {
    client: createMockClient({
      async writeMemory() {
        return { success: true, details: { address: "0400" } };
      },
    }),
    logger: createLogger(),
  };
  const res = await memoryModule.invoke("write_memory", { address: "$0400", bytes: "$AABB" }, ctx);
  assert.equal(res.metadata?.success, true);
  assert.equal(res.metadata?.length, null);
});
