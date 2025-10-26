import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { audioModule } from "../src/tools/audio.js";

function createLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

function buildSidwaveDoc() {
  return {
    song: {
      title: "Test Song",
      tempo: 110,
      mode: "PAL",
      length_bars: 2,
    },
    voices: [
      {
        id: 1,
        name: "Lead",
        waveform: "triangle",
        adsr: [2, 2, 10, 3],
        pulse_width: 2048,
        patterns: {
          main: {
            type: "arpeggio",
            notes: ["C4", "E4", "G4"],
          },
        },
      },
    ],
    timeline: [
      {
        section: "A",
        bars: 2,
        layers: {
          v1: "main",
        },
      },
    ],
  };
}

test("music_generate builds timeline and triggers SID sequence", async () => {
  const volumeCalls = [];
  const noteCalls = [];
  let noteOffCount = 0;

  const ctx = {
    client: {
      sidSetVolume: async (volume) => {
        volumeCalls.push(volume);
        return { success: true };
      },
      sidNoteOn: async (payload) => {
        noteCalls.push(payload);
        return { success: true };
      },
      sidNoteOff: async () => {
        noteOffCount += 1;
        return { success: true };
      },
    },
    logger: createLogger(),
  };

  const result = await audioModule.invoke(
    "music_generate",
    { root: "C4", pattern: "0,4", steps: 2, tempoMs: 40, waveform: "tri" },
    ctx,
  );

  assert.equal(result.content[0].type, "text");
  assert.equal(result.isError, undefined);
  assert.deepEqual(result.metadata.intervals, [0, 4]);
  assert.equal(result.metadata.steps, 2);
  assert.equal(result.metadata.timeline.length, 2);

  await new Promise((resolve) => setTimeout(resolve, 120));

  assert.equal(volumeCalls.length, 1);
  assert.equal(noteCalls.length, 2);
  assert.equal(noteOffCount, 1);
  assert.deepEqual(noteCalls.map((call) => call.note), ["C4", "E4"]);
});

test("music_compile_and_play compiles SIDWAVE to PRG and runs on C64", async () => {
  let runPrgCalls = 0;
  let sidAttachmentCalls = 0;

  const ctx = {
    client: {
      runPrg: async (prg) => {
        runPrgCalls += 1;
        assert.ok(prg instanceof Uint8Array || Buffer.isBuffer(prg));
        return { success: true, details: { bytes: prg.length } };
      },
      sidplayAttachment: async () => {
        sidAttachmentCalls += 1;
        return { success: true };
      },
    },
    logger: createLogger(),
  };

  const result = await audioModule.invoke(
    "music_compile_and_play",
    { sidwave: buildSidwaveDoc() },
    ctx,
  );

  assert.equal(result.content[0].type, "text");
  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.ranOnC64, true);
  assert.equal(result.metadata.format, "prg");
  assert.equal(runPrgCalls, 1);
  assert.equal(sidAttachmentCalls, 0);
});

test("music_compile_and_play can emit SID and use attachment playback", async () => {
  let sidAttachmentCalls = 0;

  const ctx = {
    client: {
      runPrg: async () => {
        throw new Error("runPrg should not be called for SID output");
      },
      sidplayAttachment: async (sidBuffer) => {
        sidAttachmentCalls += 1;
        assert.ok(Buffer.isBuffer(sidBuffer));
        return { success: true, details: { bytes: sidBuffer.length } };
      },
    },
    logger: createLogger(),
  };

  const result = await audioModule.invoke(
    "music_compile_and_play",
    { sidwave: buildSidwaveDoc(), output: "sid" },
    ctx,
  );

  assert.equal(result.content[0].type, "text");
  assert.equal(result.metadata.format, "sid");
  assert.equal(result.metadata.ranOnC64, true);
  assert.equal(sidAttachmentCalls, 1);
});

test("sidplay_file delegates to C64 client and returns metadata", async () => {
  const calls = [];
  const ctx = {
    client: {
      sidplayFile: async (path, songnr) => {
        calls.push({ path, songnr });
        return { success: true, details: { path, songnr } };
      },
    },
    logger: createLogger(),
  };

  const result = await audioModule.invoke(
    "sidplay_file",
    { path: "/music/song.sid", songnr: 1 },
    ctx,
  );

  assert.equal(result.content[0].type, "text");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { path: "/music/song.sid", songnr: 1 });
  assert.equal(result.metadata.path, "/music/song.sid");
  assert.equal(result.metadata.songnr, 1);
});

test("modplay_file delegates to C64 client", async () => {
  const calls = [];
  const ctx = {
    client: {
      modplayFile: async (path) => {
        calls.push(path);
        return { success: true, details: { path } };
      },
    },
    logger: createLogger(),
  };

  const result = await audioModule.invoke(
    "modplay_file",
    { path: "/music/song.mod" },
    ctx,
  );

  assert.equal(result.content[0].type, "text");
  assert.equal(calls.length, 1);
  assert.equal(calls[0], "/music/song.mod");
  assert.equal(result.metadata.path, "/music/song.mod");
});
