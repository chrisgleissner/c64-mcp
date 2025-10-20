/*
C64 MCP - An MCP Server for the Commodore 64 Ultimate
Copyright (C) 2025 Christian Gleissner

Licensed under the GNU General Public License v2.0 or later.
See <https://www.gnu.org/licenses/> for details.
*/

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
  if (!query || typeof query !== "string") {
    return [];
  }
  const normalized = query.trim().toLowerCase();
  const sections: Array<{ heading: string; content: string }> = [];
  const lines = BASIC_V2_SPEC.split(/\r?\n/);
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
