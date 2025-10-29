# Language

## Overview

MOS 6510 (C64 CPU) is a NMOS 6502 core with an 8‑bit data path and a 16‑bit address space (64 KiB). Registers: `A`, `X`, `Y` (8‑bit), `PC` (16‑bit), `SP` (8‑bit, stack at `$0100..$01FF`), `P` status `[N V - B D I Z C]`. The stack grows downward; pushes write to `$0100+SP` then decrement `SP`.

## Lexical Conventions

- **Numbers:** decimal `42`, hexadecimal `$2A`, binary `%00101010`. Immediate prefix `#`.
- **Identifiers:** `[A–Z_][A–Z0–9_]*` (case‑insensitive).  
- **Labels:** an identifier followed by `:` defines the current address. Reference with the bare identifier (optionally signed offsets in expressions).
- **Comments:** `;` to end of line. Whitespace is insignificant except as separator.
- **Expressions:** integers with `+ - * / & | ^ ~ << >>` and parentheses (assembler‑dependent), may refer to labels and the current location counter `*`.

## Addressing Modes (names and syntax)

| Abbrev | Name | Operand Syntax | Example |
|---|---|---|---|
| `A` | Accumulator | `A` or omitted | `ASL A` / `ASL` |
| `#` | Immediate | `#byte` | `LDA #$0F` |
| `ZP` | Zeropage | `$LL` | `LDA $00` |
| `ZPX` | Zeropage,X | `$LL,X` | `LDA $10,X` |
| `ZPY` | Zeropage,Y | `$LL,Y` | `LDX $10,Y` |
| `ABS` | Absolute | `$HHLL` | `LDA $C000` |
| `ABSX` | Absolute,X | `$HHLL,X` | `LDA $D000,X` |
| `ABSY` | Absolute,Y | `$HHLL,Y` | `LDA $D000,Y` |
| `IND` | Indirect | `($HHLL)` | `JMP ($FFFC)` |
| `IZX` | (ZP,X) | `($LL,X)` | `LDA ($40,X)` |
| `IZY` | (ZP),Y | `($LL),Y` | `LDA ($40),Y` |
| `REL` | Relative | label | `BEQ done` |
| `IMP` | Implied | — | `CLC` |

*6510 `JMP (addr)` has the classic page‑wrap bug at `$xxFF → $xx00`.*

## Labels and Symbol Rules

- **Definition:** `label:` binds `label` to the current address (`*`). Multiple labels may precede an instruction.
- **Use:** Any place an absolute/relative/address expression is expected (`LDA label`, `BEQ loop`).
- **Forward refs:** allowed; assembler resolves in a second pass.
- **Constants:** `name = expr` or `.equ name, expr` (assembler‑specific). Location counter may be set with `.org expr`. Data directives: `.byte`, `.word`, `.fill`, `.align` (names may vary).

## Instruction Semantics (brief)

- **Load/Store:** `LDA/LDX/LDY` load; `STA/STX/STY` store. Affect `N,Z` (stores don’t).
- **ALU:** `ADC/SBC` (use `CLC`/`SEC` before add/sub), `AND/ORA/EOR`, `INC/DEC` (memory), `INX/INY/DEX/DEY` (registers). Flags as per 6502.
- **Shifts/Rotates:** `ASL/LSR/ROL/ROR` on `A` or memory. Shifted‑out bit enters `C`.
- **Compare:** `CMP/CPX/CPY` set `C` for ≥, `Z` for =, `N` for sign of result (no writeback).
- **Branch:** `BPL/BMI/BVC/BVS/BCC/BCS/BNE/BEQ` use signed 8‑bit `REL` offset (−128..+127 from `PC+2`). Taken branch +1 cycle; +1 more if page crosses.
- **Jumps/Calls:** `JMP` `ABS|IND`, `JSR ABS`, `RTS`, `BRK`/`RTI`.
- **Stack/Flags/Xfer:** `PHA/PLA`, `PHP/PLP`, `TAX/TAY/TXA/TYA`, `TSX/TXS`, `CLC/SEC/CLI/SEI/CLD/SED/CLV`, `NOP`.
- **Decimal mode:** C64 typically keeps `D=0` (`CLD`). Use BCD only if intentional.

