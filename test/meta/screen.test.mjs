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

test("rip_charset_from_ram extracts charset from specific address", async () => {
  // Create a mock charset with some variation
  const charset = new Uint8Array(2048);
  // Fill with pattern that looks like character data
  for (let charIndex = 0; charIndex < 256; charIndex += 1) {
    const offset = charIndex * 8;
    // Create varied patterns for first 128 chars
    if (charIndex < 128) {
      charset[offset] = charIndex % 256;
      charset[offset + 1] = (charIndex * 2) % 256;
      charset[offset + 2] = (charIndex * 3) % 256;
      charset[offset + 3] = 0xFF;
      charset[offset + 4] = (charIndex * 4) % 256;
      charset[offset + 5] = (charIndex * 5) % 256;
      charset[offset + 6] = (charIndex * 6) % 256;
      charset[offset + 7] = 0x00;
    }
  }
  const hex = Buffer.from(charset).toString("hex").toUpperCase();

  let pauseCalls = 0;
  let resumeCalls = 0;
  let readCalls = 0;

  const out = tmpPath("charset", "out");
  await fs.rm(out.dir, { recursive: true, force: true });
  const outputPath = `${out.dir}/charset.bin`;

  const ctx = {
    client: {
      async pause() { pauseCalls += 1; return { success: true }; },
      async resume() { resumeCalls += 1; return { success: true }; },
      async readMemory(address, length) {
        readCalls += 1;
        assert.equal(address, "$3000");
        assert.equal(length, "2048");
        return { success: true, data: `$${hex}` };
      },
    },
    logger: createLogger(),
  };

  const result = await metaModule.invoke("rip_charset_from_ram", {
    address: "$3000",
    outputPath,
  }, ctx);

  assert.equal(result.metadata?.success, true);
  assert.equal(readCalls, 1);
  assert.equal(pauseCalls, 1);
  assert.equal(resumeCalls, 1);

  const payload = result.structuredContent?.data;
  assert.equal(payload?.found, true);
  assert.ok(payload?.charset);
  assert.equal(payload?.charset.address, "$3000");
  assert.equal(payload?.charset.sizeBytes, 2048);
  assert.ok(payload?.charset.nonEmptyChars > 0);
  assert.ok(payload?.outputFile);
  assert.equal(payload?.outputFile.path, outputPath);

  // Verify file was written
  await fs.access(outputPath);
  const written = await fs.readFile(outputPath);
  assert.equal(written.length, 2048);
});

test("rip_charset_from_ram reports not found when no valid charset", async () => {
  // Create mostly empty data
  const emptyData = new Uint8Array(2048);
  const hex = Buffer.from(emptyData).toString("hex").toUpperCase();

  let pauseCalls = 0;
  let resumeCalls = 0;

  const ctx = {
    client: {
      async pause() { pauseCalls += 1; return { success: true }; },
      async resume() { resumeCalls += 1; return { success: true }; },
      async readMemory() {
        return { success: true, data: `$${hex}` };
      },
    },
    logger: createLogger(),
  };

  const result = await metaModule.invoke("rip_charset_from_ram", {
    address: "$2000",
  }, ctx);

  assert.equal(result.metadata?.success, true);
  assert.equal(pauseCalls, 1);
  assert.equal(resumeCalls, 1);

  const payload = result.structuredContent?.data;
  assert.equal(payload?.found, false);
  assert.ok(payload?.message);
});

test("rip_charset_from_ram scans common locations", async () => {
  // Create a mock charset
  const charset = new Uint8Array(2048);
  for (let charIndex = 0; charIndex < 128; charIndex += 1) {
    const offset = charIndex * 8;
    charset[offset] = charIndex % 256;
    charset[offset + 1] = (charIndex * 2) % 256;
    charset[offset + 2] = 0xFF;
    charset[offset + 3] = (charIndex * 3) % 256;
  }
  const hex = Buffer.from(charset).toString("hex").toUpperCase();

  let pauseCalls = 0;
  let resumeCalls = 0;
  let readCalls = 0;

  const ctx = {
    client: {
      async pause() { pauseCalls += 1; return { success: true }; },
      async resume() { resumeCalls += 1; return { success: true }; },
      async readMemory(address, length) {
        readCalls += 1;
        // Return valid charset data for $3000, empty for others
        if (address === "$3000") {
          return { success: true, data: `$${hex}` };
        }
        const empty = Buffer.alloc(2048).toString("hex").toUpperCase();
        return { success: true, data: `$${empty}` };
      },
    },
    logger: createLogger(),
  };

  const result = await metaModule.invoke("rip_charset_from_ram", {
    scanRange: "common",
  }, ctx);

  assert.equal(result.metadata?.success, true);
  assert.equal(pauseCalls, 1);
  assert.equal(resumeCalls, 1);
  assert.ok(readCalls >= 4); // Should scan multiple common locations

  const payload = result.structuredContent?.data;
  assert.equal(payload?.found, true);
  assert.ok(payload?.charset);
  assert.ok(payload?.candidates >= 1);
});
