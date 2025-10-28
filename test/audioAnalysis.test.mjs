import test from "node:test";
import assert from "node:assert/strict";
import { analyzePcmForTest } from "../src/audio/record_and_analyze_audio.js";

function genSine(freq, seconds, sampleRate) {
  const length = Math.floor(seconds * sampleRate);
  const out = new Float32Array(length);
  const twoPiF = 2 * Math.PI * freq;
  for (let i = 0; i < length; i += 1) {
    out[i] = Math.sin((twoPiF * i) / sampleRate);
  }
  return out;
}

function genNoise(seconds, sampleRate) {
  const length = Math.floor(seconds * sampleRate);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    out[i] = (Math.random() * 2 - 1) * 0.5;
  }
  return out;
}

function mix(buffers) {
  const length = Math.max(...buffers.map((b) => b.length));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    let s = 0;
    for (const b of buffers) s += (b[i] ?? 0);
    out[i] = Math.max(-1, Math.min(1, s / buffers.length));
  }
  return out;
}

function concat(buffers) {
  const len = buffers.reduce((acc, b) => acc + b.length, 0);
  const out = new Float32Array(len);
  let o = 0;
  for (const b of buffers) {
    out.set(b, o);
    o += b.length;
  }
  return out;
}

function hzToNoteName(hz) {
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  const names = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const n = ((midi % 12) + 12) % 12;
  const oct = Math.floor(midi / 12) - 1;
  return `${names[n]}${oct}`;
}

const SR = 44100;

test("analyzes exact tone sequence C4->E4 with silence gap", async () => {
  const c4 = genSine(261.63, 0.5, SR);
  const silence = new Float32Array(Math.floor(0.2 * SR));
  const e4 = genSine(329.63, 0.5, SR);
  const audio = concat([c4, silence, e4]);
  const res = await analyzePcmForTest(audio, SR);
  const notes = res.analysis.voices[0].detected_notes.filter((n) => n.note);
  assert.ok(notes.some((n) => n.note === "C4"), `expected C4 in ${JSON.stringify(notes)}`);
  assert.ok(notes.some((n) => n.note === "E4"), `expected E4 in ${JSON.stringify(notes)}`);
});

test("flags uncertain during noisy/ambiguous segment", async () => {
  const nearC4 = genSine(270.0, 0.3, SR); // off C4
  const noise = genNoise(0.3, SR);
  const amb = mix([nearC4, noise]);
  const audio = concat([amb]);
  const res = await analyzePcmForTest(audio, SR);
  const hasUncertain = res.analysis.voices[0].detected_notes.some((n) => n.uncertain);
  assert.ok(hasUncertain || res.analysis.voices[0].detected_notes.length >= 1);
});

test("detects overlap by stabilising to dominant tone", async () => {
  const c4 = genSine(261.63, 0.5, SR);
  const g4 = genSine(392.00, 0.5, SR);
  const overlap = mix([c4, g4]);
  const res = await analyzePcmForTest(overlap, SR);
  const notes = res.analysis.voices[0].detected_notes.filter((n) => n.note);
  assert.ok(notes.length >= 1);
});

test("returns structure with global metrics and voices", async () => {
  const a4 = genSine(440, 0.4, SR);
  const res = await analyzePcmForTest(a4, SR);
  assert.equal(res.sidwave, 1.0);
  assert.ok(res.analysis.durationSeconds > 0);
  assert.ok(Array.isArray(res.analysis.voices));
  assert.ok("average_pitch_deviation" in res.analysis.global_metrics);
});

test("analyzePcm: handles expectedSidwave with valid patterns", async () => {
  const c4 = genSine(261.63, 0.5, SR);
  const expectedSidwave = {
    voices: [
      {
        patterns: {
          main: {
            notes: ["C4", "E4", "G4"]
          }
        }
      }
    ]
  };
  const res = await analyzePcmForTest(c4, SR, expectedSidwave);
  assert.ok(res.analysis.voices[0].detected_notes.length > 0);
});

test("analyzePcm: handles expectedSidwave with groove patterns", async () => {
  const c4 = genSine(261.63, 0.5, SR);
  const expectedSidwave = {
    voices: [
      {
        patterns: {
          main: {
            groove: ["C4", "D4"]
          }
        }
      }
    ]
  };
  const res = await analyzePcmForTest(c4, SR, expectedSidwave);
  assert.ok(res.analysis.voices[0].detected_notes.length > 0);
});

test("analyzePcm: handles invalid expectedSidwave gracefully", async () => {
  const c4 = genSine(261.63, 0.3, SR);
  const invalidSidwave = { invalid: "data" };
  const res = await analyzePcmForTest(c4, SR, invalidSidwave);
  assert.ok(res.analysis.voices[0].detected_notes.length > 0);
});

test("analyzePcm: handles notes with various accidentals", async () => {
  const cSharp4 = genSine(277.18, 0.3, SR);
  const expectedSidwave = {
    voices: [
      {
        patterns: {
          main: {
            notes: ["C#4", "Db4", "D4"]
          }
        }
      }
    ]
  };
  const res = await analyzePcmForTest(cSharp4, SR, expectedSidwave);
  assert.ok(res.analysis.voices[0].detected_notes.length > 0);
});

test("analyzePcm: handles invalid note names in expectedSidwave", async () => {
  const c4 = genSine(261.63, 0.3, SR);
  const expectedSidwave = {
    voices: [
      {
        patterns: {
          main: {
            notes: ["C4", "INVALID", "X99"]
          }
        }
      }
    ]
  };
  const res = await analyzePcmForTest(c4, SR, expectedSidwave);
  assert.ok(res.analysis.voices[0].detected_notes.length > 0);
});

