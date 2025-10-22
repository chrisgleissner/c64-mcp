# C64 MCP Bootstrap Primer

Concise, complete reference for core C64 development with MCP. Keep under ~8 KB. This is injected first in every session.

## Device & Services
- MCP server controls Ultimate 64/C64 via REST: upload/run BASIC or ASM, screen/memory I/O, drives, SID music, audio analyze, local RAG.
- Key chips: VIC-II ($D000), SID ($D400), CIA1 ($DC00), CIA2 ($DD00).

## Memory Map (default RAM layout)
- $0000–$00FF: Zero page
- $0100–$01FF: Stack
- $0200–$02FF: Workspace, vectors ($0314/$0315 IRQ, $0318/$0319 BRK)
- $0400–$07E7: Screen RAM (text 40×25)
- $0801–: BASIC program area (defaults)
- $A000–$BFFF: BASIC ROM (banked; RAM when LORAM/HIRAM cleared)
- $C000–$CFFF: RAM (common for ASM)
- $D000–$DFFF: I/O area (VIC-II $D000–$D02E; SID $D400–$D418; Color RAM $D800–$DBE7; CIA1/2 $DC00/$DD00)
- $E000–$FFFF: KERNAL ROM (banked)

Bank control (6510 at $0001):
- Bits: 0 LORAM, 1 HIRAM, 2 CHAREN. Typical full RAM: %0000_0011 → clear for RAM, set for ROM.

## VIC-II Essentials ($D000–$D02E)
- Sprites: X ($D000..$D00E even), Y ($D001..$D00F odd), X MSBs $D010
- Control: $D011 (bit 7: 25th row; bit 6: RST8; bit 5: bitmap on; bits 0–2: vertical scroll)
- Raster line: $D012 (LSB), $D011 bit 7 part of MSB logic; raster IRQ: mask $D01A, status $D019, vector $0314/$0315
- Control 2/Multicolour: $D016 (bit 4: 38/40 cols; bit 5: multicolour; bits 0–2: horizontal scroll)
- Memory pointers: $D018 (bits 1–3: screen base; bits 4–7: charset/bitmap base)
- Sprite enable: $D015; expand X: $D01D; expand Y: $D017 (read-modify per docs); priority: $D01B; multicolour: $D01C
- Colors: Border $D020; Background 0–3 $D021–$D023; Sprite mcolor $D025–$D026; Sprite colors $D027–$D02E
- Collisions: sprite-sprite $D01E (read/clear by write); sprite-background $D01F

Video modes:
- Text: $D011 bit 5=0; $D016 bit 5=0 (hi-res); chars from $D018 charset; screen map at $D018
- Bitmap: $D011 bit 5=1; hi-res (single color per 8×8) or multicolour ($D016 bit 5=1)
- Multicolour text/bitmap: wide pixels; use $D022–$D024 and color RAM for palette

Bitmap setup (typical):
- Screen map at $0400 ($D018 bits 1–3 = 1), bitmap at $2000 ($D018 bits 4–7 = 8)
- Enable bitmap: set $D011 bit 5; optional multicolour: set $D016 bit 5

## SID Essentials ($D400–$D418)
Per voice (1..3; base offsets +0x07 per voice):
- FREQ LO/HI: $D400/$D401, $D407/$D408, $D40E/$D40F
- PULSE LO/HI: $D402/$D403, $D409/$D40A, $D410/$D411
- CONTROL: $D404, $D40B, $D412 (bit 0 GATE; 1 SYNC; 2 RING; 3 TEST; 4 TRI; 5 SAW; 6 PULSE; 7 NOISE)
- ADSR: $D405 (A hi-nibble, D lo-nibble), $D406 (S hi-nibble, R lo-nibble)

Filter/Master:
- Cutoff: $D415/$D416, Resonance/Voice route: $D417, Volume/Filter mode: $D418 (lo 4 bits volume 0–15; bits 4–7 filter+3rd voice off)

Making sound (basic):
1) Set frequency ($D400/01)
2) Set pulse width ($D402/03) if pulse
3) Set ADSR ($D405/06)
4) Set waveform + GATE in CONTROL ($D404)
5) Master volume at $D418

