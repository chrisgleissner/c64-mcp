## Commodore MPS – Bitmap Images and Custom Characters

Default when printer is unspecified. Uses PETSCII and MPS emulation.

### Bit Image Mode (BIM)

- **Enter BIM**: `CHR$(8)` (BIT IMG)
- **Repeat next byte n times**: `CHR$(8);CHR$(26);CHR$(n)` (BIM IMG SUB n)
- **Data format**: 7 rows per column. One byte per column; LSB is top; MSB (bit7) is not printed and must be set to 1. Horizontal 60 dpi; vertical 72 dpi. Max width: 480 dots per line.
- **Interline**: Automatically 7-dot height in BIM.
- **Exiting BIM**: BIM continues until a printable character is sent; control codes with bit7 clear (e.g., CR/LF) are executed without exiting. Use `CHR$(15)` (EN OFF) to leave BIM.

Example (16 columns × 3 rows):

```basic
10 OPEN1,4,7
20 A$=""
30 FOR I=1 TO 16:READ A:A$=A$+CHR$(A):NEXT
40 FOR J=1 TO 3
50 PRINT#1,CHR$(8);A$
60 NEXT J
70 CLOSE1
80 END
90 DATA 136,148,162,193,162,148,136,136
100 DATA 156,186,255,186,156,136,235,136
```

Efficient repeats with SUB:

```basic
10 OPEN1,4,7
20 A$="":FOR I=1 TO 16:READ A:A$=A$+CHR$(A):NEXT
30 FOR J=1 TO 3
40 PRINT#1,CHR$(8);CHR$(26);CHR$(100);A$
50 NEXT J
60 CLOSE1
70 END
80 DATA 136,148,162,193,162,148,136,136
90 DATA 156,186,255,186,156,136,235,136
```

### Custom characters (DLL)

- `ESC '=' m n c s a p1..p11 ...` Down Line Loading
  - Total bytes `t = (numChars × 13) + 2`; compute `n = INT(t / 256)`, `m = t - n*256`
  - `c`: ASCII code (33..126) of first char in sequence; `s`: constant 32 (20h); `a`: needle selection (0=upper 8, 1=lower 8)
  - `p1..p11`: 11 columns (8×11 matrix) for each char; adjacent columns cannot both have active dots on real hardware (head recycle). Ultimate‑II emulator does not enforce this.
- Note: On Ultimate‑II MPS Printer Emulation, DLL is recognized but ignored (data skipped). On real MPS‑1230 enable DLL in printer config; RAM is limited.

### Best practices

- Precompute BIM rows and ensure bit7 set (add 128 to each byte).
- Use `CHR$(15)` to terminate BIM explicitly before text.
- Use secondary address `7` for lower/upper PETSCII if needed.
