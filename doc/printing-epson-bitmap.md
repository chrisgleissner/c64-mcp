## Epson FX-80 – Bitmap Graphics (ESC/P)

Use ASCII + ESC/P. Bitmap columns are bytes with MSB at top; 8 rows per column. Horizontal density per mode; vertical 72 dpi. Set line spacing to match rows.

### Modes
- `ESC K n m d...` – Normal density (60 dpi)
- `ESC L n m d...` – Double density, half speed (120 dpi)
- `ESC Y n m d...` – Double density, normal speed (maps to L in Ultimate‑II)
- `ESC Z n m d...` – Quadruple density, half speed (240 dpi)
- `ESC * d n m d...` – Explicit density
  - `d` densities: 0=60, 1=120, 2=120 (hi-speed), 3=240, 4=80, 5=72, 6=90 dpi
- `ESC ? c d` – Change default density for command `c` in {"K","L","Y","Z"}
- `ESC ^ d n m h1 l1 h2 l2 ...` – 9-pin strips (d in {0,1})

`n` and `m` encode total data length: `len = n + 256*m`.

Set line spacing for 8-dot rows:
- `ESC A 8` (8/72") or `ESC 2` (1/6") depending on layout.

### Example (16 columns × 3 rows at 60 dpi)
```basic
10 OPEN1,4
20 A$=CHR$(27)+CHR$(75)+CHR$(16)+CHR$(0)
30 FOR I=1 TO 16:READ A:A$=A$+CHR$(A):NEXT
40 PRINT#1,CHR$(27);CHR$(65);CHR$(8);CHR$(10);CHR$(13)
50 FOR J=1 TO 3
60 PRINT#1,A$;A$;A$;A$;CHR$(10);CHR$(13)
70 NEXT J
80 CLOSE1
90 END
100 DATA 60,66,129,129,129,66,60,24
110 DATA 60,126,255,126,60,24,235,24
```

### Tips
- Ensure `n,m` match data length exactly or the printer will desync.
- Use `ESC @` to reset between jobs when experimenting.
- In Ultimate‑II emulation, `ESC Y` behaves like `ESC L`.
