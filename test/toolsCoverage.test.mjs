import test from "#test/runner";
import assert from "#test/assert";
import { Buffer } from "node:buffer";
import { C64Client } from "../src/c64Client.js";

process.env.C64_TEST_TARGET = "stub";

const writes = [];
let lastPrg = null;

const stubFacade = {
  type: "c64u",
  async ping() { return true; },
  async runPrg(prg) { lastPrg = prg; return { success: true, details: { prgLength: prg?.length ?? 0 } }; },
  async loadPrgFile() { return { success: true }; },
  async runPrgFile() { return { success: true }; },
  async runCrtFile() { return { success: true }; },
  async sidplayFile() { return { success: true }; },
  async sidplayAttachment() { return { success: true }; },
  async readMemory(_address, length) { return new Uint8Array(Array.from({ length }, (_, i) => i & 0xff)); },
  async writeMemory(address, bytes) {
    const copy = bytes instanceof Uint8Array ? Uint8Array.from(bytes) : Uint8Array.from(Buffer.from(bytes));
    writes.push({ address, bytes: copy });
  },
  async reset() { return { success: true }; },
  async reboot() { return { success: true }; },
  async pause() { return { success: true }; },
  async resume() { return { success: true }; },
  async poweroff() { return { success: true }; },
  async menuButton() { return { success: true }; },
  async debugregRead() { return { success: true, value: "AB" }; },
  async debugregWrite() { return { success: true, value: "AB" }; },
  async version() { return { version: "stub" }; },
  async info() { return { product: "stub" }; },
  async drivesList() { return { drives: [{ a: { enabled: true } }] }; },
  async driveMount() { return { success: true }; },
  async driveRemove() { return { success: true }; },
  async driveReset() { return { success: true }; },
  async driveOn() { return { success: true }; },
  async driveOff() { return { success: true }; },
  async driveSetMode() { return { success: true }; },
  async driveLoadRom() { return { success: true }; },
  async streamStart() { return { success: true }; },
  async streamStop() { return { success: true }; },
  async configsList() { return { categories: ["Audio"] }; },
  async configGet() { return { audio: "stub" }; },
  async configSet() { return { success: true }; },
  async configBatchUpdate() { return { success: true }; },
  async configLoadFromFlash() { return { success: true }; },
  async configSaveToFlash() { return { success: true }; },
  async configResetToDefault() { return { success: true }; },
  async filesInfo() { return { info: { size: 1024 } }; },
  async filesCreateD64() { return { success: true }; },
  async filesCreateD71() { return { success: true }; },
  async filesCreateD81() { return { success: true }; },
  async filesCreateDnp() { return { success: true }; },
  async modplayFile() { return { success: true }; },
};

function expectSuccess(result, message) {
  assert.ok(result && typeof result === "object", message ?? "expected object result");
  assert.equal(result.success, true, message ?? "expected success true");
}

