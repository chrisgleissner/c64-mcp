# Commodore Disk Drive Specification — 1541, 1571, 1581

**Scope:** Commodore floppy drives used with the C64/C128 via the IEC serial bus.  
Each drive contains an internal 6502 CPU and DOS ROM implementing a self‑contained filesystem.  
Main reference drive: **1541 (DOS 2.6)**; extensions for **1571 (DOS 3.0)** and **1581 (DOS 10.0)** below.

---

## Drive Comparison Summary

| Drive | DOS | Sides | Tracks | Sectors/Track | Capacity (bytes) | Notes |
|:--|:--|:--|:--|:--|:--|:--|
| **1541** | 2.6 | 1 | 35 | 17–21 | 174 848 (664 free blocks) | Standard C64 drive |
| **1571** | 3.0 | 2 | 70 | 17–21 per side | 349 696 | Burst mode, dual BAM |
| **1581** | 10.0 | 2 (3½″) | 80 | 40 @ 512 B | 316 416 (316 KB free) | Subdirs, partitions |

## 1541 — Disk Format and DOS 2.6

Unless specified otherwise, we assume that we use a 1541 drive with DOS 2.6.

**Medium:** 5¼″ single‑sided DD, 35 tracks (17–21 sectors per track).  
**Capacity:** 174 848 B (683 × 256 B); 664 free (169 984 B).  
**Directory:** Track 18 Sectors 1–17; BAM = Track 18 Sector 0.  
**Max files:** 144 (no subdirs). **DOS:** v2.6.

### File Types

| Type | Description | Max Size | Notes |
|:--|:--|:--|:--|
| **PRG** | Program (LOAD/SAVE) | ~202 blocks | Loadable code |
| **SEQ** | Sequential file | 168 656 B | Text/data |
| **USR** | User file | ≈SEQ | App‑defined |
| **REL** | Relative file | 167 132 B / 65 535 records | Random access |
| **DEL** | Deleted entry | — | Hidden or invalid |

Flags: `<` = locked (read‑only); `*` = not closed (use VALIDATE).

### Track Layout (256‑B sectors)

| Tracks | Sectors/Track | Total Sectors |
|:--|:--|:--|
| 1–17 | 21 | 357 |
| 18 | 19 (Dir/BAM) | 19 |
| 19–24 | 18 | 108 |
| 25–35 | 17 | 187 |
| **Total** |  | **683** |

Tracks 40–41 exist physically but unused by DOS 2.6.

### BAM (Track 18 Sector 0)

| Bytes | Purpose |
|:--|:--|
| 0–1 | DOS version ("A0") |
| 2–3 | First dir T/S (18/1) |
| 4–143 | 4 bytes per track (free bitmap + count) |
| 144–159 | Disk name (16 B PETSCII) |
| 162–163 | ID (2 B) + type "2A" |

### Directory Entries (32 B each)

| Offset | Field | Size | Notes |
|:--|:--|:--|:--|
| 0 | Type/status byte | 1 | bit 7=used, bits 0‑3=file type |
| 1–2 | Start T/S | 2 | first block |
| 3–18 | File name | 16 | PETSCII A0‑padded |
| 30–31 | Blocks used | 2 | file size in blocks |

### DOS 2.6 Commands (via channel 15)

| Action | Command | Example |
|:--|:--|:--|
| Format disk | `N0:name,ID` | `OPEN15,8,15,"N0:DISK,01"` |
| Validate | `V0` | `PRINT#15,"V0"` |
| Initialize | `I0` | `PRINT#15,"I0"` |
| Reset | `UI0` | `PRINT#15,"UI0"` |
| Copy file | `C0:new=old` | `PRINT#15,"C0:NEW=OLD"` |
| Rename | `R0:new=old` | `PRINT#15,"R0:NEW=OLD"` |
| Delete | `S0:mask` | `PRINT#15,"S0:*"` |
| Concatenate | `C0:new=a,b` | `PRINT#15,"C0:MERGE=A,B"` |
| Replace (file overwrite) | `@0:name` | `SAVE"@0:FILE",8` ⚠ bug on 1541‑I |
| Memory write | `M-W addrL addrH size data` | Direct RAM write |
| Position (REL) | `P ch recL recH pos` | Record seek |

### BASIC Usage

```basic
OPEN1,8,15,"N0:DISK,ID":CLOSE1
OPEN2,8,2,"0:HELLO,SEQ,W":PRINT#2,"HELLO WORLD":CLOSE2
LOAD"$",8:LIST
```

**Speed:** ~300 B/s (native), ~10 KB/s (fast‑loader).  
**CPU:** 6502 @ 1 MHz · RAM 2 KB · ROM 16 KB.  
**Device IDs:** 8–11 (via DIP or software).

---

## 1571 — Double‑Sided Drive (DOS 3.0)

**Medium:** 5¼″ double‑sided DD, 70 tracks (35 × 2).  
**Capacity:** ~349 KB (1368 blocks). **DOS:** 3.0.  
Reads/writes 1541 disks (side A only); auto‑flips heads; supports burst mode with C128.

### Key Differences

- Dual BAMs (one per side, merged view).  
- Identical file types and commands to 1541.  
- Burst protocol ≈ 2× speed vs 1541.  
- Optional MFM mode for CP/M.  

**Geometry:** Same sector zones per side as 1541.  

---

## 1581 — 3½″ Drive (DOS 10.0)

**Medium:** 3½″ DS/DD, 80 tracks, 40 sectors/track (512 B).  
**Capacity:** 316 416 B (316 logical blocks × 256 B).  
Supports subdirectories and partitions. Compatible with C64 and C128 via IEC. I/O ≈ 4× 1541 speed.

### Command Summary

| Action | Command | Example |
|:--|:--|:--|
| Format disk | `N0:NAME,ID` | `OPEN15,8,15,"N0:WORK,01"` |
| Create directory | `MD:NAME` | `PRINT#15,"MD:DATA"` |
| Change directory | `CD:NAME` | `PRINT#15,"CD:DATA"` |
| Delete file/dir | `S0:NAME` | `PRINT#15,"S0:OLD"` |
| Validate | `V0` | `PRINT#15,"V0"` |

### Notes

- MS‑DOS‑like directory tree and BAM per partition.  
- Geometry: 80 × 40 × 512 B = 1.6 MB raw (≈800 KB used).  
- DOS 10 implements subdir navigation and hierarchical file lookup.

---

**Cross‑Refs:** [`io/cia-spec.md`](../io/cia-spec.md) · [`printer/printer-spec.md`](../printer/printer-spec.md)
