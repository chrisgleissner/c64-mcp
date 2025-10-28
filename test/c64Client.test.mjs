import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { C64Client } from "../src/c64Client.js";
import {
  buildPrinterBasicProgram,
  buildCommodoreBitmapBasicProgram,
  buildEpsonBitmapBasicProgram,
  buildCommodoreDllBasicProgram,
} from "../src/c64Client.js";
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
  const sub = async (fn) => await fn();
  if (target !== "mock") {
    return;
  }

  const mock = await startMockC64Server();
  t.after(async () => {
    await mock.close();
  });

  const client = new C64Client(mock.baseUrl);

  await sub(async () => {
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

  await sub(async () => {
    const opts = { text: "HELLO\nWORLD", formFeed: true };
    const prevRuns = mock.state.runCount;
    const result = await client.printTextOnPrinterAndRun(opts);
    assert.equal(result.success, true);
    assert.equal(mock.state.runCount, prevRuns + 1);
    assert.ok(mock.state.lastPrg instanceof Buffer);
    const expectedSource = buildPrinterBasicProgram(opts);
    const expectedPrg = basicToPrg(expectedSource);
    assert.deepEqual(Array.from(mock.state.lastPrg), Array.from(expectedPrg));
  });

  await sub(async () => {
    const src = buildPrinterBasicProgram({ text: 'A"B' });
    assert.ok(src.includes('PRINT#1,"A""B"'));
  });

  await sub(async () => {
    const src = buildCommodoreBitmapBasicProgram({ columns: [0, 1, 2, 127], repeats: 2, secondaryAddress: 7 });
    // Expect bit7 set => 128,129,130,255 in DATA
    assert.ok(src.includes("DATA 128,129,130,255"));
    assert.ok(src.includes("OPEN1,4,7"));
    assert.ok(src.includes("PRINT#1,CHR$(8);A$"));
  });

  await sub(async () => {
    const src = buildEpsonBitmapBasicProgram({ columns: Array.from({ length: 16 }).map((_, i) => i), mode: "K", repeats: 3, timesPerLine: 2 });
    // n=16, m=0
    assert.ok(src.includes("CHR$(27)+CHR$(75)+CHR$(16)+CHR$(0)"), src);
    assert.ok(src.includes("PRINT#1,A$;A$;CHR$(10);CHR$(13)"));
  });

  await sub(async () => {
    const src = buildCommodoreDllBasicProgram({ firstChar: 65, chars: [{ a: 0, columns: [1,2,3,4,5,6,7,8,9,10,11] }] });
    // t = (1*13)+2 = 15 => n=0, m=15
    assert.ok(src.includes('CHR$(27);"=";CHR$(15);CHR$(0);CHR$(65);CHR$(32);CHR$(0)'));
    assert.ok(src.includes('PRINT#1,CHR$(1),CHR$(2),CHR$(3),CHR$(4),CHR$(5),CHR$(6),CHR$(7),CHR$(8),CHR$(9),CHR$(10),CHR$(11)'));
  });

  await sub(async () => {
    const opts = { columns: [0, 1, 2, 3, 4, 5, 6, 7], repeats: 2, secondaryAddress: 7 };
    const before = mock.state.runCount;
    const result = await client.printBitmapOnCommodoreAndRun(opts);
    assert.equal(result.success, true);
    assert.equal(mock.state.runCount, before + 1);
    const expected = basicToPrg(buildCommodoreBitmapBasicProgram(opts));
    assert.deepEqual(Array.from(mock.state.lastPrg), Array.from(expected));
  });

  await sub(async () => {
    const opts = { columns: Array.from({ length: 16 }).map((_, i) => i), mode: "L", repeats: 1, timesPerLine: 1 };
    const before = mock.state.runCount;
    const result = await client.printBitmapOnEpsonAndRun(opts);
    assert.equal(result.success, true);
    assert.equal(mock.state.runCount, before + 1);
    const expected = basicToPrg(buildEpsonBitmapBasicProgram(opts));
    assert.deepEqual(Array.from(mock.state.lastPrg), Array.from(expected));
  });

  await sub(async () => {
    const opts = { firstChar: 65, chars: [{ a: 1, columns: [1,2,3,4,5,6,7,8,9,10,11] }], secondaryAddress: 0 };
    const before = mock.state.runCount;
    const result = await client.defineCustomCharsOnCommodoreAndRun(opts);
    assert.equal(result.success, true);
    assert.equal(mock.state.runCount, before + 1);
    const expected = basicToPrg(buildCommodoreDllBasicProgram(opts));
    assert.deepEqual(Array.from(mock.state.lastPrg), Array.from(expected));
  });

  await sub(async () => {
    const opts = { text: "EPSON TEXT", target: "epson", formFeed: false };
    const before = mock.state.runCount;
    const result = await client.printTextOnPrinterAndRun(opts);
    assert.equal(result.success, true);
    assert.equal(mock.state.runCount, before + 1);
    const expected = basicToPrg(buildPrinterBasicProgram(opts));
    assert.deepEqual(Array.from(mock.state.lastPrg), Array.from(expected));
  });

  await sub(async () => {
    const v = await client.version();
    assert.ok(v && typeof v === "object");
    const info = await client.info();
    assert.ok(info && typeof info === "object");
  });

  await sub(async () => {
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

  await sub(async () => {
    const result = await client.readMemory("screen", "1");
    assert.equal(result.success, true);
    assert.equal(typeof result.data, "string");
    assert.ok(result.data?.startsWith("$"));
  });

  await sub(async () => {
    const screen = await client.readScreen();
    assert.ok(screen.includes("READY."));
  });

  await sub(async () => {
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

  await sub(async () => {
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

  await sub(async () => {
    const prg = basicToPrg('10 PRINT "RAW"');
    const before = mock.state.runCount;
    const result = await client.runPrg(prg);
    assert.equal(result.success, true);
    assert.equal(mock.state.runCount, before + 1);
  });

  await sub(async () => {
    const result = await client.reset();
    assert.equal(result.success, true);
    assert.equal(mock.state.resets, 1);
  });

  await sub(async () => {
    const result = await client.reboot();
    assert.equal(result.success, true);
    assert.equal(mock.state.reboots, 1);
  });

  await sub(async () => {
    const result = await client.writeMemory("$0400", "$AA55");
    assert.equal(result.success, true);
    assert.deepEqual(Array.from(mock.state.lastWrite.bytes), [0xaa, 0x55]);
  });

  await sub(async () => {
    const result = await client.readMemory("%0000010000000000", "2");
    assert.equal(result.success, true);
    assert.equal(result.data, "$AA55");
  });

  await sub(async () => {
    const r = await client.readMemory("$0400", "4");
    assert.equal(r.success, true);
    assert.equal(typeof r.data, "string");
    // Ensure the mock recorded Accept header with octet-stream
    const accept = String(mock.state.lastRequest.headers["accept"] || "");
    assert.ok(accept.includes("application/octet-stream"));
  });

  await sub(async () => {
    const big = Buffer.alloc(200, 0x42); // 'B'
    const hex = `$${big.toString("hex").toUpperCase()}`;
    const res = await client.writeMemory("$C100", hex);
    assert.equal(res.success, true);
    assert.equal(mock.state.lastWrite.address, 0xC100);
    assert.equal(mock.state.lastWrite.bytes.length, 200);
  });
});

test("C64Client against real C64", async (t) => {
  const sub = async (fn) => await fn();
  if (target !== "real") {
    return;
  }

  const baseUrl = injectedBaseUrl ?? "http://c64u";
  const client = new C64Client(baseUrl);

  await sub(async () => {
    const response = await client.reset();
    assert.equal(response.success, true, `Reset failed: ${JSON.stringify(response.details)}`);
  });

  await sub(async () => {
    const program = '10 PRINT "MCP!"\n20 END';
    const response = await client.uploadAndRunBasic(program);
    assert.equal(response.success, true, `Upload failed: ${JSON.stringify(response.details)}`);
  });

  await sub(async () => {
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

  await sub(async () => {
    const response = await client.reboot();
    assert.equal(response.success, true, `Reboot failed: ${JSON.stringify(response.details)}`);
  });
});
