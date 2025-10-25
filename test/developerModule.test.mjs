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

  assert.equal(result.content[0].type, "json");
  assert.deepEqual(result.content[0].data, { categories: ["Audio", "Video"] });
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

  assert.equal(result.content[0].type, "json");
  assert.deepEqual(result.content[0].data, { value: { Volume: "10" } });
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
