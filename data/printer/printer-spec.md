## Printing with Commodore MPS and Epson FX (C64)

A compact, practical guide for printing from a Commodore 64 to classic MPS-series (PETSCII) and Epson FX-80 (ESC/P) compatible printers, including Ultimate-II MPS Printer Emulation notes.

### Quick start (C64 BASIC)

- **Open printer**: device `4`; optional secondary address selects PETSCII charset in MPS mode
  - `0` = upper/graphics; `7` = lower/upper

```basic
10 OPEN1,4              : REM MPS: PETSCII upper/graphics
20 PRINT#1,"HELLO WORLD!"
30 CLOSE1
```

```basic
10 OPEN1,4,7            : REM MPS: PETSCII lower/upper
20 PRINT#1,CHR$(14);"DOUBLE WIDTH";CHR$(15)
30 CLOSE1
```

- **Line ends**: Send `CR` (13) to return carriage; `LF` (10) advances one line; `FF` (12) ejects page.

### Character sets and protocols

- **MPS emulation (Commodore)**
  - Data and control use PETSCII. Text from C64 `PRINT#` goes through unchanged.
  - Secondary address on `OPEN` chooses PETSCII variant (0 or 7). You can also toggle via control codes (`CRSR UP`/`CRSR DWN`).
- **Epson FX-80 emulation (ESC/P)**
  - Control uses ESC/P sequences (ASCII). Text should be printable ASCII. Send ESC as `CHR$(27)` followed by command bytes.
  - Entries marked `*` in FX-80 tables are ignored by Ultimate‑II MPS Printer Emulation.

### Essential controls (MPS emulation)

- **Double width**: `CHR$(14)` ON, `CHR$(15)` OFF (also exits Bit Image mode)
- **Reverse video**: `CHR$(18)` ON, `CHR$(146)` OFF
- **Double strike**: `CHR$(27);CHR$(71)` ON, `CHR$(27);CHR$(72)` OFF
- **Bold**: `CHR$(27);CHR$(101)` ON, `CHR$(27);CHR$(102)` OFF
- **Italic**: `CHR$(27);CHR$(52)` ON, `CHR$(27);CHR$(53)` OFF
- **Underline**: `CHR$(27);"-";CHR$(1)` ON, `CHR$(27);"-";CHR$(0)` OFF
- **NLQ/Draft**: `CHR$(31)` ON, `CHR$(159)` OFF; or `CHR$(27);"X";CHR$(1|0)`
- **Horizontal tab**: `CHR$(9)`
- **Positioning**:
  - By character columns: `CHR$(16);CHR$(n)`
  - By dot columns: `CHR$(27);CHR$(16);CHR$(n)`
- **Paper control**: `LF=10`, `CR=13`, `CS=141` (CR without LF), `FF=12`, set paper height: `CHR$(27);"c";CHR$(lines)` or inches via `CHR$(27);"c";CHR$(0)` then inches

Example (MPS):

```basic
10 OPEN1,4,7
20 PRINT#1,CHR$(27);CHR$(71);"DOUBLE STRIKE";CHR$(13)
30 PRINT#1,CHR$(27);"-";CHR$(1);"UNDERLINED";CHR$(27);"-";CHR$(0)
40 PRINT#1,CHR$(16);CHR$(20);"COL 20"
50 PRINT#1,CHR$(12)
60 CLOSE1
```

### Essential controls (Epson FX-80, ESC/P)

- **Double width**: `SO=14` ON (`CHR$(14)`), `DC4=20` OFF (`CHR$(20)`), or `ESC W n` (n=1 on, 0 off)
- **Condensed**: `SI=15` ON (`CHR$(15)`), `DC2=18` OFF
- **Pitch**: `ESC M` (12 cpi ON), `ESC P` (12 cpi OFF)
- **Bold**: `ESC E` ON, `ESC F` OFF
- **Italic**: `ESC 4` ON, `ESC 5` OFF
- **Underline**: `ESC - n` (1 ON, 0 OFF)
- **Quality**: `ESC x n` (1 NLQ, 0 Draft)
- **Line spacing**: `ESC 0` (1/8"), `ESC 1` (7/72"), `ESC 2` (1/6"), `ESC 3 n` (n/216"), `ESC A n` (n/72")
- **Tabs/margins**: `ESC D` (HT stops), `ESC B` (VT stops), `ESC l` (left), `ESC Q` (right)
- **Paper motion**: `LF=10`, `CR=13`, `FF=12`, `ESC J n` (skip n/216"), `ESC j n` (reverse n/216")
- **Reset**: `ESC @`
- **Graphics**: `ESC K/L/Y/Z/^` select densities; `ESC ?` changes density selected by graphics commands
- `*` **Ignored in U‑II Emulation**: Commands marked with `*` in FX-80 tables (e.g., `DC1`, `DC3`, some MSB/char-gen controls, paper sensors, etc.)

Example (Epson FX):

```basic
10 OPEN1,4
20 PRINT#1,CHR$(27);"x";CHR$(1);        : REM NLQ
30 PRINT#1,CHR$(27);"M";                 : REM 12 cpi
40 PRINT#1,CHR$(27);"-";CHR$(1);"UNDER";CHR$(27);"-";CHR$(0)
50 PRINT#1,CHR$(14);"WIDE";CHR$(20)
60 PRINT#1,CHR$(12)
70 CLOSE1
```

### Practical notes

- **PETSCII vs ASCII**: MPS expects PETSCII; FX expects ASCII ESC/P. When targeting FX, avoid C64 screen codes; send control bytes explicitly via `CHR$`.
- **CR vs LF**: Some content requires both `CR` and `LF`. If lines overprint, add `LF` after `CR`.
- **Secondary address (MPS only)**: `OPEN1,4,0` (upper/graphics), `OPEN1,4,7` (lower/upper). Defaults to `0` if omitted.
- **Bottom-of-page & sensors**: `ESC n/o/8/9` are often ignored in U‑II emulation; prefer explicit `FF`.
- **Bit Image**: MPS has a Bit Image mode and exit via `CHR$(15)`; FX uses `ESC K/L/Y/Z/^` with data byte counts; structure your data exactly as per mode.

### Troubleshooting

- **Wrong glyphs**: Check charset mode (MPS `0` vs `7`; FX national set via `ESC R`).
- **No underline/bold**: Ensure you send the correct on/off pair and stay out of NLQ/Draft constraints.
- **Stuck in a mode**: Send the OFF counterpart (e.g., `CHR$(15)` for double width image exit, `ESC @` to reset FX).

### References

- Commodore MPS emulation command set and examples (PETSCII)
- Epson FX-80 ESC/P control set (entries with `*` are ignored by Ultimate‑II MPS Printer Emulation)
