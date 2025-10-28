import test from "node:test";
import assert from "node:assert/strict";
import { developerModule } from "../src/tools/developer.js";

function createLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

test("config_list returns categories", async () => {
  const ctx = {
    client: {
      async configsList() {
        return { categories: ["Audio", "Video"] };
      },
    },
    logger: createLogger(),
  };

  const result = await developerModule.invoke("config_list", {}, ctx);

  assert.equal(result.content[0].type, "text");
  assert.deepEqual(JSON.parse(result.content[0].text), {
    categories: ["Audio", "Video"],
  });
  assert.equal(result.structuredContent.type, "json");
  assert.deepEqual(result.structuredContent.data, {
    categories: ["Audio", "Video"],
  });
  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.categoryCount, 2);
});

test("config_get forwards category and item", async () => {
  const calls = [];
  const ctx = {
    client: {
      async configGet(category, item) {
        calls.push({ category, item });
        return { Volume: "10" };
      },
    },
    logger: createLogger(),
  };

  const result = await developerModule.invoke(
    "config_get",
    { category: "Audio", item: "Volume" },
    ctx,
  );

  assert.equal(result.content[0].type, "text");
  assert.deepEqual(JSON.parse(result.content[0].text), {
    value: { Volume: "10" },
  });
  assert.equal(result.structuredContent.type, "json");
  assert.deepEqual(result.structuredContent.data, {
    value: { Volume: "10" },
  });
  assert.deepEqual(calls, [{ category: "Audio", item: "Volume" }]);
});

test("config_set reports firmware failure", async () => {
  const ctx = {
    client: {
      async configSet() {
        return { success: false, details: { reason: "denied" } };
      },
    },
    logger: createLogger(),
  };

  const result = await developerModule.invoke(
    "config_set",
    { category: "Audio", item: "Volume", value: 8 },
    ctx,
  );

  assert.equal(result.isError, true);
  assert.equal(result.metadata.error.kind, "execution");
  assert.deepEqual(result.metadata.error.details, { reason: "denied" });
});

test("config_batch_update validates payload", async () => {
  const ctx = {
    client: {
      async configBatchUpdate() {
        throw new Error("should not run");
      },
    },
    logger: createLogger(),
  };

  const result = await developerModule.invoke("config_batch_update", {}, ctx);
  assert.equal(result.isError, true);
  assert.equal(result.metadata.error.kind, "validation");
});

test("config_reset_to_default succeeds", async () => {
  const ctx = {
    client: {
      async configResetToDefault() {
        return { success: true, details: { rebootRequired: true } };
      },
    },
    logger: createLogger(),
  };

  const result = await developerModule.invoke("config_reset_to_default", {}, ctx);

  assert.equal(result.content[0].type, "text");
  assert.equal(result.metadata.success, true);
  assert.deepEqual(result.metadata.details, { rebootRequired: true });
});

test("debugreg_read returns uppercase value", async () => {
  const ctx = {
    client: {
      async debugregRead() {
        return { success: true, value: "1a", details: { raw: "1a" } };
      },
    },
    logger: createLogger(),
  };

  const result = await developerModule.invoke("debugreg_read", {}, ctx);

  assert.equal(result.content[0].type, "text");
  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.value, "1A");
  assert.deepEqual(result.metadata.details, { raw: "1a" });
});

test("debugreg_write validates input", async () => {
  const ctx = {
    client: {
      async debugregWrite() {
        throw new Error("should not run");
      },
    },
    logger: createLogger(),
  };

  const result = await developerModule.invoke("debugreg_write", {}, ctx);

  assert.equal(result.isError, true);
  assert.equal(result.metadata.error.kind, "validation");
});

test("version returns firmware payload", async () => {
  const ctx = {
    client: {
      async version() {
        return { version: "1.2.3" };
      },
    },
    logger: createLogger(),
  };

  const result = await developerModule.invoke("version", {}, ctx);

  assert.equal(result.content[0].type, "text");
  assert.deepEqual(JSON.parse(result.content[0].text), { version: "1.2.3" });
  assert.equal(result.structuredContent?.type, "json");
  assert.deepEqual(result.structuredContent?.data, { version: "1.2.3" });
});

test("config_set with firmware failure", async () => {
  const ctx = {
    client: {
      async configSet() {
        return { success: false, details: { error: "invalid value" } };
      },
    },
    logger: createLogger(),
  };

  const result = await developerModule.invoke(
    "config_set",
    { category: "Test", item: "Item", value: "bad" },
    ctx,
  );

  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes("firmware reported failure"));
});

test("config_batch_update with firmware failure", async () => {
  const ctx = {
    client: {
      async configBatchUpdate() {
        return { success: false, details: { error: "batch failed" } };
      },
    },
    logger: createLogger(),
  };

  const result = await developerModule.invoke(
    "config_batch_update",
    { Audio: { Volume: "10" } },
    ctx,
  );

  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes("batch configuration update"));
});

test("config_load_from_flash success", async () => {
  const ctx = {
    client: {
      async configLoadFromFlash() {
        return { success: true, details: { loaded: true } };
      },
    },
    logger: createLogger(),
  };

  const result = await developerModule.invoke("config_load_from_flash", {}, ctx);

  assert.equal(result.content[0].type, "text");
  assert.equal(result.metadata.success, true);
});

test("config_load_from_flash failure", async () => {
  const ctx = {
    client: {
      async configLoadFromFlash() {
        return { success: false, details: { error: "flash read error" } };
      },
    },
    logger: createLogger(),
  };

  const result = await developerModule.invoke("config_load_from_flash", {}, ctx);

  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes("firmware reported failure"));
});

test("config_save_to_flash success", async () => {
  const ctx = {
    client: {
      async configSaveToFlash() {
        return { success: true, details: { saved: true } };
      },
    },
    logger: createLogger(),
  };

  const result = await developerModule.invoke("config_save_to_flash", {}, ctx);

  assert.equal(result.content[0].type, "text");
  assert.equal(result.metadata.success, true);
});

test("config_save_to_flash failure", async () => {
  const ctx = {
    client: {
      async configSaveToFlash() {
        return { success: false, details: { error: "flash write error" } };
      },
    },
    logger: createLogger(),
  };

  const result = await developerModule.invoke("config_save_to_flash", {}, ctx);

  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes("firmware reported failure"));
});

test("config_reset_to_default failure", async () => {
  const ctx = {
    client: {
      async configResetToDefault() {
        return { success: false, details: { error: "reset failed" } };
      },
    },
    logger: createLogger(),
  };

  const result = await developerModule.invoke("config_reset_to_default", {}, ctx);

  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes("firmware reported failure"));
});
