# C64 BASIC Program Layout

This project stores generated BASIC programs in the exact binary format that Commodore machines expect when loading from disk or over the wire. The program is a contiguous block with the following structure:

1. **Load address** (`$0801` for standard BASIC) encoded as a little-endian 16-bit value.
2. **Repeated line records**, each containing:
   - Pointer to the start of the next line (little-endian word).
   - Line number (little-endian word).
   - Tokenised body bytes ending with `0x00`.
3. A final terminating word `0x0000`.

The pointer of each line is the absolute address where the following line begins. The last line points at the terminating `0x0000` marker.

## Tokenisation Rules

The BASIC interpreter stores keywords as single-byte tokens in the range `$80–$CB`. Tokenisation is applied everywhere except within string literals (`"..."`) and remarks introduced by `REM`. Inside these regions characters are kept verbatim.

The converter performs the token lookup using a greedy, case-insensitive match; longer keywords (such as `PRINT#`) must be recognised before shorter ones (`PRINT`). The table below lists the core keywords that are handled:

| Token (hex) | Keyword  | Notes |
| ----------- | -------- | ----- |
| 80 | `END` | |
| 81 | `FOR` | |
| 82 | `NEXT` | |
| 83 | `DATA` | |
| 84 | `INPUT#` | `PRINT#` style device IO token. |
| 85 | `INPUT` | |
| 86 | `DIM` | |
| 87 | `READ` | |
| 88 | `LET` | Optional in modern BASIC but still tokenised. |
| 89 | `GOTO` | |
| 8A | `RUN` | |
| 8B | `IF` | |
| 8C | `RESTORE` | |
| 8D | `GOSUB` | |
| 8E | `RETURN` | |
| 8F | `REM` | All bytes that follow remain untokenised. |
| 90 | `STOP` | |
| 91 | `ON` | |
| 92 | `WAIT` | |
| 93 | `LOAD` | |
| 94 | `SAVE` | |
| 95 | `VERIFY` | |
| 96 | `DEF` | |
| 97 | `POKE` | |
| 98 | `PRINT#` | |
| 99 | `PRINT` | |
| 9A | `CONT` | |
| 9B | `LIST` | |
| 9C | `CLR` | |
| 9D | `CMD` | |
| 9E | `SYS` | |
| 9F | `OPEN` | |
| A0 | `CLOSE` | |
| A1 | `GET` | |
| A2 | `NEW` | |
| A3 | `TAB(` | |
| A4 | `TO` | |
| A5 | `FN` | |
| A6 | `SPC(` | |
| A7 | `THEN` | |
| A8 | `NOT` | |
| A9 | `STEP` | |
| AA | `+` | Arithmetic operators and comparisons are also tokenised. |
| AB | `-` | |
| AC | `*` | |
| AD | `/` | |
| AE | `^` | |
| AF | `AND` | |
| B0 | `OR` | |
| B1 | `>` | |
| B2 | `=` | |
| B3 | `<` | |
| B4 | `SGN` | |
| B5 | `INT` | |
| B6 | `ABS` | |
| B7 | `USR` | |
| B8 | `FRE` | |
| B9 | `POS` | |
| BA | `SQR` | |
| BB | `RND` | |
| BC | `LOG` | |
| BD | `EXP` | |
| BE | `COS` | |
| BF | `SIN` | |
| C0 | `TAN` | |
| C1 | `ATN` | |
| C2 | `PEEK` | |
| C3 | `LEN` | |
| C4 | `STR$` | |
| C5 | `VAL` | |
| C6 | `ASC` | |
| C7 | `CHR$` | |
| C8 | `LEFT$` | |
| C9 | `RIGHT$` | |
| CA | `MID$` | |
| CB | `GO` | Used in the `GO TO` and `GO SUB` idioms. |

Arithmetic symbols and comparison operators are tokenised to match the byte sequence produced by the original interpreter.

## Character Encoding

The converter writes characters as PETSCII bytes. For keywords and identifiers the text is uppercased before encoding, mirroring the behaviour of the built-in BASIC editor. Inside strings and remarks, bytes are preserved exactly as provided by the source.

If a program line contains no characters after tokenisation (for example a line consisting solely of a line number), a single space (`0x20`) is inserted to avoid zero-length line bodies, which would be rejected by the ROM.

## Validation Considerations

- Line numbers must be strictly within the 0–65535 range.
- Pointers must advance monotonically; the encoder calculates this automatically.
- Every program ends with the sentinel word `0x0000`, allowing the interpreter to detect end-of-program when reading from memory.

These rules ensure that the generated PRG files can be loaded directly into Commodore BASIC without further adjustments.
