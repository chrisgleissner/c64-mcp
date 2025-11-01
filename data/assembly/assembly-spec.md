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

```ebnf
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

## Tips and Tricks

### Basic Start Header

- PRG file = 2-byte little-endian load address + bytes
- Place a tokenized BASIC line at $0801, e.g. `10 SYS 4096` (token SYS = $9E) to jump to $1000
- Ensure load-address at PRG start matches where BASIC was placed (e.g. $01 $08)
- Machine code may live at $1000 or directly after BASIC; adjust SYS target accordingly

### Display Text on Screen

1) KERNAL CHROUT (portable)
   - Put PETSCII byte in A; JSR $FFD2 to print at cursor. Handles charset mapping.
   - Use for portability and when charset may vary.
2) Direct screen writes (fast)
   - STA $0400,X writes VIC-II screen codes directly. Use when you control charset and need speed.
   - Color via STA $D800,X (4-bit color index).

Screen-code conversion

- If input is ASCII uppercase 'A'..'Z', convert: screen = PETSCII - $40 (e.g. $41→$01). Implement in a small loop if needed.

This file is intentionally minimal: use `basicConverter` / `assemblyConverter` in `src/` for tokenization/PRG building and `data/graphics/character-set.csv` for exact screen-code mappings.
