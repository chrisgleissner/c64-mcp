/*
C64 MCP - SID CPG Parser and Types
Copyright (C) 2025 Christian Gleissner

Licensed under the GNU General Public License v2.0 or later.
See <https://www.gnu.org/licenses/> for details.
*/

import { parse as yamlParse } from "yaml";

export type SystemMode = "PAL" | "NTSC";

export interface CpgSongMeta {
  title?: string;
  tempo?: number; // BPM
  mode?: SystemMode;
  length_bars?: number;
  global_fx?: Record<string, unknown>;
}

export type Waveform = "pulse" | "sawtooth" | "saw" | "triangle" | "tri" | "noise";

export interface CpgPatternArp {
  type: "arpeggio";
  notes: string[]; // e.g. ["C3","Eb3","G3","Bb3"]
  frame_rate?: number; // changes per N frames
  fx?: Record<string, unknown>;
}

export interface CpgPatternMotif {
  length?: number; // steps in pattern
  motif?: string; // free-form annotation only
  transpositions?: number[];
  fx?: Record<string, unknown>;
}

export interface CpgPatternGroove {
  groove: string[]; // note names per step
  fx?: Record<string, unknown>;
}

export type CpgPattern = CpgPatternArp | CpgPatternMotif | CpgPatternGroove;

export interface CpgVoice {
  id: number; // 1..3
  name?: string;
  waveform?: Waveform;
  pulse_width?: number; // 0..1 for duty fraction, or 0..4095 if >1
  adsr?: [number, number, number, number]; // A,D,S,R (0..15)
  patterns?: Record<string, CpgPattern>;
}

export interface CpgTimelineSection {
  section?: string;
  bars: number;
  layers: Record<string, string>; // e.g. { v1: "A", v2: "B", v3: "-" }
}

export interface CpgDocument {
  song?: CpgSongMeta;
  voices?: CpgVoice[];
  timeline?: CpgTimelineSection[];
}

export interface ParsedCpg extends Required<Pick<CpgDocument, "song" | "voices" | "timeline">> {}

export function parseCpg(input: string | object): ParsedCpg {
  const obj: CpgDocument = typeof input === "string" ? (yamlParse(input) as any) : (input as any);
  if (!obj || typeof obj !== "object") {
    throw new Error("Invalid CPG: not an object");
  }
  if (!obj.song) throw new Error("Invalid CPG: missing song metadata");
  if (!Array.isArray(obj.voices) || obj.voices.length === 0) throw new Error("Invalid CPG: missing voices");
  if (!Array.isArray(obj.timeline) || obj.timeline.length === 0) throw new Error("Invalid CPG: missing timeline");

  const song: CpgSongMeta = {
    title: obj.song?.title ?? "Untitled",
    tempo: normalizeTempo(obj.song?.tempo),
    mode: (obj.song?.mode as SystemMode) ?? "PAL",
    length_bars: Math.max(1, Math.floor(obj.song?.length_bars ?? 16)),
    global_fx: obj.song?.global_fx ?? {},
  };

  const voices = obj.voices!.map((v) => normalizeVoice(v));
  const timeline = obj.timeline!.map((t) => normalizeTimelineSection(t));

  return { song, voices, timeline };
}

function normalizeTempo(tempo?: number): number {
  if (!Number.isFinite(tempo as number)) return 100;
  const t = Math.max(30, Math.min(220, Math.floor(tempo as number)));
  return t;
}

function normalizeVoice(v: CpgVoice): CpgVoice {
  const waveform = normalizeWaveform((v.waveform as any) ?? "pulse");
  let pulseWidth: number | undefined = v.pulse_width;
  if (typeof pulseWidth === "number") {
    // Accept 0..1 as duty cycle fraction; scale to 0..4095
    if (pulseWidth > 0 && pulseWidth <= 1) {
      pulseWidth = Math.round(pulseWidth * 4095);
    }
    pulseWidth = Math.max(0, Math.min(4095, Math.floor(pulseWidth)));
  }
  const adsr = (v.adsr ?? [2, 2, 10, 3]).map((n) => Math.max(0, Math.min(15, Math.floor(n)))) as [number, number, number, number];
  return {
    id: v.id,
    name: v.name ?? `Voice${v.id}`,
    waveform,
    pulse_width: pulseWidth,
    adsr,
    patterns: v.patterns ?? {},
  };
}

function normalizeWaveform(w: Waveform): Waveform {
  const w0 = (w || "pulse").toLowerCase() as Waveform;
  if (w0 === "saw") return "sawtooth";
  if (w0 === "tri") return "triangle";
  if (w0 === "pulse" || w0 === "sawtooth" || w0 === "triangle" || w0 === "noise") return w0 as Waveform;
  return "pulse";
}

function normalizeTimelineSection(t: CpgTimelineSection): CpgTimelineSection {
  const bars = Math.max(1, Math.floor(t.bars ?? 1));
  const layers: Record<string, string> = {};
  for (const [k, v] of Object.entries(t.layers ?? {})) {
    layers[k] = String(v ?? "-");
  }
  return { section: t.section ?? "", bars, layers };
}

export function noteNameToMidi(note: string): number | undefined {
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec((note || "").trim());
  if (!m) return undefined;
  const letter = m[1].toUpperCase();
  const accidental = m[2];
  const octave = Number(m[3]);
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let semi = base[letter] ?? 0;
  if (accidental === "#") semi += 1;
  if (accidental === "b") semi -= 1;
  const midi = (octave + 1) * 12 + semi;
  return midi;
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