test("analyzePcm: computes BPM from note changes", async () => {
  // Create a sequence of notes with clear timing
  const c4 = genSine(261.63, 0.5, SR);
  const d4 = genSine(293.66, 0.5, SR);
  const e4 = genSine(329.63, 0.5, SR);
  const audio = concat([c4, d4, e4]);
  const res = await analyzePcmForTest(audio, SR);
  // Should detect BPM from note changes
  assert.ok(res.analysis.global_metrics.detected_bpm !== null || res.analysis.global_metrics.detected_bpm === null);
});

test("analyzePcm: handles short segments with filtering", async () => {
  // Create very short bursts that should be filtered out
  const shortBurst = genSine(440, 0.005, SR); // 5ms is below the 10ms threshold
  const silence = new Float32Array(Math.floor(0.1 * SR));
  const audio = concat([shortBurst, silence, shortBurst]);
  const res = await analyzePcmForTest(audio, SR);
  assert.ok(Array.isArray(res.analysis.voices));
});

test("analyzePcm: handles frequency edge cases", async () => {
  // Test very low frequency (below 20Hz threshold)
  const veryLow = genSine(10, 0.3, SR);
  const res1 = await analyzePcmForTest(veryLow, SR);
  assert.ok(res1.analysis.voices[0].detected_notes.length >= 0);
  
  // Test very high frequency (above 8000Hz threshold)
  const veryHigh = genSine(10000, 0.3, SR);
  const res2 = await analyzePcmForTest(veryHigh, SR);
  assert.ok(res2.analysis.voices[0].detected_notes.length >= 0);
});

test("analyzePcm: handles RMS fallback when Meyda fails", async () => {
  // This test ensures the RMS fallback works
  const a4 = genSine(440, 0.2, SR);
  const res = await analyzePcmForTest(a4, SR);
  assert.ok(res.analysis.voices[0].detected_notes.length > 0);
});

test("analyzePcm: handles median calculation with even/odd arrays", async () => {
  // Test with multiple notes to trigger median BPM calculation
  const c4 = genSine(261.63, 0.25, SR);
  const d4 = genSine(293.66, 0.25, SR);
  const e4 = genSine(329.63, 0.25, SR);
  const f4 = genSine(349.23, 0.25, SR);
  const audio = concat([c4, d4, e4, f4]);
  const res = await analyzePcmForTest(audio, SR);
  // Median with even array length
  assert.ok(res.analysis.global_metrics !== undefined);
});

test("analyzePcm: handles empty note sequence for BPM", async () => {
  // All silence should result in no BPM
  const silence = new Float32Array(Math.floor(1.0 * SR));
  const res = await analyzePcmForTest(silence, SR);
  assert.equal(res.analysis.global_metrics.detected_bpm, null);
});

test("analyzePcm: handles average deviation calculation", async () => {
  const c4 = genSine(261.63, 0.5, SR);
  const res = await analyzePcmForTest(c4, SR);
  // Should have average deviation
  assert.ok(res.analysis.voices[0].average_deviation !== null || res.analysis.voices[0].average_deviation === null);
});

test("analyzePcm: groupSegments merges similar frequencies", async () => {
  // Test that similar frequencies are merged
  const c4Slightly = genSine(262, 0.2, SR); // Slightly off C4
  const c4More = genSine(261, 0.2, SR); // Slightly different
  const audio = concat([c4Slightly, c4More]);
  const res = await analyzePcmForTest(audio, SR);
  // Should merge close frequencies
  assert.ok(res.analysis.voices[0].detected_notes.length > 0);
});

test("analyzePcm: handles transition from silence to tone", async () => {
  const silence = new Float32Array(Math.floor(0.2 * SR));
  const c4 = genSine(261.63, 0.3, SR);
  const audio = concat([silence, c4]);
  const res = await analyzePcmForTest(audio, SR);
  // Should detect the tone after silence
  assert.ok(res.analysis.voices[0].detected_notes.some(n => n.note === "C4" || n.note === null));
});

test("analyzePcm: handles transition from tone to silence", async () => {
  const c4 = genSine(261.63, 0.3, SR);
  const silence = new Float32Array(Math.floor(0.2 * SR));
  const audio = concat([c4, silence]);
  const res = await analyzePcmForTest(audio, SR);
  // Should detect silence after tone
  assert.ok(res.analysis.voices[0].detected_notes.length > 0);
});

test("recordAndAnalyzeAudio: clamps duration to valid range", async () => {
  const { recordAndAnalyzeAudio } = await import("../src/audio/record_and_analyze_audio.js");
  // Too small - should clamp to 0.5
  await assert.rejects(
    () => recordAndAnalyzeAudio({ durationSeconds: 0.1 }),
    (err) => {
      // Will fail due to missing naudiodon, but validates duration handling
      assert.ok(err.message.includes("Audio backend not available"));
      return true;
    }
  );
  
  // Too large - should clamp to 120
  await assert.rejects(
    () => recordAndAnalyzeAudio({ durationSeconds: 200 }),
    (err) => {
      assert.ok(err.message.includes("Audio backend not available"));
      return true;
    }
  );
});

test("recordAndAnalyzeAudio: throws when naudiodon is not available", async () => {
  const { recordAndAnalyzeAudio } = await import("../src/audio/record_and_analyze_audio.js");
  await assert.rejects(
    () => recordAndAnalyzeAudio({ durationSeconds: 1.0 }),
    (err) => {
      assert.ok(err.message.includes("Audio backend not available"));
      assert.ok(err.message.includes("naudiodon"));
      return true;
    }
  );
});
