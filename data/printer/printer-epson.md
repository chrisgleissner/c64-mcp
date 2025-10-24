## Epson FX-80 Printing (Text, ESC/P)

Applies to Epson FX-80 compatible ESC/P printers. Use ASCII plus ESC sequences.

### Quick start (C64 BASIC)

```basic
10 OPEN1,4
20 PRINT#1,CHR$(27);"x";CHR$(1) : REM NLQ
30 PRINT#1,CHR$(27);"M"        : REM 12 cpi
40 PRINT#1,"Hello, Epson!"
50 PRINT#1,CHR$(12)            : REM Form feed
60 CLOSE1
```

### Common text controls

- **Double width**: `SO=CHR$(14)` ON, `DC4=CHR$(20)` OFF, or `ESC W n`
- **Condensed**: `SI=CHR$(15)` ON, `DC2=CHR$(18)` OFF
- **Pitch**: `ESC M` (12 cpi), `ESC P` (10 cpi)
- **Bold**: `ESC E` ON, `ESC F` OFF
- **Italic**: `ESC 4` ON, `ESC 5` OFF
- **Underline**: `ESC - n` (1 ON, 0 OFF)
- **Quality**: `ESC x n` (1 NLQ, 0 Draft)
- **Line spacing**: `ESC 0/1/2/3 n`, `ESC A n`
- **Tabs/margins**: `ESC D/B/l/Q`
- **Reset**: `ESC @`

Notes: Commands marked `*` in FX-80 docs are ignored by Ultimate‑II MPS Printer Emulation.

See also: `printer-epson-bitmap.md` for bitmap graphics.
