# Commodore MPS Printing (Text) — PETSCII + MPS Protocol

**Device:** `4`  | **Secondary address (sa):** `0`=upper/graphics (default), `7`=lower/upper.  
**Open/Print/Close:** `OPEN ch,4[,sa]` → `PRINT#ch, ...` → `CLOSE ch` (or `CMD ch` to route `PRINT`/`LIST`).

## Controls (concise)

| Feature | Code (send via `PRINT#`) | Notes |
|:--|:--|:--|
| Standard width | `CHR$(15)` | Also exits Bit Image Mode |
| Double width | `CHR$(14)` | Affects subsequent text |
| Reverse video ON/OFF | `CHR$(18)` / `CHR$(146)` | Invert foreground/background |
| Cursor mode local (graphic/business) | `CHR$(145)` / `CHR$(17)` | Temporary charset toggles until CR |
| Carriage return / line feed / form feed | `CHR$(13)` / `CHR$(10)` / `CHR$(12)` | Use CR+LF if overprinting occurs |
| Horizontal tab | `CHR$(9)` | Tab stops |
| Position by columns | `CHR$(16);CHR$(n)` | `n` = column (0–79 standard) |
| Position by dots | `CHR$(27);CHR$(16);HP;LP` | Dot address = `(HP<<8)|LP` (0–479) |
| Bit Image Mode (enter/exit) | `CHR$(8)` / `CHR$(15)` | See bitmap doc for data rules |

### Quick examples

```basic
10 OPEN1,4,7
20 PRINT#1,CHR$(27);"-";CHR$(1);"UNDERLINED";CHR$(27);"-";CHR$(0)
30 PRINT#1,CHR$(16);CHR$(20);"COL 20",CHR$(13);CHR$(10);CHR$(12):CLOSE1
```

**See also:** `printer-commodore-bitmap.md` for images and repetition (`CHR$(26)`), and `printer-spec.md` for routing & differences.
