import test from "node:test";
import assert from "node:assert/strict";
import { bitmapToHexRows, bitmapToPetsciiCodes, createPetsciiArt } from "../src/petsciiArt.js";
import { findGlyphByBasicChar } from "../src/chargen.js";

test("bitmapToHexRows encodes binary rows into concatenated hex", () => {
  const width = 16;
  const height = 2;
  const pixels = new Uint8Array(width * height);
  // First row all white (0), second row all black (1)
  for (let x = 0; x < width; x += 1) {
    pixels[width + x] = 1;
  }
  const rows = bitmapToHexRows({ width, height, pixels });
  assert.equal(rows.length, 2);
  assert.equal(rows[0], "0000");
  assert.equal(rows[1], "ffff");
});

test("bitmapToPetsciiCodes maps an 8x8 bitmap block to the expected glyph", () => {
  const glyph = findGlyphByBasicChar("A");
  assert.ok(glyph, "Expected to find glyph for 'A'");
  const bitmap = {
    width: 8,
    height: 8,
    pixels: new Uint8Array(64),
  };

  for (let row = 0; row < 8; row += 1) {
    const byte = glyph.bitmap[row] ?? 0;
    for (let col = 0; col < 8; col += 1) {
      const bit = (byte >> (7 - col)) & 0x1;
      bitmap.pixels[row * 8 + col] = bit;
    }
  }

  const converted = bitmapToPetsciiCodes(bitmap);
  assert.equal(converted.codes.length, 1);
  assert.equal(converted.codes[0], glyph.petsciiCode);
});

test("createPetsciiArt builds BASIC program and metadata for text prompts", () => {
  const art = createPetsciiArt({ text: "HI", maxWidth: 320, maxHeight: 200, foregroundColor: 1 });
  assert.equal(art.charColumns, 2);
  assert.equal(art.charRows, 1);
  assert.deepEqual(art.petsciiCodes.slice(0, 2), [72, 73]);
  assert.ok(art.program.includes("FORY=0TO0"));
  assert.ok(art.program.includes("DATA 72,73"));
  assert.equal(art.sourceText, "HI");
});

test("createPetsciiArt recognises heart prompts via shape templates", () => {
  const art = createPetsciiArt({ prompt: "Please make a heart ASCII art" });
  assert.equal(art.usedShape, "heart");
  assert.ok(art.bitmap.width > 0);
  assert.ok(art.bitmap.height > 0);
  assert.ok(art.bitmapHex.length > 0);
});
