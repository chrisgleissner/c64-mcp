import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { graphicsModule } from "../src/tools/graphics.js";

function createLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

test("generate_sprite_prg accepts base64 sprite data and delegates to client", async () => {
  const sprite = Buffer.alloc(63, 0x11).toString("base64");
  const calls = [];
  const ctx = {
    client: {
      async generateAndRunSpritePrg(options) {
        calls.push(options);
        return { success: true, details: { prgBytes: 2048 } };
      },
    },
    logger: createLogger(),
  };

  const result = await graphicsModule.invoke(
    "generate_sprite_prg",
    { sprite, index: 2, x: 120, y: 150, color: 5, multicolour: true },
    ctx,
  );

  assert.equal(result.content[0].type, "text");
  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.index, 2);
  assert.equal(result.metadata.spriteByteLength, 63);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].spriteBytes instanceof Uint8Array);
  assert.equal(calls[0].spriteBytes.length, 63);
  assert.equal(calls[0].spriteIndex, 2);
  assert.equal(calls[0].multicolour, true);
});

test("generate_sprite_prg rejects invalid sprite definition", async () => {
  const ctx = {
    client: {
      async generateAndRunSpritePrg() {
        throw new Error("should not be called");
      },
    },
    logger: createLogger(),
  };

  const result = await graphicsModule.invoke("generate_sprite_prg", { sprite: "AA==" }, ctx);
  assert.equal(result.isError, true);
  assert.equal(result.content[0].type, "text");
  assert.equal(result.metadata.error.kind, "validation");
});

test("render_petscii_screen delegates to client", async () => {
  const calls = [];
  const ctx = {
    client: {
      async renderPetsciiScreenAndRun(payload) {
        calls.push(payload);
        return { success: true, details: { lines: 3 } };
      },
    },
    logger: createLogger(),
  };

  const result = await graphicsModule.invoke(
    "render_petscii_screen",
    { text: "HELLO", borderColor: 4 },
    ctx,
  );

  assert.equal(result.content[0].type, "text");
  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.textLength, 5);
  assert.equal(result.metadata.borderColor, 4);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { text: "HELLO", borderColor: 4 });
});

test("create_petscii_image generates art and uploads program", async () => {
  const uploads = [];
  const ctx = {
    client: {
      async uploadAndRunBasic(program) {
        uploads.push(program);
        return { success: true, details: { programLength: program.length } };
      },
    },
    logger: createLogger(),
  };

  const result = await graphicsModule.invoke(
    "create_petscii_image",
    { prompt: "Draw a star with PETSCII" },
    ctx,
  );

  assert.equal(result.content[0].type, "json");
  assert.equal(result.metadata.ranOnC64, true);
  assert.equal(result.metadata.dryRun, false);
  assert.equal(uploads.length, 1);
  const payload = result.content[0].data;
  assert.ok(typeof payload.program === "string" && payload.program.length > 0);
  assert.equal(payload.success, true);
  assert.equal(payload.ranOnC64, true);
  assert.equal(typeof payload.bitmapHex, "string");
  assert.ok(Array.isArray(payload.rowHex));
});

test("create_petscii_image dry run skips upload", async () => {
  const ctx = {
    client: {
      async uploadAndRunBasic() {
        throw new Error("dry run should not upload");
      },
    },
    logger: createLogger(),
  };

  const result = await graphicsModule.invoke(
    "create_petscii_image",
    { text: "HELLO", dryRun: true, borderColor: 3, backgroundColor: 0 },
    ctx,
  );

  assert.equal(result.content[0].type, "json");
  assert.equal(result.metadata.dryRun, true);
  assert.equal(result.metadata.ranOnC64, false);
  const payload = result.content[0].data;
  assert.equal(payload.ranOnC64, false);
  assert.equal(payload.success, true);
});
