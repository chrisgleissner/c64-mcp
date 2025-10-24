# 6502 / 6510 Assembly Quick Reference


This condensed guide targets the Commodore 64's 6510 CPU (NMOS 6502 core with an I/O port). It surfaces the essentials the MCP server should remind the LLM about when the user requests "assembly", "machine code", or "fast" routines.

---

## CPU Essentials

- **Word size:** 8-bit data, 16-bit address space (64 KiB).
- **Registers:**
  - `A` accumulator, primary ALU operand/result.
  - `X`, `Y` index registers (8-bit) for addressing, loop counters, data moves.
  - `PC` program counter (16-bit), `SP` stack pointer (8-bit, stack lives at `$0100-$01FF`).
  - `P` status register bits `[N V - B D I Z C]` (negative, overflow, unused, break, decimal, interrupt disable, zero, carry).
- **Stack:** grows downward; push writes to `$0100 + SP`, then decrements `SP`.
- **Clocking:** most instructions take 2–7 cycles; page crossings and branches that succeed add a cycle (two if crossing a page).

## Addressing Modes Cheat Sheet

| Mode | Syntax | Bytes | Notes |
| --- | --- | --- | --- |
| Accumulator | `OPC A` | 1 | Operates on `A`. Often written without the `A` token. |
| Immediate | `#value` | 2 | Literal byte. |
| Zeropage | `$LL` | 2 | Low-byte address (`$00LL`); fastest memory access. |
| Zeropage,X / Zeropage,Y | `$LL,X` | 2 | Wraps inside zeropage (no carry). `,Y` only on `LDX`, `STX`. |
| Absolute | `$HHLL` | 3 | Full 16-bit address. |
| Absolute,X / Absolute,Y | `$HHLL,X` | 3 | Adds index; +1 cycle on page cross. |
| Indirect | `(addr)` | 3 | Only on `JMP`. Hardware bug: vector at `$xxFF` wraps to `$xx00` (6510). |
| (Indirect,X) | `(zp,X)` | 2 | Pre-index pointer table in zeropage. |
| (Indirect),Y | `(zp),Y` | 2 | Post-index pointer (adds `Y` after reading pointer). |
| Relative | `label` | 2 | Branch target = `PC + signed offset` (`-128 .. +127`). |

## Instruction Families

### Load / Store / Transfer

- `LDA/LDX/LDY` and `STA/STX/STY` move bytes between memory and registers.
- `TAX/TAY/TXA/TYA` copy between accumulator and index registers.
- `TSX/TXS` bridge stack pointer and `X`.
- **Tip:** combine zeropage tables with `(zp),Y` to walk arrays quickly.

### Arithmetic & Logic

- `CLC/SEC` prepare carry for `ADC`/`SBC` (add/subtract with carry/borrow).
- `ADC` and `SBC` work on unsigned and signed data; they update `N`, `Z`, `C`, `V`.
- `INC/DEC` modify memory, `INX/INY/DEX/DEY` modify index registers.
- `AND/ORA/EOR` perform bitwise ops on `A`.
- `BIT` tests bits in memory: sets `Z` from `A & M`, copies operand bits 7→`N`, 6→`V`.
- `CMP/CPX/CPY` subtract without storing: check `C` for ≥, `Z` for equality.
- **Decimal mode:** avoid for C64 games unless deliberately using BCD; clear with `CLD`.

### Shift & Rotate

- `ASL/LSR/ROL/ROR` operate on `A` or memory; shifted-out bit lands in `C`.
- Combine `ASL` + `ADC` for fast 16-bit multiply-by-10 style routines.

### Control Flow

- `JMP` absolute or indirect; `JSR`/`RTS` for subroutines.
- Branches (`Bcc`) test individual flag bits; remember 1 cycle penalty when branch taken, plus one more on page cross.
- `BRK` pushes `PC+2` and `P`; returns via `RTI`.

### Stack & Interrupt Helpers

- `PHA/PLA` push/pull accumulator; `PHP/PLP` push/pull status (`B` bit filled when pushed).
- `RTI` pulls status then `PC`.
- For IRQ/NMI entry, hardware pushes `PC` high, `PC` low, then `P`.

### System Vectors

- `$FFFA/B` NMI, `$FFFC/D` RESET, `$FFFE/F` IRQ/BRK.
- After RESET the CPU reads the vector at `$FFFC` and starts executing there (C64 KERNAL init).

## Performance Notes for Fast Code

- Use zeropage for hot variables, pointers, and loop counters (1 byte shorter, 1 cycle faster).
- Prefer `(zp),Y` for streaming reads/writes; pointer lives in zeropage, `Y` walks structure.
- Unroll critical loops when possible; watch 256-byte page boundaries to control cycle counts.
- Self-modifying code is legal; ensure interrupts disabled or code mirrored in RAM.
- Align sprite tables or sound data on pages to avoid extra cycles on indexed reads.

## Illegal / Undocumented Opcodes (NMOS 6502)

- Many exist (e.g. `LAX`, `SAX`, `RRA`). They can be useful, but rely on NMOS-specific behavior and may break on CMOS 65C02/FPGA cores.
- C64 Ultimate's 6510 clone usually supports common stable combos (`LAX`, `SAX`, `RLA`, `RRA`, `SLO`, `SRE`, `DCP`, `ISC`). Avoid ultra-unstable forms (`ANE`, `LXA`, `SHA`).
- When sharing code, prefer documented opcodes unless cycle critical.

## Building Machine-Code Routines from BASIC

1. Reserve memory (e.g. `POKE 44, (target / 256)` to move BASIC start, or load code into `$C000` RAM).
2. Assemble or hand-code bytes, then `POKE`/`SYS address` to run.
3. Preserve registers if returning to BASIC (push/pull as needed, `RTS` to exit).

## Handy Flag Cheat Sheet

- **Zero (`Z`):** set when result is `0`; use `BEQ/BNE`.
- **Negative (`N`):** mirrors bit 7; `BMI/BPL`.
- **Carry (`C`):** addition carry / subtraction "not borrow"; `BCS/BCC`.
- **Overflow (`V`):** signed overflow; `BVS/BVC`.
- **Interrupt Disable (`I`):** set via `SEI`, cleared with `CLI`.
- **Decimal (`D`):** enable BCD for `ADC/SBC`. Always `CLD` before math unless BCD needed.

## Typical Workflows

- **Fast move loop:**

  ```asm
  ldy #$00

copy: lda source,y
      sta dest,y
      iny
      cpy #$28
      bne copy

  ```
- **IRQ skeleton:**
  ```asm
  irq:  pha
        txa : pha
        tya : pha
        lda #$01    ; your routine
        sta $d020
        pla : tay
        pla : tax
        pla
        rti
  ```

- **Jump table via `(zp),Y`:** store 16-bit pointers in zeropage, `ldy` index*2, load low/high bytes, `sta` jump vector, `jmp (vector)`.

Keep this sheet concise in prompts and pair it with the RAG tool so the MCP can cite the right section when generating 6510 assembly.
