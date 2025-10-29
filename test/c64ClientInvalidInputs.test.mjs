import test from "#test/runner";
import assert from "#test/assert";
import { C64Client } from "../src/c64Client.js";

test("C64Client: readMemory fails on invalid inputs", async () => {
  const client = new C64Client("http://example.invalid");

  // Invalid length (<=0)
  const r1 = await client.readMemory("$0400", "0");
  assert.equal(r1.success, false);
  assert.ok(String(r1.details?.message || r1.details).toLowerCase().includes("length"));

  // Invalid address
  const r2 = await client.readMemory("GARBAGE", "1");
  assert.equal(r2.success, false);
  assert.ok(String(r2.details?.message || r2.details).toLowerCase().includes("unable to parse"));
});

test("C64Client: writeMemory validates hex string", async () => {
  const client = new C64Client("http://example.invalid");

  const e1 = await client.writeMemory("$0400", "$");
  assert.equal(e1.success, false);
  assert.ok(String(e1.details?.message || e1.details).toLowerCase().includes("no hexadecimal"));

  const e2 = await client.writeMemory("$0400", "$A");
  assert.equal(e2.success, false);
  assert.ok(String(e2.details?.message || e2.details).toLowerCase().includes("even number"));
});

test("C64Client: sid helpers validate inputs", async () => {
  const client = new C64Client("http://example.invalid");

  const badVoice = await client.sidNoteOn({ voice: 0, note: "A4" });
  assert.equal(badVoice.success, false);
  assert.ok(String(badVoice.details?.message || badVoice.details).includes("Voice"));
});