test("C64Client MCP tool coverage", async (t) => {
  const client = new C64Client("http://stub.local");
  Reflect.set(client, "facadePromise", Promise.resolve(stubFacade));

  await t.test("program runners", async () => {
    const basicResult = await client.uploadAndRunBasic('10 PRINT "HELLO"\n20 END');
    expectSuccess(basicResult, "upload_and_run_basic");
    assert.ok(lastPrg instanceof Uint8Array, "PRG bytes captured");

    const asm = await client.uploadAndRunAsm("*=$0801\nBRK");
    expectSuccess(asm, "upload_and_run_asm");

    expectSuccess(await client.loadPrgFile("//disk/demo.prg"), "load_prg_file");
    expectSuccess(await client.runPrgFile("//disk/demo.prg"), "run_prg_file");
    expectSuccess(await client.runCrtFile("//cart/game.crt"), "run_crt_file");
    expectSuccess(await client.sidplayFile("//music/song.sid", 1), "sidplay_file");
    expectSuccess(await client.modplayFile("//music/song.mod"), "modplay_file");
  });

  await t.test("printer helpers", async () => {
    expectSuccess(await client.printTextOnPrinterAndRun({ text: "HELLO" }), "print_text");
    expectSuccess(await client.printBitmapOnCommodoreAndRun({ columns: [0, 1, 2], repeats: 1, secondaryAddress: 7 }), "print_bitmap_commodore");
    expectSuccess(await client.printBitmapOnEpsonAndRun({ columns: [0, 1, 2, 3], mode: "L", repeats: 1, timesPerLine: 1 }), "print_bitmap_epson");
    expectSuccess(await client.defineCustomCharsOnCommodoreAndRun({ firstChar: 65, chars: [{ a: 1, columns: Array.from({ length: 11 }, () => 0) }], secondaryAddress: 0 }), "printer_dll");
  });

  await t.test("graphics helpers", async () => {
    const spriteBytes = new Uint8Array(63).fill(0x11);
    expectSuccess(await client.generateAndRunSpritePrg({ spriteBytes, spriteIndex: 0, x: 100, y: 50, color: 2, multicolour: false }), "generate_sprite_prg");
    expectSuccess(await client.renderPetsciiScreenAndRun({ text: "PETSCII" }), "render_petscii_screen");
  });

  await t.test("memory access", async () => {
    const read = await client.readMemory("$0400", "4");
    expectSuccess(read, "read_memory");
    assert.equal(read.data, "$00010203");

    const write = await client.writeMemory("$0400", "$AA55");
    expectSuccess(write, "write_memory");
    const lastWrite = writes[writes.length - 1];
    assert.equal(lastWrite.address, 0x0400);
    assert.deepEqual(Array.from(lastWrite.bytes), [0xaa, 0x55]);
  });

  await t.test("machine controls", async () => {
    expectSuccess(await client.reset(), "reset_c64");
    expectSuccess(await client.reboot(), "reboot_c64");
    expectSuccess(await client.pause(), "pause");
    expectSuccess(await client.resume(), "resume");
    expectSuccess(await client.poweroff(), "poweroff");
    expectSuccess(await client.menuButton(), "menu_button");

    const debugRead = await client.debugregRead();
    assert.equal(debugRead.success, true);
    assert.equal(debugRead.value, "AB");

    const debugWrite = await client.debugregWrite("CD");
    assert.equal(debugWrite.success, true);
  });

  await t.test("sid helpers", async () => {
    expectSuccess(await client.sidSetVolume(12), "sid_volume");
    expectSuccess(await client.sidReset(false), "sid_reset_soft");
    expectSuccess(await client.sidReset(true), "sid_reset_hard");
    expectSuccess(await client.sidNoteOn({ voice: 1, note: "A4", waveform: "pulse" }), "sid_note_on");
    expectSuccess(await client.sidNoteOff(1), "sid_note_off");
    expectSuccess(await client.sidSilenceAll(), "sid_silence_all");
  });

  await t.test("drive + stream", async () => {
    const drives = await client.drivesList();
    assert.ok(drives);
    expectSuccess(await client.driveMount("a", "/tmp/demo.d64", { type: "d64", mode: "readwrite" }), "drive_mount");
    expectSuccess(await client.driveRemove("a"), "drive_remove");
    expectSuccess(await client.driveReset("a"), "drive_reset");
    expectSuccess(await client.driveOn("a"), "drive_on");
    expectSuccess(await client.driveOff("a"), "drive_off");
    expectSuccess(await client.driveLoadRom("a", "/roms/drive.rom"), "drive_load_rom");
    expectSuccess(await client.driveSetMode("a", "1541"), "drive_mode");
    expectSuccess(await client.streamStart("video", "127.0.0.1:11000"), "stream_start");
    expectSuccess(await client.streamStop("video"), "stream_stop");
  });

  await t.test("config endpoints", async () => {
    const categories = await client.configsList();
    assert.deepEqual(categories, { categories: ["Audio"] });
    const cat = await client.configGet("Audio", "Volume");
    assert.ok(cat);
    expectSuccess(await client.configSet("Audio", "Volume", "10"), "config_set");
    expectSuccess(await client.configBatchUpdate({ Audio: { Volume: "10" } }), "config_batch_update");
    expectSuccess(await client.configLoadFromFlash(), "config_load_from_flash");
    expectSuccess(await client.configSaveToFlash(), "config_save_to_flash");
    expectSuccess(await client.configResetToDefault(), "config_reset_to_default");
  });

  await t.test("file helpers", async () => {
    const info = await client.filesInfo("/tmp/file" );
    assert.deepEqual(info, { info: { size: 1024 } });
    expectSuccess(await client.filesCreateD64("/tmp/disk.d64", { tracks: 35, diskname: "DEMO" }), "create_d64");
    expectSuccess(await client.filesCreateD71("/tmp/disk.d71", { diskname: "DEMO" }), "create_d71");
    expectSuccess(await client.filesCreateD81("/tmp/disk.d81", { diskname: "DEMO" }), "create_d81");
    expectSuccess(await client.filesCreateDnp("/tmp/disk.dnp", 10, { diskname: "DEMO" }), "create_dnp");
  });
});
