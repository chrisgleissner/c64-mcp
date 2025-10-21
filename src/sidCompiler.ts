/*
C64 MCP - CPG to PRG Compiler (minimal v1)
Copyright (C) 2025 Christian Gleissner

Licensed under the GNU General Public License v2.0 or later.
See <https://www.gnu.org/licenses/> for details.
*/

import { Buffer } from "node:buffer";
import { assemblyToPrg } from "./assemblyConverter.js";
import type { ParsedCpg, SystemMode, CpgVoice } from "./sidCpg.js";
import { midiToHz, noteNameToMidi } from "./sidCpg.js";

export interface CompileResult {
  prg: Buffer;
}

/**
 * Very small CPG compiler: generates a 50/60Hz player that writes SID registers from a precomputed frame table.
 * It currently supports three voices with per-frame frequency, waveform, pulse width, and ADSR gate on/off.
 * Effects are not fully implemented; basic PWM sweep from pulse_width and simple transpositions are handled.
 */
export function compileCpgToPrg(doc: ParsedCpg): CompileResult {
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
  const voices: CpgVoice[] = [1, 2, 3].map((id) =>
    (doc.voices.find((v) => v.id === id) as CpgVoice | undefined) ?? ({ id, name: `Voice${id}`, waveform: "triangle", adsr: [2, 2, 10, 3], pulse_width: 2048, patterns: {} } as CpgVoice),
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

    for (let f = 0; f < cappedFrames; f += 1) {
      if (f % arpStepFrames === 0) {
        arpIndex = (arpIndex + 1) % arbitraryNotes.length;
      }
      const note = arbitraryNotes[arpIndex] ?? "C3";
      const midi = noteNameToMidi(note) ?? 48;
      const hz = midiToHz(midi);
      const sidFreq = hzToSidFrequency(hz, system);
      freqFrames[vi]![f] = sidFreq;
      ctrlFrames[vi]![f] = waveformCtrl | 0x01; // GATE on
      // Apply a subtle PWM LFO when pulse waveform
      const lfo = v.waveform === "pulse" ? ((Math.sin((f / fps) * Math.PI * 2 * 0.5) + 1) / 2) * 200 : 0; // ~0.5Hz 0..200
      const pw = (v.waveform === "pulse" ? Math.max(0, Math.min(0x0fff, Math.floor(basePw + lfo))) : basePw) & 0x0fff;
      pwFrames[vi]![f] = pw;
    }
  }

  const asm = buildPlayerAsm({ system, totalFrames: cappedFrames, freqFrames, ctrlFrames, pwFrames, adFrames, srFrames });
  const prg = assemblyToPrg(asm, { fileName: "cpg_player.asm", loadAddress: 0x0801 });
  return { prg };
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

function inferNotesForVoice(v: CpgVoice): string[] | undefined {
  const pnames = Object.keys(v.patterns ?? {});
  for (const name of pnames) {
    const p: any = (v.patterns as any)[name];
    if (!p) continue;
    if (Array.isArray(p.notes)) return p.notes as string[];
    if (Array.isArray(p.groove)) return p.groove as string[];
  }
  return undefined;
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
  L.push("* = $0801");
  // BASIC header for SYS2064
  L.push("  .word next,10");
  L.push("  .byte $9E");
  L.push("  .byte '2','0','6','4',0");
  L.push("next: .word 0");
  L.push("* = $0810");
  L.push("start:");
  L.push("  SEI");
  L.push("  LDX #$00");
  L.push("  STX $D404");
  L.push("  STX $D40B");
  L.push("  STX $D412");
  L.push("  STX $D418");
  L.push("  LDA #$0F");
  L.push("  STA $D418");
  L.push("  CLI");
  L.push("  JSR init_ptrs");
  L.push("  JSR play_loop");
  L.push("  RTS");

  L.push("play_loop:");
  L.push("  LDY #$00");
  L.push("frame_loop:");
  for (let v = 0; v < 3; v += 1) {
    const base = 0xd400 + v * 7;
    L.push(`  ; Voice ${v + 1}`);
    L.push(`  LDA (f${v}),Y`);
    L.push(`  STA $${hex16(base)}`);
    L.push(`  LDA (f${v}h),Y`);
    L.push(`  STA $${hex16(base + 1)}`);
    L.push(`  LDA (pw${v}),Y`);
    L.push(`  STA $${hex16(base + 2)}`);
    L.push(`  LDA (pw${v}h),Y`);
    L.push(`  AND #$0F`);
    L.push(`  STA $${hex16(base + 3)}`);
    L.push(`  LDA (ctrl${v}),Y`);
    L.push(`  STA $${hex16(base + 4)}`);
    L.push(`  LDA (ad${v}),Y`);
    L.push(`  STA $${hex16(base + 5)}`);
    L.push(`  LDA (sr${v}),Y`);
    L.push(`  STA $${hex16(base + 6)}`);
  }
  L.push("  JSR wait_frame");
  L.push("  INY");
  L.push(`  CPY #$${hex2(args.totalFrames & 0xff)}`);
  L.push("  BNE frame_loop");
  L.push("  RTS");

  L.push("init_ptrs:");
  for (let v = 0; v < 3; v += 1) {
    L.push(`  LDA #<freq${v}`);
    L.push(`  STA f${v}`);
    L.push(`  LDA #>freq${v}`);
    L.push(`  STA f${v}+1`);
    L.push(`  LDA #<freq${v}h`);
    L.push(`  STA f${v}h`);
    L.push(`  LDA #>freq${v}h`);
    L.push(`  STA f${v}h+1`);
    L.push(`  LDA #<pw${v}`);
    L.push(`  STA pw${v}`);
    L.push(`  LDA #>pw${v}`);
    L.push(`  STA pw${v}+1`);
    L.push(`  LDA #<pw${v}h`);
    L.push(`  STA pw${v}h`);
    L.push(`  LDA #>pw${v}h`);
    L.push(`  STA pw${v}h+1`);
    L.push(`  LDA #<ctrl${v}`);
    L.push(`  STA ctrl${v}`);
    L.push(`  LDA #>ctrl${v}`);
    L.push(`  STA ctrl${v}+1`);
    L.push(`  LDA #<ad${v}`);
    L.push(`  STA ad${v}`);
    L.push(`  LDA #>ad${v}`);
    L.push(`  STA ad${v}+1`);
    L.push(`  LDA #<sr${v}`);
    L.push(`  STA sr${v}`);
    L.push(`  LDA #>sr${v}`);
    L.push(`  STA sr${v}+1`);
  }
  L.push("  RTS");

  L.push("wait_frame:");
  L.push("  LDY #$00");
  L.push("wf1: LDA $D012");
  L.push("  CMP #$FF");
  L.push("  BNE wf1");
  L.push("  RTS");

  // zero page pointers
  L.push("f0 = $FB");
  L.push("f0h = $FD");
  L.push("f1 = $F7");
  L.push("f1h = $F9");
  L.push("f2 = $F3");
  L.push("f2h = $F5");
  L.push("pw0 = $EB");
  L.push("pw0h = $ED");
  L.push("pw1 = $E7");
  L.push("pw1h = $E9");
  L.push("pw2 = $E3");
  L.push("pw2h = $E5");
  L.push("ctrl0 = $DB");
  L.push("ctrl1 = $D9");
  L.push("ctrl2 = $D7");
  L.push("ad0 = $CB");
  L.push("ad1 = $C9");
  L.push("ad2 = $C7");
  L.push("sr0 = $BB");
  L.push("sr1 = $B9");
  L.push("sr2 = $B7");

  // data tables
  for (let v = 0; v < 3; v += 1) {
    const fLo: string[] = [];
    const fHi: string[] = [];
    const pwLo: string[] = [];
    const pwHi: string[] = [];
    const ctrl: string[] = [];
    const ad: string[] = [];
    const sr: string[] = [];
    for (let i = 0; i < args.totalFrames; i += 1) {
      const f = args.freqFrames[v]![i] ?? 0;
      const p = args.pwFrames[v]![i] ?? 0x0800;
      fLo.push(`$${hex2(f & 0xff)}`);
      fHi.push(`$${hex2((f >> 8) & 0xff)}`);
      pwLo.push(`$${hex2(p & 0xff)}`);
      pwHi.push(`$${hex2((p >> 8) & 0x0f)}`);
      ctrl.push(`$${hex2(args.ctrlFrames[v]![i] ?? 0)}`);
      ad.push(`$${hex2(args.adFrames[v]![i] ?? 0)}`);
      sr.push(`$${hex2(args.srFrames[v]![i] ?? 0)}`);
    }
    pushByteRows(L, `freq${v}`, fLo);
    pushByteRows(L, `freq${v}h`, fHi);
    pushByteRows(L, `pw${v}`, pwLo);
    pushByteRows(L, `pw${v}h`, pwHi);
    pushByteRows(L, `ctrl${v}`, ctrl);
    pushByteRows(L, `ad${v}`, ad);
    pushByteRows(L, `sr${v}`, sr);
  }

  return L.join("\n");
}

function pushByteRows(out: string[], label: string, items: string[], perLine = 16): void {
  out.push(`${label}:`);
  for (let i = 0; i < items.length; i += perLine) {
    const part = items.slice(i, Math.min(i + perLine, items.length));
    out.push(`  .byte ${part.join(",")}`);
  }
}

function hex2(n: number): string {
  return (n & 0xff).toString(16).toUpperCase().padStart(2, "0");
}

function hex16(n: number): string {
  return (n & 0xffff).toString(16).toUpperCase().padStart(4, "0");
}