## EBNF (assembly source)

```
program     = { line } ;
line        = [ label ] , [ instruction | directive ] , [ comment ] , EOL ;
label       = identifier , ":" ;
instruction = mnemonic , [ operand ] ;
directive   = "." , ident , [ operandlist ] ;

operand     = expr
            | "#" , byte
            | "(" , expr , ")"                          (* IND for JMP *)
            | "(" , zp , "," , "X" , ")"                (* IZX *)
            | "(" , zp , ")" , "," , "Y"                (* IZY *)
            | expr , "," , "X"                          (* ABSX or ZPX *)
            | expr , "," , "Y"                          (* ABSY or ZPY *)
            ;
operandlist = expr , { "," , expr } ;

expr        = term , { ("+"|"-"|"|"|"^") , term } ;
term        = factor , { ("*"|"/"|"&") , factor } ;
factor      = ["+"|"-"|"~"] , primary ;
primary     = number | identifier | "(" , expr , ")" | "*" ;

mnemonic    = "ADC"|"AND"|"ASL"|"BCC"|"BCS"|"BEQ"|"BIT"|"BMI"|"BNE"|"BPL"|
              "BRK"|"BVC"|"BVS"|"CLC"|"CLD"|"CLI"|"CLV"|"CMP"|"CPX"|"CPY"|
              "DEC"|"DEX"|"DEY"|"EOR"|"INC"|"INX"|"INY"|"JMP"|"JSR"|"LDA"|
              "LDX"|"LDY"|"LSR"|"NOP"|"ORA"|"PHA"|"PHP"|"PLA"|"PLP"|"ROL"|
              "ROR"|"RTI"|"RTS"|"SBC"|"SEC"|"SED"|"SEI"|"STA"|"STX"|"STY"|
              "TAX"|"TAY"|"TSX"|"TXA"|"TXS"|"TYA" ;

identifier  = ( "A".."Z" | "_" ) , { "A".."Z" | "0".."9" | "_" } ;
number      = dec | "$" hex | "%" bin ;
dec         = "0".."9" , { "0".."9" } ;
hex         = hexDigit , { hexDigit } ;
bin         = "0"|"1" , { "0"|"1" } ;
hexDigit    = "0".."9" | "A".."F" ;
byte        = number ;      (* assembler validates range *)
zp          = number ;      (* assembler may restrict to 0..255 for ZP *)
comment     = ";" , { any-not-EOL } ;
EOL         = "\n" ;
```

---

## Tokenization

### Addressing‑Mode Profiles (bytes/cycles)

Unless noted, page cross on `ABSX/ABSY/IZY` adds **+1** cycle.

