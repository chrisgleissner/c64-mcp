import test from "#test/runner";
import assert from "#test/assert";
import { screenCodesToAscii } from "../src/petscii.js";
import { getChargenGlyphs } from "../src/chargen.js";

function buildCharToScreenMap() {
  const map = new Map();
  for (const glyph of getChargenGlyphs()) {
    if (!glyph || typeof glyph.screenCode !== "number") {
      continue;
    }
    if (glyph.basic && glyph.basic.length === 1 && !map.has(glyph.basic)) {
      map.set(glyph.basic, glyph.screenCode & 0xff);
    }
  }
  return map;
}

test("screenCodesToAscii converts screen memory into readable rows", () => {
  const charToScreen = buildCharToScreenMap();
  const spaceCode = charToScreen.get(" ") ?? 0x20;
  const message = "?SYNTAX ERROR IN 80";
  const buffer = new Uint8Array(40);
  buffer.fill(spaceCode);
  for (let i = 0; i < message.length; i += 1) {
    const char = message[i];
    buffer[i] = charToScreen.get(char) ?? spaceCode;
  }

  const text = screenCodesToAscii(buffer, { columns: 40, rows: 1 });
  assert.equal(text, message);
});

test("screenCodesToAscii trims trailing rows by default", () => {
  const charToScreen = buildCharToScreenMap();
  const spaceCode = charToScreen.get(" ") ?? 0x20;
  const buffer = new Uint8Array(80);
  buffer.fill(spaceCode);
  const label = "READY.";
  for (let i = 0; i < label.length; i += 1) {
    buffer[i] = charToScreen.get(label[i]) ?? spaceCode;
  }

  const text = screenCodesToAscii(buffer, { columns: 40, rows: 2 });
  assert.equal(text, label);
});
