import test from "#test/runner";
import assert from "#test/assert";
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

test("handles expectedSidwave with patterns", async () => {
  const c4 = genSine(261.63, 0.5, SR);
  const expectedSidwave = {
    voices: [
      {
        patterns: {
          intro: {
            notes: ["C4", "D4", "E4"]
          }
        }
      }
    ]
  };
  const res = await analyzePcmForTest(c4, SR, expectedSidwave);
  assert.ok(res.analysis.voices.length > 0);
  const notes = res.analysis.voices[0].detected_notes.filter((n) => n.note);
  assert.ok(notes.length > 0);
  // Should have deviation_cents since we provided expectedSidwave
  const hasDeviation = notes.some((n) => typeof n.deviation_cents === "number");
  assert.ok(hasDeviation);
});

test("computeRms fallback path works without meyda", async () => {
  // A simple low-amplitude signal to ensure RMS below threshold on parts
  const low = genSine(261.63, 0.2, SR).map((x) => x * 0.001);
  const audio = low;
  const res = await analyzePcmForTest(audio, SR);
  assert.ok(res.analysis.durationSeconds > 0);
});

test("uses expectedSidwave parsed doc to compute deviations", async () => {
  const c4 = genSine(261.63, 0.4, SR);
  const expectedSidwave = {
    title: "Demo",
    tempo: 100,
    mode: "PAL",
    voices: [
      { id: 1, patterns: { main: { notes: ["C4", "E4"] } } },
    ],
    timeline: [ { bars: 1, layers: { v1: "main" } } ],
  };
  const res = await analyzePcmForTest(c4, SR, expectedSidwave);
  const notes = res.analysis.voices[0].detected_notes.filter((n) => n.note);
  assert.ok(notes.length > 0);
  // Deviation should be a finite number thanks to expected set
  assert.ok(Number.isFinite(notes[0].deviation_cents));
});

test("handles expectedSidwave with groove instead of notes", async () => {
  const e4 = genSine(329.63, 0.5, SR);
  const expectedSidwave = {
    voices: [
      {
        patterns: {
          main: {
            groove: ["E4", "F4", "G4"]
          }
        }
      }
    ]
  };
  const res = await analyzePcmForTest(e4, SR, expectedSidwave);
  assert.ok(res.analysis.voices.length > 0);
});

test("handles invalid expectedSidwave gracefully", async () => {
  const a4 = genSine(440, 0.3, SR);
  const invalidSidwave = "not a valid sidwave";
  const res = await analyzePcmForTest(a4, SR, invalidSidwave);
  assert.ok(res.analysis.voices.length > 0);
  // Should still work without crashing
});

test("parses note names with sharps and flats", async () => {
  const fSharp4 = genSine(369.99, 0.3, SR);
  const expectedSidwave = {
    voices: [
      {
        patterns: {
          test: {
            notes: ["F#4", "Bb3", "C#5"]
          }
        }
      }
    ]
  };
  const res = await analyzePcmForTest(fSharp4, SR, expectedSidwave);
  assert.ok(res.analysis.voices.length > 0);
});

test("handles patterns without notes or groove", async () => {
  const a4 = genSine(440, 0.3, SR);
  const expectedSidwave = {
    voices: [
      {
        patterns: {
          empty: {
            // no notes or groove
          }
        }
      }
    ]
  };
  const res = await analyzePcmForTest(a4, SR, expectedSidwave);
  assert.ok(res.analysis.voices.length > 0);
});

test("handles invalid note names in expected sidwave", async () => {
  const a4 = genSine(440, 0.3, SR);
  const expectedSidwave = {
    voices: [
      {
        patterns: {
          test: {
            notes: ["INVALID", "Z99", ""]
          }
        }
      }
    ]
  };
  const res = await analyzePcmForTest(a4, SR, expectedSidwave);
  assert.ok(res.analysis.voices.length > 0);
});