| Group | Mode → bytes/cycles | Notes |
|---|---|---|
| **ALU (ADC,AND,CMP,EOR,LDA,ORA,SBC)** | `#` 2/2 · `ZP` 2/3 · `ZPX` 2/4 · `ABS` 3/4 · `ABSX` 3/4+ · `ABSY` 3/4+ · `IZX` 2/6 · `IZY` 2/5+ | CMP shares counts; LDA as listed. |
| **STA** | `ZP` 2/3 · `ZPX` 2/4 · `ABS` 3/4 · `ABSX` 3/5 · `ABSY` 3/5 · `IZX` 2/6 · `IZY` 2/6 | Store does **not** set `N,Z`. |
| **STX** | `ZP` 2/3 · `ZPY` 2/4 · `ABS` 3/4 | |
| **STY** | `ZP` 2/3 · `ZPX` 2/4 · `ABS` 3/4 | |
| **LDX** | `#` 2/2 · `ZP` 2/3 · `ZPY` 2/4 · `ABS` 3/4 · `ABSY` 3/4+ | |
| **LDY** | `#` 2/2 · `ZP` 2/3 · `ZPX` 2/4 · `ABS` 3/4 · `ABSX` 3/4+ | |
| **INC/DEC (mem)** | `ZP` 2/5 · `ZPX` 2/6 · `ABS` 3/6 · `ABSX` 3/7 | |
| **INX/INY/DEX/DEY** | `IMP` 1/2 | |
| **ASL/LSR/ROL/ROR** | `A` 1/2 · `ZP` 2/5 · `ZPX` 2/6 · `ABS` 3/6 · `ABSX` 3/7 | |
| **BIT** | `ZP` 2/3 · `ABS` 3/4 | On 6510 only ZP/ABS. |
| **JMP** | `ABS` 3/3 · `IND` 3/5 | Buggy wrap on `IND`. |
| **JSR/RTS/RTI/BRK** | `JSR ABS` 3/6 · `RTS` 1/6 · `RTI` 1/6 · `BRK` 1/7 | |
| **Branches (Bcc)** | `REL` 2/2(+1 taken, +1 xpage) | |
| **Flag ops** | `IMP` 1/2 | `CLC,CLD,CLI,CLV,SEC,SED,SEI` |
| **Stack ops** | `PHA,PHP` 1/3 · `PLA,PLP` 1/4 | |
| **Transfers** | `TAX,TAY,TXA,TYA,TSX,TXS` 1/2 | |
| **NOP** | `IMP` 1/2 | Documented form only. |

### Opcode × Addressing‑Mode Matrix (✓ = supported on 6510)

Modes (columns): `A  #  ZP ZPX ZPY ABS ABSX ABSY IND IZX IZY REL IMP`

| Mnemonic |A|#|ZP|ZPX|ZPY|ABS|ABSX|ABSY|IND|IZX|IZY|REL|IMP|
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| ADC | |✓|✓|✓| |✓|✓|✓| |✓|✓| | |
| AND | |✓|✓|✓| |✓|✓|✓| |✓|✓| | |
| ASL |✓| |✓|✓| |✓|✓| | | | | | |
| BCC | | | | | | | | | | | |✓| |
| BCS | | | | | | | | | | | |✓| |
| BEQ | | | | | | | | | | | |✓| |
| BIT | | |✓| | |✓| | | | | | | |
| BMI | | | | | | | | | | | |✓| |
| BNE | | | | | | | | | | | |✓| |
| BPL | | | | | | | | | | | |✓| |
| BRK | | | | | | | | | | | | |✓|
| BVC | | | | | | | | | | | |✓| |
| BVS | | | | | | | | | | | |✓| |
| CLC | | | | | | | | | | | | |✓|
| CLD | | | | | | | | | | | | |✓|
| CLI | | | | | | | | | | | | |✓|
| CLV | | | | | | | | | | | | |✓|
| CMP | |✓|✓|✓| |✓|✓|✓| |✓|✓| | |
| CPX | |✓|✓| | |✓| | | | | | | |
| CPY | |✓|✓| | |✓| | | | | | | |
| DEC | | |✓|✓| |✓|✓| | | | | | |
| DEX | | | | | | | | | | | | |✓|
| DEY | | | | | | | | | | | | |✓|
| EOR | |✓|✓|✓| |✓|✓|✓| |✓|✓| | |
| INC | | |✓|✓| |✓|✓| | | | | | |
| INX | | | | | | | | | | | | |✓|
| INY | | | | | | | | | | | | |✓|
| JMP | | | | | |✓| |✓|✓| | | | |
| JSR | | | | | |✓| | | | | | | |
| LDA | |✓|✓|✓| |✓|✓|✓| |✓|✓| | |
| LDX | |✓|✓| |✓|✓| |✓| | | | | |
| LDY | |✓|✓|✓| |✓|✓| | | | | | |
| LSR |✓| |✓|✓| |✓|✓| | | | | | |
| NOP | | | | | | | | | | | | |✓|
| ORA | |✓|✓|✓| |✓|✓|✓| |✓|✓| | |
| PHA | | | | | | | | | | | | |✓|
| PHP | | | | | | | | | | | | |✓|
| PLA | | | | | | | | | | | | |✓|
| PLP | | | | | | | | | | | | |✓|
| ROL |✓| |✓|✓| |✓|✓| | | | | | |
| ROR |✓| |✓|✓| |✓|✓| | | | | | |
| RTI | | | | | | | | | | | | |✓|
| RTS | | | | | | | | | | | | |✓|
| SBC | |✓|✓|✓| |✓|✓|✓| |✓|✓| | |
| SEC | | | | | | | | | | | | |✓|
| SED | | | | | | | | | | | | |✓|
| SEI | | | | | | | | | | | | |✓|
| STA | | |✓|✓| |✓|✓|✓| |✓|✓| | |
| STX | | |✓| |✓|✓| | | | | | | |
| STY | | |✓|✓| |✓| | | | | | | |
| TAX | | | | | | | | | | | | |✓|
| TAY | | | | | | | | | | | | |✓|
| TSX | | | | | | | | | | | | |✓|
| TXA | | | | | | | | | | | | |✓|
| TXS | | | | | | | | | | | | |✓|
| TYA | | | | | | | | | | | | |✓|

