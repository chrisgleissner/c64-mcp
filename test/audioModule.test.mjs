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

test("music_generate defaults to triangle waveform and best-practice ADSR", async () => {
  const volumeCalls = [];
  const noteCalls = [];
  let noteOffCount = 0;

  const ctx = {
    client: {
      sidSetVolume: async (v) => { volumeCalls.push(v); return { success: true }; },
      sidNoteOn: async (p) => { noteCalls.push(p); return { success: true }; },
      sidNoteOff: async () => { noteOffCount += 1; return { success: true }; },
    },
    logger: createLogger(),
  };

  // Omit waveform and ADSR to exercise defaults
  const result = await audioModule.invoke(
    "music_generate",
    { root: "C4", pattern: "0", steps: 1, tempoMs: 30 },
    ctx,
  );

  assert.equal(result.isError, undefined);
  // Wait a tick for the fire-and-forget playback
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(volumeCalls.length, 1);
  assert.equal(noteCalls.length, 1);
  const call = noteCalls[0];
  assert.equal(call.waveform, "tri");
  assert.equal(call.attack, 1);
  assert.equal(call.decay, 7);
  assert.equal(call.sustain, 15);
  assert.equal(call.release, 0);
  assert.equal(noteOffCount, 1);
});

test("music_generate expression preset uses varied durations and reports preset", async () => {
  const ctx = {
    client: {
      sidSetVolume: async () => ({ success: true }),
      sidNoteOn: async () => ({ success: true }),
      sidNoteOff: async () => ({ success: true }),
    },
    logger: createLogger(),
  };

  const result = await audioModule.invoke(
    "music_generate",
    { root: "C4", pattern: "0,4,7", steps: 4, preset: "expression", tempoMs: 50 },
    ctx,
  );

  assert.equal(result.isError, undefined);
  assert.equal(result.metadata.preset, "expression");
  const timeline = result.metadata.timeline;
  assert.equal(Array.isArray(timeline), true);
  // Expect the first four durations to match the expressive pattern
  const durations = timeline.slice(0, 4).map((e) => e.durationMs);
  assert.deepEqual(durations, [250, 180, 180, 400]);
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

test("music_compile_and_play handles C64 firmware failure for PRG", async () => {
  const ctx = {
    client: {
      runPrg: async () => {
        return { success: false, details: { error: "firmware error" } };
      },
    },
    logger: createLogger(),
  };

  const result = await audioModule.invoke(
    "music_compile_and_play",
    { sidwave: buildSidwaveDoc() },
    ctx,
  );

  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes("firmware reported failure"));
});

test("music_compile_and_play handles C64 firmware failure for SID", async () => {
  const ctx = {
    client: {
      sidplayAttachment: async () => {
        return { success: false, details: { error: "firmware error" } };
      },
    },
    logger: createLogger(),
  };

  const result = await audioModule.invoke(
    "music_compile_and_play",
    { sidwave: buildSidwaveDoc(), output: "sid" },
    ctx,
  );

  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes("firmware reported failure"));
});

test("music_compile_and_play wraps unexpected errors", async () => {
  const ctx = {
    client: {
      runPrg: async () => { throw new Error("unexpected boom"); },
    },
    logger: createLogger(),
  };
  const result = await audioModule.invoke("music_compile_and_play", { sidwave: buildSidwaveDoc() }, ctx);
  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes("unexpected boom"));
});

test("music_compile_and_play validates sidwave input", async () => {
  const ctx = {
    client: {
      runPrg: async () => ({ success: true }),
    },
    logger: createLogger(),
  };

  const result = await audioModule.invoke(
    "music_compile_and_play",
    { sidwave: null },
    ctx,
  );

  assert.equal(result.isError, true);
  assert.ok(result.content[0].text.includes("sidwave or cpg"));
});

test("music_compile_and_play respects dryRun flag", async () => {
  let runPrgCalled = false;
  const ctx = {
    client: {
      runPrg: async () => {
        runPrgCalled = true;
        return { success: true };
      },
    },
    logger: createLogger(),
  };

  const result = await audioModule.invoke(
    "music_compile_and_play",
    { sidwave: buildSidwaveDoc(), dryRun: true },
    ctx,
  );

  assert.equal(result.content[0].type, "text");
  assert.equal(result.metadata.ranOnC64, false);
  assert.equal(result.metadata.dryRun, true);
  assert.equal(runPrgCalled, false);
});

