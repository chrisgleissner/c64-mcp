import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { C64Client } from "../src/c64Client.js";
import { basicToPrg } from "../src/basicConverter.js";
import { startMockC64Server } from "./mockC64Server.mjs";

const target = (process.env.C64_TEST_TARGET ?? "mock").toLowerCase();
const injectedBaseUrl = process.env.C64_TEST_BASE_URL;

test("C64Client against mock server", async (t) => {
  if (target !== "mock") {
    t.skip("mock target disabled");
    return;
  }

  const mock = await startMockC64Server();
  t.after(async () => {
    await mock.close();
  });

  const client = new C64Client(mock.baseUrl);

  await t.test("uploadAndRunBasic sends PRG payload", async () => {
    const program = '10 PRINT "HELLO"';
    const result = await client.uploadAndRunBasic(program);
    assert.equal(result.success, true);
    assert.ok(mock.state.lastPrg instanceof Buffer);
    assert.equal(mock.state.runCount, 1);
    const prg = mock.state.lastPrg;
    assert.equal(prg.readUInt16LE(0), 0x0801);
    const firstLinePointer = prg.readUInt16LE(2);
    const firstLineNumber = prg.readUInt16LE(4);
    assert.equal(firstLineNumber, 10);
    assert.ok(firstLinePointer > 0x0801);
    assert.equal(prg[6], 0x99);
    const finalMarker = prg.subarray(-2);
    assert.deepEqual(Array.from(finalMarker), [0x00, 0x00]);
  });

  await t.test("version and info endpoints respond", async () => {
    const v = await client.version();
    assert.ok(v && typeof v === "object");
    const info = await client.info();
    assert.ok(info && typeof info === "object");
  });

  await t.test("pause/resume and debugreg read/write work", async () => {
    let r = await client.pause();
    assert.equal(r.success, true);
    r = await client.resume();
    assert.equal(r.success, true);

    const write = await client.debugregWrite("AB");
    assert.equal(write.success, true);
    const read = await client.debugregRead();
    assert.equal(read.success, true);
    assert.equal(read.value?.toUpperCase(), "AB");
  });

  await t.test("symbol address 'screen' resolves for readMemory", async () => {
    const result = await client.readMemory("screen", "1");
    assert.equal(result.success, true);
    assert.equal(typeof result.data, "string");
    assert.ok(result.data?.startsWith("$"));
  });

  await t.test("readScreen returns translated ASCII text", async () => {
    const screen = await client.readScreen();
    assert.ok(screen.includes("READY."));
  });

  await t.test("runPrg uploads a raw PRG payload", async () => {
    const prg = basicToPrg('10 PRINT "RAW"');
    const result = await client.runPrg(prg);
    assert.equal(result.success, true);
    assert.equal(mock.state.runCount, 2);
  });

  await t.test("reset returns success", async () => {
    const result = await client.reset();
    assert.equal(result.success, true);
    assert.equal(mock.state.resets, 1);
  });

  await t.test("reboot triggers firmware endpoint", async () => {
    const result = await client.reboot();
    assert.equal(result.success, true);
    assert.equal(mock.state.reboots, 1);
  });

  await t.test("writeMemory writes bytes to mock memory", async () => {
    const result = await client.writeMemory("$0400", "$AA55");
    assert.equal(result.success, true);
    assert.deepEqual(Array.from(mock.state.lastWrite.bytes), [0xaa, 0x55]);
  });

  await t.test("readMemory returns hex string with prefix", async () => {
    const result = await client.readMemory("%0000010000000000", "2");
    assert.equal(result.success, true);
    assert.equal(result.data, "$AA55");
  });
});

test("C64Client against real C64", async (t) => {
  if (target !== "real") {
    t.skip("real target disabled");
    return;
  }

  const baseUrl = injectedBaseUrl ?? "http://c64u";
  const client = new C64Client(baseUrl);

  await t.test("reset real C64", async () => {
    const response = await client.reset();
    assert.equal(response.success, true, `Reset failed: ${JSON.stringify(response.details)}`);
  });

  await t.test("upload program to real C64", async () => {
    const program = '10 PRINT "MCP!"\n20 GOTO 10';
    const response = await client.uploadAndRunBasic(program);
    assert.equal(response.success, true, `Upload failed: ${JSON.stringify(response.details)}`);
  });

  await t.test("read screen from real C64", async () => {
    const screen = await client.readScreen();
    assert.equal(typeof screen, "string");
    assert.ok(screen.length > 0, "Screen buffer empty");
  });

  await t.test("reboot real C64", async () => {
    const response = await client.reboot();
    assert.equal(response.success, true, `Reboot failed: ${JSON.stringify(response.details)}`);
  });
});