### Vector Entry Points (C64)

- NMI `$FFFA/B`, RESET `$FFFC/D`, IRQ/BRK `$FFFE/F`. After RESET, execution starts at vector `$FFFC` (KERNAL init).

### Minimal Directives (common)

- Location: `.org addr` / `* = addr`  
- Data: `.byte expr[,…]`, `.word expr[,…]`  
- Symbols: `name = expr` / `.equ name, expr`  
- Alignment/fill (assembler‑specific): `.align n`, `.fill count, value`

## BASIC headers and PRG autostart

When producing a distributable PRG that autostarts from the C64 (for example by
typing `LOAD"PROGRAM.PRG",8,1` or by autostart mechanisms in emulators), you'll
usually want to include a tiny tokenized BASIC header followed by machine code so
the file can be executed with a single `SYS` or by the firmware's autostart.

PRG file layout (high level):

- 2‑byte little‑endian load address header (file starts with the load address)
- tokenized BASIC program starting at `$0801` (commonly)
- machine code data placed at a chosen load address (e.g. `$1000`) or immediately
    after the BASIC block

Example: tokenized one‑line BASIC that executes `SYS 4096` (jump to `$1000`):

    - At `$0801` write the two‑byte pointer to the next line (little endian)
    - Write the 2‑byte line number (10) little endian
    - Write token bytes for `SYS` (token `0x9E`) then ASCII/PETSCII digits `4`,`0`,`9`,`6`
    - Terminate the line with `0x00` and terminate the program with `0x00 0x00`

Minimal assembled bytes (conceptual):

    .org $0801
    ; next-line pointer -> $080C (example)
    .byte $0C,$08           ; pointer to next line
    .byte $0A,$00           ; line number 10
    .byte $9E,$20,$34,$30,$39,$36 ; SYS <space> 4 0 9 6
    .byte $00               ; end of line
    .byte $00,$00           ; end of program

Notes:

- The token `SYS` is `0x9E` in the token table used by Commodore BASIC. Use the
    project's `basicConverter` if you need programmatic tokenization.
- The PRG file itself must still include the 2‑byte load address header. Most
    toolchains (assemblyToPrg/basicToPrg) will produce this for you.
- Choose a machine‑code load address that does not overlap the BASIC area. A
    common convention is to place code at `$1000` (`4096`) and `SYS 4096` in the
    BASIC line.

Autostart tips:

- Placing the BASIC header at `$0801` is conventional and compatible with the
    Commodore autostart behavior.
- If you prefer a compact PRG, you may put the machine code immediately after
    the BASIC block and adjust the `SYS` target accordingly.
- Always ensure the two‑byte load address at the start of the PRG matches the
    address where you placed the BASIC header (e.g. write `$01 $08` for `$0801`).

