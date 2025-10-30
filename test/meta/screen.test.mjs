import test from "#test/runner";
import assert from "#test/assert";
import { metaModule } from "../../src/tools/meta/index.js";
import { createLogger, tmpPath } from "./helpers.mjs";
import fs from "node:fs/promises";

function createSprite(fillFn) {
  const bytes = new Uint8Array(63);
  const setPixel = (x, y) => {
    if (x < 0 || x > 23 || y < 0 || y > 20) return;
    const byteIndex = Math.floor(x / 8);
    const bitIndex = 7 - (x % 8);
    const index = (y * 3) + byteIndex;
    bytes[index] |= (1 << bitIndex);
  };
  for (let y = 0; y < 21; y += 1) {
    for (let x = 0; x < 24; x += 1) {
      if (fillFn(x, y)) setPixel(x, y);
    }
  }
  return bytes;
}

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

test("extract_sprites_from_ram finds sprites and writes files", async () => {
  const spriteA = createSprite((x, y) => x === y || x === (23 - y));
  const spriteB = createSprite((x, y) => y >= 8 && y <= 12 && x >= 4 && x <= 19);
  const stride = 64;
  const blob = new Uint8Array(stride * 2);
  blob.set(spriteA, 0);
  blob.set(spriteB, stride);
  const hex = Buffer.from(blob).toString("hex").toUpperCase();

  let pauseCalls = 0;
  let resumeCalls = 0;
  let readCalls = 0;

  const out = tmpPath("sprites", "out");
  await fs.rm(out.dir, { recursive: true, force: true });

  const ctx = {
    client: {
      async pause() { pauseCalls += 1; return { success: true }; },
      async resume() { resumeCalls += 1; return { success: true }; },
      async readMemory(address, length) {
        readCalls += 1;
        assert.equal(address, "$2000");
        assert.equal(length, String(blob.length));
        return { success: true, data: `$${hex}` };
      },
    },
    logger: createLogger(),
  };

  const result = await metaModule.invoke("extract_sprites_from_ram", {
    address: "$2000",
    length: blob.length,
    stride,
    maxSprites: 4,
    outputDir: out.dir,
  }, ctx);

  assert.equal(result.metadata?.success, true);
  assert.equal(readCalls, 1);
  assert.equal(pauseCalls, 1);
  assert.equal(resumeCalls, 1);

  const payload = result.structuredContent?.data;
  assert.ok(Array.isArray(payload?.sprites));
  assert.equal(payload?.sprites.length, 2);
  const [first, second] = payload.sprites;
  assert.ok(first.boundingBox);
  assert.ok(second.boundingBox);
  assert.ok(first.totalSetBits > 0);
  assert.equal(payload.outputFiles.length, 2);
  for (const file of payload.outputFiles) {
    await fs.access(file.path);
  }
});

test("extract_sprites_from_ram surfaces firmware failures", async () => {
  let pauseCalls = 0;
  let resumeCalls = 0;
  const ctx = {
    client: {
      async pause() { pauseCalls += 1; return { success: true }; },
      async resume() { resumeCalls += 1; return { success: true }; },
      async readMemory() { return { success: false, details: { reason: "boom" } }; },
    },
    logger: createLogger(),
  };

  const result = await metaModule.invoke("extract_sprites_from_ram", {
    address: "$2000",
    length: 256,
    stride: 64,
  }, ctx);

  assert.equal(result.isError, true);
  assert.equal(result.metadata?.error?.kind, "execution");
  assert.equal(pauseCalls, 1);
  assert.equal(resumeCalls, 1);
});
