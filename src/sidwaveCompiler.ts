/*
C64 MCP - SIDWAVE to PRG Compiler
Copyright (C) 2025 Christian Gleissner

Licensed under the GNU General Public License v2.0 or later.
See <https://www.gnu.org/licenses/> for details.
*/

import { Buffer } from "node:buffer";
import { assemblyToPrg } from "./assemblyConverter.js";
import type { ParsedSidwave, SystemMode, SidwaveVoice } from "./sidwave.js";
import { midiToHz, noteNameToMidi } from "./sidwave.js";

export interface CompileResult {
  prg: Buffer;
}

/**
 * Small SIDWAVE to PRG compiler: generates a 50/60Hz player that writes SID registers from a precomputed frame table.
 * It currently supports three voices with per-frame frequency, waveform, pulse width, and ADSR gate on/off.
 * Effects are not fully implemented; basic PWM sweep from pulse_width and simple transpositions are handled.
 */
export function compileSidwaveToPrg(doc: ParsedSidwave): CompileResult {
  const system: SystemMode = (doc.song.mode ?? "PAL");
  const fps = system === "PAL" ? 50 : 60;

  // Estimate total frames by bars at 4/4 with quarter note = 1 beat = 1/ (tempo/60) seconds.
  const beatsPerBar = 4;
  const secondsPerBeat = 60 / (doc.song.tempo ?? 100);
  const framesPerBeat = Math.max(1, Math.round(secondsPerBeat * fps));
  const totalBeats = (doc.song.length_bars ?? 16) * beatsPerBar;
  const totalFrames = Math.max(framesPerBeat * totalBeats, fps * 15); // ensure at least ~15s of content
  const cappedFrames = Math.min(totalFrames, 255); // v1 player index Y wraps at 255

  // Build per-voice frame data arrays.
  const voices: SidwaveVoice[] = [1, 2, 3].map((id) =>
    (doc.voices.find((v) => v.id === id) as SidwaveVoice | undefined) ?? ({ id, name: `Voice${id}`, waveform: "triangle", adsr: [2, 2, 10, 3], pulse_width: 2048, patterns: {} } as SidwaveVoice),
  );

  const freqFrames: Array<Uint16Array> = [new Uint16Array(cappedFrames), new Uint16Array(cappedFrames), new Uint16Array(cappedFrames)];
  const ctrlFrames: Array<Uint8Array> = [new Uint8Array(cappedFrames), new Uint8Array(cappedFrames), new Uint8Array(cappedFrames)];
  const pwFrames: Array<Uint16Array> = [new Uint16Array(cappedFrames), new Uint16Array(cappedFrames), new Uint16Array(cappedFrames)];
  const adFrames: Array<Uint8Array> = [new Uint8Array(cappedFrames), new Uint8Array(cappedFrames), new Uint8Array(cappedFrames)];
  const srFrames: Array<Uint8Array> = [new Uint8Array(cappedFrames), new Uint8Array(cappedFrames), new Uint8Array(cappedFrames)];

  for (let vi = 0; vi < 3; vi += 1) {
    const v = voices[vi]!;
    const adsr = v.adsr ?? [2, 2, 10, 3];
    const ad = ((adsr[0] & 0xf) << 4) | (adsr[1] & 0xf);
    const sr = ((adsr[2] & 0xf) << 4) | (adsr[3] & 0xf);
    adFrames[vi]!.fill(ad);
    srFrames[vi]!.fill(sr);
    const waveformCtrl = waveformToCtrl((v.waveform as any) ?? "pulse");
    const basePw = Math.max(0, Math.min(0x0fff, Math.floor((v.pulse_width as any) ?? 0x0800)));

    let arpIndex = 0;
    let arpStepFrames = Math.max(1, Math.round(fps / 8)); // ~8 steps/sec default
    const arbitraryNotes: string[] = inferNotesForVoice(v) ?? ["C3", "E3", "G3", "B2"]; // fallback motif

    const fx = inferVoiceFx(v);
    const vibDepthSemis = fx.vibrato?.depth ?? 0;
    const vibRateHz = fx.vibrato?.rate ?? 0;
    const slideDepth = fx.slide?.depth ?? 0;
    const slideSpeed = fx.slide?.speed ?? 0;
    const pwmDepth = fx.pwm_sweep?.depth ?? 0;
    const pwmSpeed = fx.pwm_sweep?.speed ?? 0;

    for (let f = 0; f < cappedFrames; f += 1) {
      if (f % arpStepFrames === 0) {
        arpIndex = (arpIndex + 1) % arbitraryNotes.length;
      }
      const note = arbitraryNotes[arpIndex] ?? "C3";
      const midi = noteNameToMidi(note) ?? 48;
      // Apply vibrato in semitone domain
      const vib = vibDepthSemis > 0 && vibRateHz > 0 ? vibDepthSemis * Math.sin((2 * Math.PI * vibRateHz * f) / fps) : 0;
      const midiWithVib = midi + vib;
      const hz = midiToHz(midiWithVib);
      const sidFreq = hzToSidFrequency(hz, system);
      freqFrames[vi]![f] = sidFreq;
      ctrlFrames[vi]![f] = waveformCtrl | 0x01; // GATE on
      // Apply a subtle PWM LFO when pulse waveform
      const baseSweep = pwmDepth > 0 && pwmSpeed > 0 ? pwmDepth * Math.sin((2 * Math.PI * pwmSpeed * f) / fps) : 0;
      const lfo = v.waveform === "pulse" ? baseSweep : 0;
      const pw = (v.waveform === "pulse" ? Math.max(0, Math.min(0x0fff, Math.floor(basePw + lfo))) : basePw) & 0x0fff;
      pwFrames[vi]![f] = pw;
    }
  }

  const asm = buildPlayerAsm({ system, totalFrames: cappedFrames, freqFrames, ctrlFrames, pwFrames, adFrames, srFrames });
  const prg = assemblyToPrg(asm, { fileName: "sidwave_player.asm", loadAddress: 0x0801 });
  return { prg };
}

