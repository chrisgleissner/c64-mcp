/*
C64 MCP - An MCP Server for the Commodore 64 Ultimate
Copyright (C) 2025 Christian Gleissner

Licensed under the GNU General Public License v2.0 or later.
See <https://www.gnu.org/licenses/> for details.
*/

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface MemoryRegion {
  name: string;
  start: number;
  end: number;
  description: string;
}

export const MEMORY_MAP: MemoryRegion[] = [
  { name: "zero_page", start: 0x0000, end: 0x00ff, description: "Zero page (system vectors, pointers, variables)" },
  { name: "stack", start: 0x0100, end: 0x01ff, description: "6502 hardware stack" },
  { name: "basic_input_buffer", start: 0x0200, end: 0x02ff, description: "BASIC input buffer / screen editor workspace" },
  { name: "screen_ram", start: 0x0400, end: 0x07e7, description: "Default text screen RAM (1000 bytes)" },
  { name: "basic_program", start: 0x0801, end: 0x9fff, description: "Default BASIC program area (grows upward)" },
  { name: "vic_ii_registers", start: 0xd000, end: 0xd3ff, description: "VIC-II registers (mirrored)" },
  { name: "sid_registers", start: 0xd400, end: 0xd7ff, description: "SID registers (mirrored)" },
  { name: "color_ram", start: 0xd800, end: 0xdbff, description: "Color RAM (nibbles, 1000 cells + extras)" },
  { name: "cia1_registers", start: 0xdc00, end: 0xdcff, description: "CIA1 (keyboard, joystick, timers)" },
  { name: "cia2_registers", start: 0xdd00, end: 0xddff, description: "CIA2 (serial IEC, timers)" },
  { name: "io_area", start: 0xd000, end: 0xdfff, description: "I/O area (VIC/SID/CIAs/Color RAM / Char ROM when mapped)" },
  { name: "kernal_rom", start: 0xe000, end: 0xffff, description: "KERNAL ROM (may be banked out)" },
];

const SYMBOLS: Record<string, number> = Object.freeze({
  // Common symbols
  screen: 0x0400,
  screen_ram: 0x0400,
  basic: 0x0801,
  basic_start: 0x0801,
  color: 0xd800,
  color_ram: 0xd800,
  vic: 0xd000,
  sid: 0xd400,
  cia1: 0xdc00,
  cia2: 0xdd00,
  kernal: 0xe000,
});

export function formatAddress(address: number): string {
  return address.toString(16).toUpperCase().padStart(4, "0");
}

export function resolveAddressSymbol(input: string): number | undefined {
  const key = input.trim().toLowerCase().replace(/\s+/g, "_");
  return SYMBOLS[key];
}

export function listSymbols(): Array<{ name: string; address: number; hex: string }> {
  return Object.entries(SYMBOLS)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, address]) => ({ name, address, hex: `$${formatAddress(address)}` }));
}

export function listMemoryMap(): MemoryRegion[] {
  return MEMORY_MAP.slice().sort((a, b) => a.start - b.start);
}