// --- Additional coverage for audio tools ---

test("sid_volume clamps and normalizes address", async () => {
  const ctx = {
    client: {
      sidSetVolume: async () => ({ success: true, details: { address: 0xD418 } }),
    },
    logger: createLogger(),
  };
  const res = await audioModule.invoke("sid_volume", { volume: 12.9 }, ctx);
  assert.equal(res.isError, undefined);
  assert.equal(res.metadata.appliedVolume, 12);
  assert.equal(res.metadata.address, "$D418");
});

test("sid_volume reports firmware failure", async () => {
  const ctx = { client: { sidSetVolume: async () => ({ success: false, details: { reason: "denied" } }) }, logger: createLogger() };
  const res = await audioModule.invoke("sid_volume", { volume: 10 }, ctx);
  assert.equal(res.isError, true);
});

test("sid_volume wraps unexpected errors", async () => {
  const ctx = { client: { sidSetVolume: async () => { throw "bad"; } }, logger: createLogger() };
  const res = await audioModule.invoke("sid_volume", { volume: 5 }, ctx);
  assert.equal(res.isError, true);
});

test("sid_reset soft and hard", async () => {
  let hard = 0; let soft = 0;
  const ctx = {
    client: {
      sidReset: async (isHard) => { isHard ? hard++ : soft++; return { success: true }; },
    },
    logger: createLogger(),
  };
  const softRes = await audioModule.invoke("sid_reset", {}, ctx);
  const hardRes = await audioModule.invoke("sid_reset", { hard: true }, ctx);
  assert.equal(softRes.isError, undefined);
  assert.equal(hardRes.isError, undefined);
  assert.equal(soft, 1);
  assert.equal(hard, 1);
});

test("sid_note_on passes parameters and returns metadata", async () => {
  const calls = [];
  const ctx = {
    client: {
      sidNoteOn: async (p) => { calls.push(p); return { success: true }; },
    },
    logger: createLogger(),
  };
  const res = await audioModule.invoke("sid_note_on", { voice: 2, note: "A4", waveform: "tri", pulseWidth: 1000, attack: 2, decay: 3, sustain: 4, release: 5 }, ctx);
  assert.equal(res.isError, undefined);
  assert.equal(calls.length, 1);
  assert.equal(res.metadata.voice, 2);
  assert.equal(res.metadata.waveform, "tri");
});

test("sid_note_on surfaces firmware failure", async () => {
  const ctx = { client: { sidNoteOn: async () => ({ success: false, details: { e: 1 } }) }, logger: createLogger() };
  const res = await audioModule.invoke("sid_note_on", { voice: 1, frequencyHz: 440 }, ctx);
  assert.equal(res.isError, true);
});

test("sid_note_off and silence_all", async () => {
  const ctx = {
    client: {
      sidNoteOff: async () => ({ success: true }),
      sidSilenceAll: async () => ({ success: true }),
    },
    logger: createLogger(),
  };
  const off = await audioModule.invoke("sid_note_off", { voice: 1 }, ctx);
  const silence = await audioModule.invoke("sid_silence_all", {}, ctx);
  assert.equal(off.isError, undefined);
  assert.equal(silence.isError, undefined);
});

test("analyze_audio returns guidance when no keywords detected", async () => {
  const res = await audioModule.invoke("analyze_audio", { request: "just print status" }, { client: {} });
  assert.equal(res.isError, undefined);
  assert.ok(res.content[0].text.includes("No audio verification keywords"));
});

test("analyze_audio wraps backend errors when keywords present", async () => {
  const res = await audioModule.invoke("analyze_audio", { request: "please check if the music sounds right" }, { client: {} });
  assert.equal(res.isError, true);
});

test("record_and_analyze_audio returns error when backend missing", async () => {
  const res = await audioModule.invoke("record_and_analyze_audio", { durationSeconds: 0.5 }, { client: {} });
  assert.equal(res.isError, true);
});

test("music_generate validates pattern input", async () => {
  const res = await audioModule.invoke("music_generate", { root: "C4", pattern: "", steps: 1, tempoMs: 50, waveform: "pulse" }, { client: {} });
  assert.equal(res.isError, true);
});
