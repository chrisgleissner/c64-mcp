## Commodore MPS Printing (Text)

Applies to Commodore MPS emulation (PETSCII). If the user doesn’t specify a printer, assume Commodore.

### Quick start (C64 BASIC)
```basic
10 OPEN1,4            : REM PETSCII upper/graphics (default)
20 PRINT#1,"HELLO WORLD!"
30 CLOSE1
```
Lower/upper PETSCII:
```basic
10 OPEN1,4,7
20 PRINT#1,"Hello, lower/upper!"
30 CLOSE1
```

### Common text controls
- **Double width**: `CHR$(14)` ON, `CHR$(15)` OFF (also exits Bit Image)
- **Bold**: `CHR$(27);"e"` ON, `CHR$(27);"f"` OFF
- **Double strike**: `CHR$(27);CHR$(71)` ON, `CHR$(27);CHR$(72)` OFF
- **Italic**: `CHR$(27);"4"` ON, `CHR$(27);"5"` OFF
- **Underline**: `CHR$(27);"-";CHR$(1|0)`
- **Quality**: `CHR$(27);"x";CHR$(1|0)` or `CHR$(31)`/`CHR$(159)`
- **Position**: by chars `CHR$(16);CHR$(n)`; by dots `CHR$(27);CHR$(16);CHR$(n)`
- **Paper**: `LF=CHR$(10)`, `CR=CHR$(13)`, `FF=CHR$(12)`, `CS=CHR$(141)`

### Tips
- PETSCII vs ASCII: MPS uses PETSCII. Avoid screen codes when targeting Epson.
- CR/LF: If lines overprint, add `LF` after `CR`.
- Secondary address: `OPEN1,4,0` (upper/graphics) or `OPEN1,4,7` (lower/upper). Default `0`.

See also: `printing-commodore-bitmap.md` for images and DLL custom characters.
