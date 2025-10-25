# Printing with Commodore MPS and Epson FX (C64) — Single Source of Truth

**Scope:** C64 → Printer via serial device **4**. Two protocols:

- **Commodore MPS** (PETSCII + MPS-801 protocol; all later MPS follow this)
- **Epson FX (ESC/P)** (ASCII + ESC sequences; widely compatible)

**Defaults & Routing:** If user/printer is unspecified → **Commodore MPS**. See `printer-prompts.md` for routing logic and prompt templates.

## Quick Start (Text)

```basic
10 OPEN1,4,0 : REM Commodore MPS, PETSCII upper/graphics (sa=0) 
20 PRINT#1,"HELLO" : PRINT#1,CHR$(13);CHR$(10) : PRINT#1,CHR$(12) : CLOSE1
```

```basic
10 OPEN1,4     : REM Epson FX (ESC/P), ASCII
20 PRINT#1,CHR$(27);"E";"BOLD ON";CHR$(27);"F" : PRINT#1,CHR$(12) : CLOSE1
```

## Printer Command Cheat Sheet — Commodore vs Epson

| Operation | Commodore MPS (PETSCII) | Epson FX (ESC/P ASCII) |
|:--|:--|:--|
| **Reset / Init** | — | `ESC @` |
| **Carriage Return** | `CHR$(13)` | `CHR$(13)` |
| **Line Feed** | `CHR$(10)` | `CHR$(10)` |
| **Form Feed / Page Eject** | `CHR$(12)` | `CHR$(12)` |
| **Horizontal Tab** | `CHR$(9)` | `CHR$(9)` |
| **Standard Width** | `CHR$(15)` | `DC4` (`CHR$(20)`) or `ESC W 0` |
| **Double Width** | `CHR$(14)` | `SO` (`CHR$(14)`) or `ESC W 1` |
| **Condensed / Elite (12 cpi)** | — | `ESC M` |
| **Pica (10 cpi)** | — | `ESC P` |
| **Bold ON / OFF** | — | `ESC E` / `ESC F` |
| **Italic ON / OFF** | — | `ESC 4` / `ESC 5` |
| **Underline ON / OFF** | — | `ESC - 1` / `ESC - 0` |
| **Reverse Video ON / OFF** | `CHR$(18)` / `CHR$(146)` | — |
| **Set Line Spacing (n × 1/72")** | — | `ESC A n` |
| **Set Left Margin** | — | `ESC l n` |
| **Set Right Margin** | — | `ESC Q n` |
| **Horizontal Position by Columns** | `CHR$(16);CHR$(n)` | `ESC $ nL nH` |
| **Horizontal Position by Dots** | `ESC(27);CHR$(16);HP;LP` | `ESC $ nL nH` |
| **Enter Bit Image Mode** | `CHR$(8)` | `ESC K/L/Y/Z/*/^ n m ...` |
| **Repeat Next Data Byte (MPS only)** | `CHR$(26);CHR$(count);CHR$(byte)` | — |
| **Exit Bit Image Mode** | `CHR$(15)` | Send any non-graphic char or `LF` |
| **Graphics Data Format** | 7 dots/byte, **bit7 = 1** | 8 dots/byte (MSB = top) |
| **Vertical Line Spacing (8-dot rows)** | CR + LF | `ESC A 8` |
| **Switch Charset (upper/lower)** | Secondary Address 0 or 7 | `ESC t n` (if supported) |
| **Reset / End Job** | `CLOSE ch` | `ESC @` + `FF` + `CLOSE ch` |

---

**Notes**

- Always `OPEN ch,4[,sa]` → `PRINT#` → `CLOSE ch`.  
- Add `CHR$(12)` (Form Feed) before closing to eject the page.  
- For MPS bitmap output, remember to add **128** to each byte so bit7 = 1.  
- For Epson, compute `(n + 256*m)` data length for each graphics line.  
- Both support re-use of `$033C–$03FB` (Cassette Buffer) for bitmap staging in memory.

**Cross-refs:**  
[`printer-commodore.md`](printer-commodore.md) · [`printer-commodore-bitmap.md`](printer-commodore-bitmap.md) · [`printer-epson.md`](printer-epson.md) · [`printer-epson-bitmap.md`](printer-epson-bitmap.md) · [`printer-prompts.md`](printer-prompts.md)

## Protocol Differences (critical)

- **Character set:** MPS expects **PETSCII**; Epson expects **ASCII** with ESC/P control sequences.
- **Mode switching:** MPS uses single-byte PETSCII controls; Epson uses `ESC` (27) + command bytes.
- **Graphics:** MPS **Bit Image Mode** (`CHR$(8)`) uses **7‑dot columns** (bit7 set=1); Epson uses `ESC K/L/Y/Z/*/^` with **8‑dot columns** and byte counts `(n,m)`.
- **Line endings:** Send `CR` (13) and often `LF` (10). Use `FF` (12) for page eject on both.

## Commodore MPS Essentials (text)

- **Open:** `OPEN ch,4[,sa]` with `sa=0` (upper/graphics, default) or `sa=7` (lower/upper).
- **Print:** `PRINT#ch, ...`; **leave channel open** for multiple lines or `CMD ch` to route `PRINT`/`LIST` to printer.
- **Close:** `CLOSE ch` (required to free channel).
- **Common controls:** double width `CHR$(14)` / standard `CHR$(15)`, reverse on/off `CHR$(18)`/`CHR$(146)`, position by chars `CHR$(16);CHR$(n)` or by dots `ESC(27),CHR$(16),HP,LP`.
- **Bit Image:** enter `CHR$(8)`; **repeat** with `CHR$(26);count;byte`; **exit** with `CHR$(15)` or any printable char.

## Epson FX Essentials (ESC/P text)

- **Pitch:** `ESC M` (12 cpi), `ESC P` (10 cpi). **Bold:** `ESC E`/`ESC F`. **Italic:** `ESC 4`/`ESC 5`. **Underline:** `ESC - n` (1 on, 0 off).
- **Quality:** `ESC x n` (1=NLQ, 0=Draft). **Width:** `SO` (14) on / `DC4` (20) off or `ESC W n`.
- **Spacing:** `ESC 0/1/2/3 n` or `ESC A n` (n/72"). **Reset:** `ESC @`.

## Graphics Summary

- **MPS Bit Image:** 7 dots/column; **add 128** to each data byte (keep bit7=1); horizontal ≈60 dpi; vertical 72 dpi. Max ~480 dots/line. Use `CHR$(15)` to exit.
- **Epson Bitmap:** 8 dots/column; densities per command (`K/L/Y/Z/*/^`). Byte count = `len = n + 256*m`. Set line spacing (`ESC A 8`) for 8‑dot rows.

## Emulation Notes

- **C64 Ultimate MPS Emulation:** The C64 Ultimate has a printer emulation built in. It ignores some advanced MPS DLL features; ESC/P `ESC Y` may behave as `ESC L`. Prefer `FF` for eject; some paper-sensor commands are no‑ops.

**Cross‑refs:** `printer-commodore.md`, `printer-commodore-bitmap.md`, `printer-epson.md`, `printer-epson-bitmap.md`, and `printer-prompts.md` (routing & prompt patterns).