## Printing to the screen (assembly patterns)

There are two common approaches to render text on the C64 from assembly:

1. KERNAL CHROUT — call the KERNAL character output routine which expects
     PETSCII in `A` and prints using the active charset (portable and simple).
2. Direct screen RAM writes — write screen codes directly to the screen memory
     at `$0400` (very fast but requires correct screen codes and knowledge of the
     active character set).

Below are short patterns and considerations for both.

1) KERNAL CHROUT (safe, charset-independent)

The KERNAL provides `CHROUT` at `$FFD2`. Put the character (PETSCII) in `A`
and JSR `$FFD2` to print it at the current cursor position. This method
automatically maps PETSCII to the current screen font and handles device state.

Example — print a zero‑terminated string using CHROUT:

    .org $1000
print_loop:
    ldx #$00
1: lda message,x
    beq 2f
    jsr $FFD2    ; CHROUT prints PETSCII in A
    inx
    jmp 1b
2: rts

message:
    .byte $48,$45,$4C,$4C,$4F,$2C,$20,$57,$4F,$52,$4C,$44,$21,0

Notes:

- Use PETSCII byte values in the message. Upper/lowercase behavior depends on
    the current editor/charset mode; CHROUT prints according to the active PETSCII
    mapping so it's usually the most compatible option.

2) Direct screen RAM writes (fast)

Screen memory starts at `$0400` (1000 decimal) with 40 columns per row. Writing
bytes directly to `$0400 + X` writes the screen code values displayed in the
current charset. This is the fastest method for bulk updates (e.g. games).

Example — write zero‑terminated message as screen codes (assumes message
already contains VIC-II screen codes, not ASCII):

    .org $1000
    ldx #$00
1: lda message,x
    beq 2f
    sta $0400,x    ; store screen code directly
    inx
    jmp 1b
2: rts

message_screen_codes:
    .byte $08,$05,$0C,$0C,$0F,$2C,$20,$17,$0F,$12,$0C,$04,$21,0

Converting ASCII to screen codes (letters):

If your message is ASCII uppercase `A..Z` and you want the corresponding
screen codes, a simple conversion is `screen = petscii - $40` (because PETSCII
for `A` is $41 and screen code for `A` in the shipped chargen is `1`). A small
assembly conversion loop can perform this at runtime:

    ; convert A..Z to screen codes
    ldx #$00
conv:
    lda message_ascii,x
    beq conv_done
    cmp #$41      ; 'A'
    bmi conv_skip  ; leave unchanged if < 'A'
    cmp #$5A      ; 'Z'
    bpl conv_skip
    sec
    sbc #$40      ; subtract 0x40 to get screen code for A..Z
    sta $0400,x
    inx
    jmp conv
conv_skip:
    ; handle digits, punctuation, space etc. (copy through or map as needed)
    sta $0400,x
    inx
    jmp conv
conv_done:

Color RAM

To color text, write to color RAM at `$D800 + offset` (one byte per character).
Color RAM holds 4‑bit colour indices (0..15). Example: write white (color 1)
across the message:

    ldx #$00
    lda #$01
col_loop:
    sta $D800,x
    inx
    cpx #<length
    bne col_loop

Practical notes and caveats

- Direct screen writes require correct screen codes; if you see wrong glyphs
    it's usually a charset selection issue. CHROUT avoids that because it prints
    PETSCII using the currently selected charset.
- Writing to `$0400` updates the screen characters; writing to `$D800` updates
    their colours. Both are memory‑mapped and very fast when used with `STA`.
- Be careful not to overwrite BASIC variables or vectors in low memory when you
    place machine code; keep code in safe RAM (`$1000` and up is common).
- If your program returns to BASIC, `RTS` is appropriate when invoked via `SYS`.
    If the code is executed by other means, make sure to restore any registers or
    memory the BASIC runtime expects.

This chapter provides the common patterns used across the project for producing
autostart PRGs and fast screen output from assembly. Use the provided snippets
as starting points and adapt mapping tables where your target charset differs.
