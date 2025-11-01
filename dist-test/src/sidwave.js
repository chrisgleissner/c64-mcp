/*
C64 Bridge - SIDWAVE Parser and Types
Copyright (C) 2025 Christian Gleissner

Licensed under the GNU General Public License v2.0 or later.
See <https://www.gnu.org/licenses/> for details.
*/
import pkg from 'yaml';
const { parse: yamlParse } = pkg;
export function parseSidwave(input) {
    const obj = typeof input === "string" ? yamlParse(input) : input;
    if (!obj || typeof obj !== "object") {
        throw new Error("Invalid SIDWAVE: not an object");
    }
    // Detect legacy CPG shape vs new SIDWAVE top-level
    const legacy = !!obj.song;
    const header = legacy
        ? { title: obj.song?.title, tempo: obj.song?.tempo, mode: obj.song?.mode, length_bars: obj.song?.length_bars, global_fx: obj.song?.global_fx }
        : { title: obj.title, author: obj.author, tempo: obj.tempo, mode: obj.mode, length_bars: obj, global_fx: obj.global_fx };
    const title = header.title ?? "Untitled";
    const tempo = normalizeTempo(header.tempo);
    const mode = header.mode ?? "PAL";
    const length_bars = Math.max(1, Math.floor(header.length_bars ?? inferBarsFromTimeline(obj.timeline) ?? 16));
    const global_fx = header.global_fx ?? {};
    const song = { title, tempo, mode, length_bars, global_fx };
    const voices = (legacy ? obj.voices : obj.voices) ?? [];
    if (!Array.isArray(voices) || voices.length === 0)
        throw new Error("Invalid SIDWAVE: missing voices");
    const normalizedVoices = voices.map((v) => normalizeVoice(v));
    const timeline = ((legacy ? obj.timeline : obj.timeline) ?? []).map((t) => normalizeTimelineSection(t));
    if (!Array.isArray(timeline) || timeline.length === 0)
        throw new Error("Invalid SIDWAVE: missing timeline");
    return { song, voices: normalizedVoices, timeline };
}
function inferBarsFromTimeline(t) {
    if (!Array.isArray(t) || t.length === 0)
        return undefined;
    return t.reduce((sum, s) => sum + Math.max(1, Math.floor(s.bars ?? 0)), 0);
}
function normalizeTempo(tempo) {
    if (!Number.isFinite(tempo))
        return 100;
    const t = Math.max(30, Math.min(220, Math.floor(tempo)));
    return t;
}
function normalizeVoice(v) {
    const waveform = normalizeWaveform(v.waveform ?? "pulse");
    let pulseWidth = v.pulse_width;
    if (typeof pulseWidth === "number") {
        if (pulseWidth > 0 && pulseWidth <= 1) {
            pulseWidth = Math.round(pulseWidth * 4095);
        }
        pulseWidth = Math.max(0, Math.min(4095, Math.floor(pulseWidth)));
    }
    const adsr = (v.adsr ?? [2, 2, 10, 3]).map((n) => Math.max(0, Math.min(15, Math.floor(n))));
    return {
        id: v.id,
        name: v.name ?? `Voice${v.id}`,
        waveform,
        pulse_width: pulseWidth,
        adsr,
        patterns: v.patterns ?? {},
    };
}
function normalizeWaveform(w) {
    const w0 = (w || "pulse").toLowerCase();
    if (w0 === "saw")
        return "sawtooth";
    if (w0 === "tri")
        return "triangle";
    if (w0 === "pulse" || w0 === "sawtooth" || w0 === "triangle" || w0 === "noise")
        return w0;
    return "pulse";
}
function normalizeTimelineSection(t) {
    const bars = Math.max(1, Math.floor(t?.bars ?? 1));
    const layers = {};
    for (const [k, v] of Object.entries(t?.layers ?? {})) {
        layers[k] = String(v ?? "-");
    }
    return { section: t.section ?? "", bars, layers };
}
export function noteNameToMidi(note) {
    const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec((note || "").trim());
    if (!m)
        return undefined;
    const letter = m[1].toUpperCase();
    const accidental = m[2];
    const octave = Number(m[3]);
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    let semi = base[letter] ?? 0;
    if (accidental === "#")
        semi += 1;
    if (accidental === "b")
        semi -= 1;
    const midi = (octave + 1) * 12 + semi;
    return midi;
}
export function midiToHz(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
}
