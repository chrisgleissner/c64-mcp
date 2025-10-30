import test from "#test/runner";
import assert from "#test/assert";
import { metaModule } from "../../src/tools/meta/index.js";
import { createLogger } from "./helpers.mjs";

test("wait_for_screen_text resolves when pattern appears", async () => {
  let calls = 0;
  const ctx = {
    client: {
      async readScreen() { calls += 1; return calls < 2 ? "booting..." : "READY."; },
    },
    logger: createLogger(),
  };
  const res = await metaModule.invoke("wait_for_screen_text", { pattern: "READY.", timeoutMs: 500, intervalMs: 10 }, ctx);
  assert.equal(res.metadata?.success, true);
  const body = res.structuredContent?.data;
  assert.equal(body?.matched, true);
  assert.ok(body?.elapsedMs >= 0);
});

test("wait_for_screen_text fails on timeout", async () => {
  const ctx = {
    client: { async readScreen() { return "never"; } },
    logger: createLogger(),
  };
  const res = await metaModule.invoke("wait_for_screen_text", { pattern: "READY.", timeoutMs: 50, intervalMs: 5 }, ctx);
  assert.equal(res.isError, true);
  assert.equal(res.metadata?.error?.kind, "execution");
});