// Commodore BASIC v2 concise language specification for guidance and validation.
// This content is intended as a knowledge base for prompts and tool help.
export const BASIC_V2_SPEC: string = `
# Commodore BASIC v2 – Concise Language Specification

## When to Use REST API vs BASIC/Assembly
**IMPORTANT: Use REST API for direct hardware manipulation**
- If user says "direct", "directly change", "poke", or mentions "direct" + "RAM/SID/VIC", use write_memory REST API
- REST API endpoints: write_memory (address, bytes), read_memory (address, length)
- Examples: "directly set border red" → write_memory(53280, "02"), NOT POKE 53280,2
- Only generate BASIC/ASM code when user explicitly asks for programs/code

## Program Structure
- Programs consist of numbered lines: 1–63999 recommended (absolute max 65535).
- Each line: lineNumber <space?> statement [{ : statement } ...]
- Statements on a line are separated by ':'; execution proceeds in line-number order.
- Comments: REM <text> (or ' in some editors, but not v2); everything until end-of-line.
- Whitespace is ignored outside strings; keywords are case-insensitive and stored tokenized.

## Data Types and Variables
- Types: numeric (floating point, 5-byte) and string.
- Numeric variable: A–Z or A–Z followed by digits (e.g., A, X1, SCORE10). No underscore.
- String variable: same as numeric but with trailing $ (e.g., A$, NAME$).
- Arrays: DIM name(size[,size...]) for numeric; DIM name$(...) for strings.
- Default array bounds: not allocated until DIM; indices start at 0 unless explicitly designed otherwise.
- Constants: numbers (e.g., 10, 3.14, .5, 1E3); strings in double quotes.

## Operators and Precedence (high → low)
1. Unary: -x, NOT x
2. Exponentiation: x ^ y
3. Multiplication/Division: x * y, x / y
4. Addition/Subtraction: x + y, x - y
5. Comparisons: =, <>, <, <=, >, >= (note: V2 uses =, <, > tokens; <= and >= are parsed as combinations)
6. Logical: AND, OR (non-short-circuit; numeric 0=false, nonzero=true)
Parentheses may be used to group.

## Control Flow Statements
- END: terminate program.
- STOP: break execution (like END but indicates stop).
- CONT: continue after STOP if possible.
- GOTO line: jump unconditionally.
- GOSUB line: call subroutine; RETURN: resume after call. Nesting depth limited by stack.
- IF expr THEN target
  - target: line number (GOTO implicit), or single statement after THEN.
  - ELSE is not in v2; use IF ... THEN ... : GOTO ... style.
- FOR var = start TO end [STEP step]
  - NEXT [var]
  - Loop variable is numeric; step defaults to 1; loop executes while (var <= end) for positive step, (var >= end) for negative.
  - NEXT may list multiple variables: NEXT I,J

## Input/Output and Devices
- PRINT [#dev,] [exprs]
  - Separators: ; concatenates without spacing; , tab to next zone (every 10 columns).
  - PRINT# is device output to open channel.
- INPUT [#dev,] list
  - Prompts with '?'; use INPUT# for device channel.
- GET [#dev,] var: read single character (no echo), or from device with GET#.
- TAB(n), SPC(n) in PRINT:
  - TAB(n): move to column n (1-based). SPC(n): print n spaces.
- CMD dev: make dev the default output device until PRINT# or CMD closed.
- OPEN dev,[sec],sa,"filename[,params]"; CLOSE dev
  - dev: device number (e.g., 8 for disk); sec is secondary address; sa usually 0 for read, 1 for write.
- LOAD "name",dev[,sa]; SAVE "name",dev[,sa]
  - On C64, dev=8 is disk drive; without dev uses default.
- VERIFY "name",dev: compare program in memory with storage.

## Data and Variables
- LET var = expr (LET optional).
- READ var[, var...]; DATA literal[, literal...]; RESTORE resets DATA pointer to first DATA.

## String Handling
- Concatenation: A$ + B$
- Substrings: LEFT$(A$,n), MID$(A$,start[,len]), RIGHT$(A$,n)
- Conversion: STR$(n) -> string; VAL(A$) -> numeric; CHR$(n) -> 1-char string; ASC(A$) -> code of first char.
- LEN(A$) -> length in characters.
- **Quotes in strings**: Cannot use " directly inside "...". Use CHR$(34) for quote character.
  Example: PRINT "He said " + CHR$(34) + "Hello!" + CHR$(34) + " to me"

## Numeric Functions
- ABS, SGN, INT, RND([n]), SQR, LOG, EXP, SIN, COS, TAN, ATN, FRE(x), POS(x), USR(x)
- RND behavior: RND(0) repeats last sequence; RND(1) yields [0,1); RND(n<0) seeds with n.
- USR(x): calls machine-language routine pointed by vector at $0311/$0312; return value in FAC.
- PEEK(addr) reads byte; POKE addr, byte writes byte.

## Screen and Keyboard Helpers
- POKE 646,color: set default text color; PRINT CHR$(147) clears screen.
- GET A$: non-blocking single key; returns "" if none.

## Memory and Addresses
- Default BASIC start: $0801. Program and variables share memory up to top-of-BASIC pointer.
- Important areas: Screen $0400–$07E7; Color RAM $D800–$DBE7; I/O/VIC/SID at $D000+.

## Errors and Limits (common)
- Syntax errors at tokenization or runtime: ?SYNTAX ERROR, ?TYPE MISMATCH, ?OUT OF MEMORY, ?REDIM'D ARRAY, etc.
- Line length: ~80 visible chars editor limit; interpreter line storage larger but practical limits apply.
- Variable namespaces: A and A$ are distinct; arrays share namespace with scalars.

## Grammar (informal)
- program := { line }+
- line := lineNumber [statement] { ':' statement }
- statement :=
  END | STOP | CONT |
  GOTO lineNumber |
  GOSUB lineNumber | RETURN |
  FOR var '=' expr TO expr [STEP expr] | NEXT [var {',' var}] |
  IF expr THEN ( lineNumber | statement ) |
  LET? var '=' expr |
  PRINT [ printlist ] | PRINT# expr, [ printlist ] |
  INPUT [ inputlist ] | INPUT# expr, [ inputlist ] |
  GET var | GET# expr, var |
  READ varlist | DATA datalist | RESTORE |
  DIM dimlist |
  OPEN expr[,expr][,expr][,string] | CLOSE expr |
  LOAD string[,expr][,expr] | SAVE string[,expr][,expr] | VERIFY string[,expr] |
  POKE expr, expr | SYS expr | WAIT expr[,expr[,expr]] |
  ON expr GOTO linelist | ON expr GOSUB linelist

## Token List (selected)
END, FOR, NEXT, DATA, INPUT, INPUT#, DIM, READ, LET, GOTO, RUN, IF, RESTORE, GOSUB, RETURN, REM, STOP, ON, WAIT, LOAD, SAVE, VERIFY, DEF, POKE, PRINT#, PRINT, CONT, LIST, CLR, CMD, SYS, OPEN, CLOSE, GET, NEW, TAB(, TO, FN, SPC(, THEN, NOT, STEP, AND, OR, >, =, <, SGN, INT, ABS, USR, FRE, POS, SQR, RND, LOG, EXP, COS, SIN, TAN, ATN, PEEK, LEN, STR$, VAL, ASC, CHR$, LEFT$, RIGHT$, MID$, GO

## Notes and Dialect Differences
- ELSE is not part of v2; no WHILE/REPEAT; no LOCAL variables.
- Disk commands via PRINT# to command channel (15) on device 8, e.g., PRINT#15,"S0:NAME".
- Some editors accept '?' as PRINT abbreviation; stored as PRINT token.
`;

