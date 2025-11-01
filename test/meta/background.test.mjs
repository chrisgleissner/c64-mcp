import test from "#test/runner";
import assert from "#test/assert";
import fs from "node:fs/promises";
import { metaModule } from "../../src/tools/meta/index.js";
import { createLogger, tmpPath, waitForTaskCompletion } from "./helpers.mjs";

test("background tasks persist and complete iterations", async () => {
  const { file, dir } = tmpPath("background", "tasks.json");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, JSON.stringify({ tasks: [] }, null, 2));
  const previous = process.env.C64_TASK_STATE_FILE;
  process.env.C64_TASK_STATE_FILE = file;
  try {
    const ctx = {
      client: {
        async readMemory() { return { success: true, data: "$00" }; },
      },
      logger: createLogger(),
    };

  const start = await metaModule.invoke("start_background_task", { name: "t1", operation: "read", arguments: { address: "$0400", length: 1 }, intervalMs: 5, maxIterations: 2 }, ctx);
    assert.equal(start.metadata?.success, true);

    const t1 = await waitForTaskCompletion(metaModule, "t1", ctx);
    assert.ok(t1, "background task t1 should be present after completion window");
    assert.ok(t1.status === "completed" || t1.status === "stopped", `unexpected status ${String(t1.status)}`);

    const stopped = await metaModule.invoke("stop_background_task", { name: "t1" }, ctx);
    assert.equal(stopped.metadata?.success, true);

    const data = JSON.parse(await fs.readFile(file, "utf8"));
    assert.ok(Array.isArray(data.tasks));
  } finally {
    if (previous === undefined) delete process.env.C64_TASK_STATE_FILE;
    else process.env.C64_TASK_STATE_FILE = previous;
  }
});

test("background tasks handle unknown operation and stop all", async () => {
  const { file, dir } = tmpPath("background2", "tasks.json");
  await fs.mkdir(dir, { recursive: true });
  const previous = process.env.C64_TASK_STATE_FILE;
  process.env.C64_TASK_STATE_FILE = file;
  try {
    const ctx = { client: {}, logger: createLogger() };

    let res = await metaModule.invoke("start_background_task", { name: "noop", operation: "unknown_op", intervalMs: 5, maxIterations: 1 }, ctx);
    assert.equal(res.metadata?.success, true);
    await waitForTaskCompletion(metaModule, "noop", ctx);
    res = await metaModule.invoke("stop_all_background_tasks", {}, ctx);
    assert.equal(res.metadata?.success, true);
    const list = await metaModule.invoke("list_background_tasks", {}, ctx);
    assert.equal(list.metadata?.success, true);
  } finally {
    if (previous === undefined) delete process.env.C64_TASK_STATE_FILE;
    else process.env.C64_TASK_STATE_FILE = previous;
  }
});