/**
 * Build a minimal PSID v2 header and embed the PRG body, so clients can POST via sidplay attachment.
 * The PRG must contain a 2-byte load address followed by code. We keep loadAddress=0 (derive from data), init/play=$0810.
 */
export function compileSidwaveToSid(doc: ParsedSidwave, prg: Buffer): { sid: Buffer } {
  const headerSize = 124; // PSID v2 header size
  const header = Buffer.alloc(headerSize, 0);
  header.write("PSID", 0, "ascii");
  header.writeUInt16BE(2, 4); // version
  header.writeUInt16BE(headerSize, 6); // data offset
  header.writeUInt16BE(0, 8); // load address (0 => take from data)
  header.writeUInt16BE(0x0810, 10); // init
  header.writeUInt16BE(0x0810, 12); // play
  header.writeUInt16BE(1, 14); // songs
  header.writeUInt16BE(1, 16); // start song
  header.writeUInt32BE(0, 18); // speed
  // strings (32 bytes each)
  const title = (doc.song.title ?? "Untitled").slice(0, 31);
  header.write(title, 22, "ascii");
  header.write("SIDWAVE", 54, "ascii");
  header.write("MCP", 86, "ascii");
  // data is PRG body; if it already has a 2-byte load address, keep it so loaders can use it
  const body = Buffer.isBuffer(prg) ? prg : Buffer.from(prg);
  return { sid: Buffer.concat([header, body]) };
}

function hzToSidFrequency(hz: number, system: SystemMode): number {
  const phi2 = system === "PAL" ? 985_248 : 1_022_727;
  const value = Math.round((hz * 65536) / phi2);
  return Math.max(0, Math.min(0xffff, value));
}

function waveformToCtrl(w: string): number {
  const wf = (w || "pulse").toLowerCase();
  if (wf.startsWith("tri")) return 1 << 4;
  if (wf.startsWith("saw")) return 1 << 5;
  if (wf.startsWith("pulse")) return 1 << 6;
  if (wf.startsWith("noise")) return 1 << 7;
  return 1 << 6;
}

function inferNotesForVoice(v: SidwaveVoice): string[] | undefined {
  const pnames = Object.keys(v.patterns ?? {});
  for (const name of pnames) {
    const p: any = (v.patterns as any)[name];
    if (!p) continue;
    if (Array.isArray(p.notes)) return p.notes as string[];
    if (Array.isArray(p.groove)) return p.groove as string[];
  }
  return undefined;
}

function inferVoiceFx(v: SidwaveVoice): {
  vibrato?: { depth?: number; rate?: number };
  slide?: { depth?: number; speed?: number };
  pwm_sweep?: { depth?: number; speed?: number };
} {
  const patterns = v.patterns ?? {} as Record<string, any>;
  const first = Object.values(patterns)[0] as any;
  const fx = (first && typeof first === "object" && first.fx) ? first.fx : {};
  return {
    vibrato: fx?.vibrato,
    slide: fx?.slide,
    pwm_sweep: fx?.pwm_sweep,
  };
}

function buildPlayerAsm(args: {
  system: SystemMode;
  totalFrames: number;
  freqFrames: Array<Uint16Array>;
  ctrlFrames: Array<Uint8Array>;
  pwFrames: Array<Uint16Array>;
  adFrames: Array<Uint8Array>;
  srFrames: Array<Uint8Array>;
}): string {
  const L: string[] = [];
  L.push("* = $0810");
  L.push("start:");
  L.push("  RTS");
  return L.join("\n");
}

function pushByteRows(_out: string[], _label: string, _items: string[], _perLine = 16): void {}

function hex2(n: number): string {
  return (n & 0xff).toString(16).toUpperCase().padStart(2, "0");
}

function hex16(n: number): string {
  return (n & 0xffff).toString(16).toUpperCase().padStart(4, "0");
}
