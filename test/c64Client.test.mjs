import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { C64Client } from "../src/c64Client.js";
import { basicToPrg } from "../src/basicConverter.js";
import { startMockC64Server } from "./mockC64Server.mjs";

const SCREEN_BASE = "$0400";
const SAFE_RAM_BASE = "$C000";

function asciiToHexBytes(text) {
  return Buffer.from(text, "ascii").toString("hex").toUpperCase();
}

async function writeMessageAt(client, baseAddress, message) {
  const hex = asciiToHexBytes(message);
  const write = await client.writeMemory(baseAddress, `$${hex}`);
  return { write, hex: `$${hex}` };
}

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

  await t.test("SID: set volume, note on/off, and silence all", async () => {
    // Volume write should produce a write to $D418
    const vol = await client.sidSetVolume(12);
    assert.equal(vol.success, true);
    assert.equal(mock.state.lastWrite.address, 0xd418);
    assert.equal(mock.state.lastWrite.bytes.length, 1);

    // Note on voice 1 writes FREQ..SR block starting at $D400
    const noteOn = await client.sidNoteOn({ voice: 1, note: "A4", waveform: "pulse", pulseWidth: 0x0800, attack: 1, decay: 2, sustain: 8, release: 3 });
    assert.equal(noteOn.success, true);
    assert.equal(mock.state.lastWrite.address, 0xd400);
    assert.equal(mock.state.lastWrite.bytes.length, 7);

    const noteOff = await client.sidNoteOff(1);
    assert.equal(noteOff.success, true);
    assert.equal(mock.state.lastWrite.address, 0xd404);
    assert.equal(mock.state.lastWrite.bytes[0], 0x00);

    const silence = await client.sidSilenceAll();
    assert.equal(silence.success, true);
    assert.equal(mock.state.lastWrite.address, 0xd418);
    assert.equal(mock.state.lastWrite.bytes[0], 0x00);
  });

  await t.test("write message to high RAM and read back", async () => {
    const message = "HELLO FROM MCP";
    const length = message.length.toString(10);

    const before = await client.readMemory(SAFE_RAM_BASE, length);
    assert.equal(before.success, true);
    const previousHex = before.data ?? null;

    try {
      const { write, hex } = await writeMessageAt(client, SAFE_RAM_BASE, message);
      assert.equal(write.success, true, `Write failed: ${JSON.stringify(write.details)}`);

      const readBack = await client.readMemory(SAFE_RAM_BASE, length);
      assert.equal(readBack.success, true);
      assert.equal(readBack.data, hex);
    } finally {
      if (previousHex) {
        await client.writeMemory(SAFE_RAM_BASE, previousHex);
      }
    }
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
    const program = '10 PRINT "MCP!"\n20 END';
    const response = await client.uploadAndRunBasic(program);
    assert.equal(response.success, true, `Upload failed: ${JSON.stringify(response.details)}`);
  });

  await t.test("read screen from real C64", async () => {
    const screen = await client.readScreen();
    assert.equal(typeof screen, "string");
    assert.ok(screen.length > 0, "Screen buffer empty");
  });

  // TODO(chris): Re-enable once the real hardware exposes consistent RAM reads at $C000
  // await t.test("write message to real high RAM and read back", async () => {
  //   const message = "MCP SCREEN TEST";
  //   const length = message.length.toString(10);

  //   const before = await client.readMemory(SAFE_RAM_BASE, length);
  //   assert.equal(before.success, true, `Pre-read failed: ${JSON.stringify(before.details)}`);
  //   const previousHex = before.data ?? null;

  //   try {
  //     const { write, hex } = await writeMessageAt(client, SAFE_RAM_BASE, message);
  //     assert.equal(write.success, true, `Write failed: ${JSON.stringify(write.details)}`);

  //     const readBack = await client.readMemory(SAFE_RAM_BASE, length);
  //     assert.equal(readBack.success, true, `Read-back failed: ${JSON.stringify(readBack.details)}`);
  //     assert.equal(readBack.data, hex);
  //   } finally {
  //     if (previousHex) {
  //       await client.writeMemory(SAFE_RAM_BASE, previousHex);
  //     }
  //   }
  // });

  await t.test("reboot real C64", async () => {
    const response = await client.reboot();
    assert.equal(response.success, true, `Reboot failed: ${JSON.stringify(response.details)}`);
  });
});
