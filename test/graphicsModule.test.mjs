import test from "#test/runner";
import assert from "#test/assert";
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

  assert.equal(result.content[0].type, "text");
  assert.equal(result.metadata.ranOnC64, true);
  assert.equal(result.metadata.dryRun, false);
  assert.equal(uploads.length, 1);
  const payload = JSON.parse(result.content[0].text);
  assert.equal(result.structuredContent?.type, "json");
  assert.deepEqual(result.structuredContent?.data, payload);
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

  assert.equal(result.content[0].type, "text");
  assert.equal(result.metadata.dryRun, true);
  assert.equal(result.metadata.ranOnC64, false);
  const payload = JSON.parse(result.content[0].text);
  assert.equal(result.structuredContent?.type, "json");
  assert.deepEqual(result.structuredContent?.data, payload);
  assert.equal(payload.ranOnC64, false);
  assert.equal(payload.success, true);
});

test("generate_sprite_prg handles firmware failure", async () => {
  const sprite = Buffer.alloc(63, 0x11).toString("base64");
  const ctx = {
    client: {
      async generateAndRunSpritePrg() {
        return { success: false, details: { error: "sprite error" } };
      },
    },
    logger: createLogger(),
  };

  const result = await graphicsModule.invoke(
    "generate_sprite_prg",
    { sprite, index: 0, x: 100, y: 100, color: 1 },
    ctx,
  );

  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes("firmware reported failure"));
});

test("render_petscii_screen handles firmware failure", async () => {
  const ctx = {
    client: {
      async renderPetsciiScreenAndRun() {
        return { success: false, details: { error: "render error" } };
      },
    },
    logger: createLogger(),
  };

  const result = await graphicsModule.invoke(
    "render_petscii_screen",
    { text: "TEST" },
    ctx,
  );

  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes("firmware reported failure"));
});

test("create_petscii_image handles upload failure", async () => {
  const ctx = {
    client: {
      async uploadAndRunBasic() {
        return { success: false, details: { error: "upload error" } };
      },
    },
    logger: createLogger(),
  };

  const result = await graphicsModule.invoke(
    "create_petscii_image",
    { text: "TEST" },
    ctx,
  );

  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes("firmware reported failure"));
});

test("create_petscii_image validates input requirements", async () => {
  const ctx = {
    client: {
      async uploadAndRunBasic() {
        throw new Error("should not be called");
      },
    },
    logger: createLogger(),
  };

  const result = await graphicsModule.invoke("create_petscii_image", {}, ctx);

  assert.equal(result.isError, true);
  assert.equal(result.metadata.error.kind, "validation");
});

test("create_petscii_image includes preview fields and executes PRG", async () => {
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
    { text: "HI", borderColor: 1, backgroundColor: 0, foregroundColor: 7, dryRun: false },
    ctx,
  );

  assert.equal(result.content[0].type, "text");
  const payload = JSON.parse(result.content[0].text);
  
  // Verify PRG execution
  assert.equal(payload.success, true);
  assert.equal(payload.ranOnC64, true);
  assert.equal(uploads.length, 1);
  assert.ok(typeof payload.program === "string" && payload.program.length > 0);
  
  // Verify preview fields are present
  assert.ok(Array.isArray(payload.petsciiCodes), "petsciiCodes should be an array");
  assert.ok(payload.petsciiCodes.length > 0, "petsciiCodes should contain codes");
  assert.ok(typeof payload.bitmapHex === "string", "bitmapHex should be a string");
  assert.ok(Array.isArray(payload.rowHex), "rowHex should be an array");
  assert.ok(typeof payload.width === "number", "width should be a number");
  assert.ok(typeof payload.height === "number", "height should be a number");
  assert.ok(typeof payload.charColumns === "number", "charColumns should be a number");
  assert.ok(typeof payload.charRows === "number", "charRows should be a number");
});

test("generate_sprite_prg verifies sprite bytes, coordinates, and colour", async () => {
  const sprite = Buffer.alloc(63, 0xFF).toString("base64");
  const calls = [];
  const ctx = {
    client: {
      async generateAndRunSpritePrg(options) {
        calls.push(options);
        return { success: true, details: { prgBytes: 2048, spriteVisible: true } };
      },
    },
    logger: createLogger(),
  };

  const result = await graphicsModule.invoke(
    "generate_sprite_prg",
    { sprite, index: 1, x: 100, y: 80, color: 3, multicolour: false },
    ctx,
  );

  assert.equal(result.content[0].type, "text");
  assert.equal(result.metadata.success, true);
  
  // Verify sprite bytes copied correctly
  assert.equal(result.metadata.spriteByteLength, 63);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].spriteBytes instanceof Uint8Array);
  assert.equal(calls[0].spriteBytes.length, 63);
  
  // Verify coordinates applied
  assert.equal(calls[0].x, 100);
  assert.equal(calls[0].y, 80);
  assert.equal(result.metadata.x, 100);
  assert.equal(result.metadata.y, 80);
  
  // Verify colour applied  
  assert.equal(calls[0].color, 3);
  assert.equal(result.metadata.color, 3);
  
  // Verify sprite index
  assert.equal(calls[0].spriteIndex, 1);
  assert.equal(result.metadata.index, 1);
});
