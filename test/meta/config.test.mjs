import test from "#test/runner";
import assert from "#test/assert";
import fs from "node:fs/promises";
import { metaModule } from "../../src/tools/meta/index.js";
import { createLogger, tmpPath } from "./helpers.mjs";

test("config_snapshot_and_restore snapshot and restore", async () => {
  const { file, dir } = tmpPath("config", "config-snapshot.json");
  await fs.mkdir(dir, { recursive: true });
  let batchUpdated = false;
  const ctx = {
    client: {
      async version() { return { version: "1.0.0" }; },
      async info() { return { device: "u64" }; },
      async configsList() { return { categories: ["Audio"] }; },
      async configGet(cat) { return cat === "Audio" ? { Volume: "10" } : {}; },
      async configBatchUpdate() { batchUpdated = true; return { success: true }; },
      async configSaveToFlash() { return { success: true }; },
    },
    logger: createLogger(),
  };

  const snap = await metaModule.invoke("config_snapshot_and_restore", { action: "snapshot", path: file }, ctx);
  assert.equal(snap.metadata?.success, true);
  const content = JSON.parse(await fs.readFile(file, "utf8"));
  assert.ok(content.categories?.Audio);

  const restore = await metaModule.invoke("config_snapshot_and_restore", { action: "restore", path: file, applyToFlash: true }, ctx);
  assert.equal(restore.metadata?.success, true);
  assert.equal(batchUpdated, true);
});

test("config_snapshot_and_restore diff reports changes", async () => {
  const { file, dir } = tmpPath("config", "config-diff.json");
  await fs.mkdir(dir, { recursive: true });
  const snapshot = {
    createdAt: new Date().toISOString(),
    version: { v: 1 },
    info: { device: "u64" },
    categories: { Audio: { Volume: "10" } },
  };
  await fs.writeFile(file, JSON.stringify(snapshot, null, 2), "utf8");

  const ctx = {
    client: {
      async configsList() { return { categories: ["Audio"] }; },
      async configGet(cat) { return cat === "Audio" ? { Volume: "11" } : {}; },
    },
    logger: createLogger(),
  };

  const res = await metaModule.invoke("config_snapshot_and_restore", { action: "diff", path: file }, ctx);
  assert.equal(res.metadata?.success, true);
  assert.equal(res.metadata?.changed, 1);
  const diff = res.structuredContent?.data?.diff ?? {};
  assert.ok(diff.Audio);
});

test("config_snapshot_and_restore validates snapshot input", async () => {
  const { file, dir } = tmpPath("config", "invalid.json");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, "not json", "utf8");
  const ctx = { client: {}, logger: createLogger() };
  const res = await metaModule.invoke("config_snapshot_and_restore", { action: "restore", path: file }, ctx);
  assert.equal(res.isError, true);
});