export function getBasicV2Spec(): string {
  return BASIC_V2_SPEC;
}

export function searchBasicV2Spec(query: string): Array<{ heading: string; content: string }> {
  return searchMarkdownSections(BASIC_V2_SPEC, query);
}

const ASM_GUIDE_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../doc/6502-instructions.md");
let cachedAsmReference: string | null = null;

export function getAsmQuickReference(): string {
  if (cachedAsmReference) return cachedAsmReference;
  try {
    cachedAsmReference = readFileSync(ASM_GUIDE_PATH, "utf8");
  } catch {
    cachedAsmReference = "# 6502 Assembly Quick Reference\n\nReference file not found.";
  }
  return cachedAsmReference;
}

export function searchAsmQuickReference(query: string): Array<{ heading: string; content: string }> {
  const guide = getAsmQuickReference();
  return searchMarkdownSections(guide, query);
}

// --- VIC-II Knowledge Base (Concise but practical for graphics/sprites) ---

export const VIC_II_SPEC: string = `
# VIC-II Technical Knowledge Base (Concise, PAL/NTSC, timing-driven)

## Overview
The VIC-II (MOS 6567 NTSC / 6569 PAL) is the video interface in the Commodore 64. It handles text/bitmap graphics, sprites, colour, fine scrolling, raster IRQs, and DRAM refresh. All effects are raster and cycle-timed.

## Video Standards
- PAL 6569: ~312 raster lines, ~63 cycles/line, 50.12 Hz frame rate, CPU ~0.985 MHz.
- NTSC 6567: ~262 raster lines, ~65 cycles/line, 59.83 Hz frame rate, CPU ~1.023 MHz.
  - Note: Exact values vary slightly by chip revision and board. The CPU clock is derived from the VIC, hence different between PAL and NTSC.

## Text and Bitmap Modes (Built-in)
| Mode | Resolution | Cell granularity | Colours per cell | Notes |
|------|------------|------------------|------------------|-------|
| Text (Hi-res) | 40×25 characters (320×200 px) | 8×8 | 1 fg + bg | Default. Foreground per-character via Colour RAM; BG via $D021. |
| Multicolour Text | 40×25 (effective 160×200 px) | 4×8 | Up to 3 + BG | Double-wide pixels horizontally; shares $D021–$D023 colours. |
| Extended Background (ECM) | 40×25 | 8×8 | 4 BG | Top 2 bits of char code select BG from $D021–$D024. |
| Bitmap Hi-Res | 320×200 | 8×8 | 2 per block | BMM=1, MCM=0. Colours per 8×8 from screen RAM nybbles. |
| Bitmap Multicolour | 160×200 | 4×8 | 3 + BG | BMM=1, MCM=1. Colours per 4×8 from screen RAM nybbles. |

## Special “Research” Modes (Demo-scene techniques)
These are not official hardware modes; they exploit timing and badline behaviour to increase colour detail:
- FLI (Flexible Line Interpreter): Forces a badline every raster line (by changing $D011 Y-scroll each line) so that colour nybbles are reloaded per line, yielding more colours per character row in bitmap or char modes. Costs: very heavy DMA (badline each line) and tight cycle budgets.
- AFLI/IFLI (Advanced/Interlaced FLI): Variants combining hi-res and multicolour assets and/or alternating frames to increase apparent colour count at the cost of flicker and extreme timing.
- NUFLI, SHIFLI and derivatives: Advanced compressors of colour clashes using sprite overlays plus FLI. Require multiplexing and per-line colour changes.
These modes demand stable raster IRQs, avoiding writes during critical cycles (especially on badlines) and often sprite multiplexing.

## Sprite System
- 8 hardware sprites (0–7), nominal 24×21 px; multicolour halves horizontal resolution to 12×21 with 3 + transparent colours.
- Control: position $D000–$D00F (+$D010 MSBs), enable $D015, multicolour $D01C, behind/priority $D01B, expand X $D01D, expand Y $D017.
- Colour: shared $D025/$D026; per-sprite colours $D027–$D02E.
- Data: 63 bytes/sprite (3 bytes/row × 21 rows). Sprite pointers at $07F8–$07FF hold (address/64).
- Limit: max 8 sprites on any raster line (hardware). Exceed width with multiplexing via raster IRQ repositioning.

## Raster and Timing Essentials
- Raster register: $D012 (low 8 bits), high bit in $D011 bit 7 is NOT the high raster bit; note: $D011 bit 7=screen on/off; high raster bit is bit 7 of $D011? On C64: bit 7 of $D011 is actually the 9th raster bit when read via $D011; the same register contains vertical scroll (lower 3 bits), ECM and BMM bits.
- Badlines: Occur when (screen enabled) AND (rasterY between first and last text row) AND ((rasterY & 7) == (Y-scroll bits in $D011)). On a badline the VIC fetches 40 character pointers, stealing about 40 cycles, leaving ~23 CPU cycles on PAL. There are 25 potential badlines for the 25 text rows per frame (when screen on).
- Sprite DMA: Each visible sprite steals ~3 cycles per raster line while fetching its graphics. Fetch windows are fixed per sprite index; budget carefully on heavy lines. These steals are in addition to badline character fetches.
- Per-line CPU cycles (approximate):
  - PAL non-badline: ~63 − 3×(active sprites on that line)
  - PAL badline: ~23 − 3×(active sprites not covered by the 40-char fetch window)
  - NTSC has ~65 cycles per line; proportions similar. Exact overlap depends on chip revision; measure on target hardware if cycle-exact code is required.

## Opening Borders (precise effect windows)
Border visibility depends on the scroll bits and internal fetch state. The classic windows are:
- Top/Bottom border: Toggle $D011 bit 3 (denoted RSEL/Y-Enable) around the transition into/out of the main display to trick the VIC into considering display active. Common practice is to change $D011 as the raster passes the last visible row (e.g., lines $F8–$FB on PAL) with stable-cycle IRQs.
- Side borders: Write to $D016 (horizontal scroll) within a narrow cycle window early in a raster line of the visible area (roughly cycles 24–26 on PAL for the canonical trick) to prevent the side border from opening. Maintain matching scroll values per line to keep it open. This must be timed each line you want the side border suppressed.
Notes: Exact cycle numbers vary slightly (PAL vs NTSC and chip revisions). Always establish a stable raster using a delay-tuned IRQ prologue and verify on real hardware.

## PAL/NTSC Geometry
- Text columns/rows: 40×25 in both PAL and NTSC when borders are normal.
- Visible bitmap area: 320×200 (hi-res) or 160×200 (multicolour). The full frame has additional border scanlines and cycles that are not visible unless border tricks are used.
- Frame/refresh rates: PAL ~50.12 Hz; NTSC ~59.83 Hz. Colour subcarrier and pixel clocks differ, affecting exact cycle lengths.

## Useful Registers (subset)
$D011: CTRL1 (bit7=High raster bit when reading; writing: bit7 Screen on/off), bit6 ECM, bit5 BMM, bit4 (unused), bits 0–2=Y scroll.
$D016: CTRL2 (bit4 MCM, bits 0–2 X scroll).
$D015: Sprite enable, $D01C: Sprite multicolour, $D01D: Sprite X expand, $D017: Sprite Y expand.
$D020/$D021: Border/background, $D022–$D024: shared multicolours, $D025/$D026: sprite shared colours.
$07F8–$07FF: Sprite data pointers (address/64).

## Best Practices for Raster Effects
- Do not write to $D011/$D016 during badlines unless you deliberately trigger FLI behaviour.
- Align IRQs to known cycle counts; use a stable raster entry sequence (acknowledge $D019, delay with a tuned instruction sequence, then effect writes).
- Budget for sprite DMA on lines with many sprites; schedule heavy updates on non-badlines.
- Disable screen ($D011 bit7=0) temporarily to suppress badlines when maximum CPU time is needed.

## References
- Zimmers.net: VIC-II register and memory maps
- C64 Programmer’s Reference Guide (graphics and raster chapters)
- Codebase64: VIC-II timing tables, badline definitions, border opening write windows, and FLI/IFLI techniques
`;

export function getVicIISpec(): string {
  return VIC_II_SPEC;
}

export function searchVicIISpec(query: string): Array<{ heading: string; content: string }> {
  return searchMarkdownSections(VIC_II_SPEC, query);
}

function searchMarkdownSections(content: string, query: string): Array<{ heading: string; content: string }> {
  if (!query || typeof query !== "string") {
    return [];
  }
  const normalized = query.trim().toLowerCase();
  const sections: Array<{ heading: string; content: string }> = [];
  const lines = content.split(/\r?\n/);
  let currentHeading = "";
  let currentBuffer: string[] = [];
  const flush = () => {
    if (!currentHeading) return;
    const content = currentBuffer.join("\n").trim();
    sections.push({ heading: currentHeading, content });
  };
  for (const line of lines) {
    const headingMatch = /^(##+)\s+(.*)$/.exec(line);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[2].trim();
      currentBuffer = [];
    } else {
      currentBuffer.push(line);
    }
  }
  flush();

  const matches = sections.filter((s) =>
    s.heading.toLowerCase().includes(normalized) || s.content.toLowerCase().includes(normalized),
  );
  return matches;
}