## PETSCII, Screen & Colors
- Screen at $0400 (40×25); write screen codes. Color RAM at $D800 (nybbles). Border $D020, background $D021.
- To draw pixels: use bitmap mode and write to bitmap memory; control colors via attributes (screen/color RAM in text, nybbles per cell in bitmap multicolour).

## BASIC v2 – Condensed Syntax (complete core)
- Program: numbered lines; end with `END` or stop on last line
- Variables: A–Z (and arrays A()(numeric), A$() string); strings end with `$`
- Assignment: `LET A=expr` (LET optional) | `A$="TEXT"`
- I/O: `PRINT expr[,;expr...]` | `INPUT var` | `GET A$` | `OPEN ch,dev,sa,"name"` | `PRINT#ch,expr` | `CLOSE ch`
- Control: `IF expr THEN <stmt|line>` | `GOTO n` | `GOSUB n` | `RETURN` | `FOR v=start TO end STEP s: ... : NEXT v` | `ON x GOTO l1,...` | `ON x GOSUB l1,...`
- Data: `DATA v1,v2,...` | `READ var` | `RESTORE`
- System: `POKE addr,val` | `PEEK(addr)` | `SYS addr` | `RUN` | `STOP` | `NEW`
- Strings: `LEFT$(s,n)` `RIGHT$(s,n)` `MID$(s,p[,n])` `CHR$(n)` `ASC(s)` `LEN(s)`
- Math: `+ - * / ^` | `ABS` `INT` `SGN` `SQR` `SIN` `COS` `TAN` `ATN` `RND([n])` `FRE(0)` `TI$` (time)
- Relational: `= <> < > <= >=` (boolean as -1/0)
- Remarks: `REM text` (tokens ignored till end of line)
- Example (print to printer device 4): `OPEN 4,4:PRINT#4,"HELLO":CLOSE 4`

## 6502/6510 Assembly – Condensed
- Addressing modes: `#imm, zp, zp,X, zp,Y, abs, abs,X, abs,Y, (zp), (zp,X), (zp),Y, rel`
- Key opcodes (full set):
  - Load/Store: `LDA LDX LDY / STA STX STY`
  - ALU: `ADC SBC AND ORA EOR ASL LSR ROL ROR`
  - Inc/Dec: `INC INX INY DEC DEX DEY`
  - Compare/Bit: `CMP CPX CPY BIT`
  - Branch: `BCC BCS BEQ BMI BNE BPL BVC BVS`
  - Jump/Call: `JMP JSR RTS RTI`
  - Status: `CLC SEC CLI SEI CLD SED CLV NOP`
  - Stack: `PHA PHP PLA PLP TAX TXA TAY TYA TSX TXS BRK`
- Directives (assembler used here): `.org/*=`, `.byte`, `.word`, `.text/.ascii`, `ds` (fill), labels `name:`
- Interrupts: set IRQ vector at $0314/$0315 to your routine; acknowledge VIC-II IRQ by writing back bit to $D019.
- Example (border flash): set `$D020` repeatedly; ensure stable timing via raster IRQ (`$D012`/`$D011`), mask `$D01A`, acknowledge `$D019`.

## Raster IRQ Setup (minimal)
1) Disable interrupts: `SEI`
2) Set raster line `$D012`, configure `$D011` bit 7 accordingly
3) Set IRQ vector `$0314/$0315` to handler
4) Enable IRQ in `$D01A` and global `CLI`
5) In handler: do work (e.g., change colors/sprites), then `LDA $D019`/`STA $D019` to clear and `RTI`

## Image & Sprite Quick Start
- Bitmap (hi-res): set `$D011` bit 5=1, `$D016` bit 5=0; point `$D018` to screen/bitmap; write bits into bitmap memory.
- Multicolour bitmap: also set `$D016` bit 5=1; use `$D022–$D024` and color RAM attributes per cell.
- Sprites: define 63-byte patterns in sprite memory; set sprite pointers in screen map (end of screen at $07F8..$07FF); position with `$D000–$D00F`, enable with `$D015`.

## Context & RAG
- Layers: `bootstrap.md` → `agents.md` → `prompts.md` → `chat.md` → RAG docs (`doc/*.md`).
- Retrieval returns relevant chunks with provenance comments for transparency.
