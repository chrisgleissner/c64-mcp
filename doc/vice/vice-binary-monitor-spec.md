# VICE Binary Monitor Protocol Specification

This document combines the [official documentation](https://vice-emu.sourceforge.io/vice_13.html) with research of the [source code]([https://github.com/libretro/vice-libretro/blob/master/vice/src/monitor/monitor_binary.c](https://raw.githubusercontent.com/libretro/vice-libretro/refs/heads/master/vice/src/monitor/monitor_binary.c)) for VICE 3.9 (Git ID 
`a072441`).

## 1. Overview

The Vice Binary Monitor exposes the built-in VICE monitor over a dedicated network socket (enable with `-binarymonitor`, configure the bind address with `-binarymonitoraddress` or the `BinaryMonitorServerAddress` resource). 

Only one client may be connected at a time. When packets arrive the monitor traps execution (`monitor_startup_trap`), executes the requested operation, and resumes the emulated machine. The default bind target is `ip4://127.0.0.1:6502`.

All multi-byte scalar fields are encoded little endian on the wire. The monitor forwards most operations to the same helper routines used by the text monitor, so side effects, breakpoint semantics, and register layouts are identical to the CLI monitor.

---

## 2. Transport Format

### 2.1 Command Packet

| Offset | Size | Field | Description |
|---------|------|--------|-------------|
| 0 | 1 | `0x02` | Start-of-text (STX) |
| 1 | 1 | API version | Client API version (`0x01` or `0x02`) |
| 2–5 | 4 | Body length | Byte count of the command body |
| 6–9 | 4 | Request ID | Caller-specified identifier echoed in responses |
| 10 | 1 | Command ID | See §5 |
| 11+ | N | Command body | Command payload |

The current implementation accepts headers tagged with API version `0x01` or `0x02`. Commands introduced in API 0x02 (`Keyboard Feed`, `Display Get`) require clients to transmit `0x02`; otherwise the monitor returns error `0x82`.

### 2.2 Response Packet

| Offset | Size | Field | Description |
|---------|------|--------|-------------|
| 0 | 1 | `0x02` | Start-of-text (STX) |
| 1 | 1 | API version | Always `MON_BINARY_API_VERSION` (0x02) |
| 2–5 | 4 | Body length | Byte count of the response body |
| 6 | 1 | Response type | Usually the command ID |
| 7 | 1 | Error code | See §2.3 |
| 8–11 | 4 | Request ID | Mirrors the request; 0xffffffff for events |
| 12+ | N | Response body | Response payload (may be empty) |

### 2.3 Error Codes

| Code | Meaning |
|------|---------|
| 0x00 | Success |
| 0x01 | Object missing (e.g. unknown breakpoint or joystick port) |
| 0x02 | Invalid memspace |
| 0x80 | Command length mismatch |
| 0x81 | Invalid parameter |
| 0x82 | Unsupported API version |
| 0x83 | Unknown command |
| 0x8F | Command failed |

---

## 3. Addressing and Metadata

| Value | Memspace |
|-------|----------|
| 0 | `e_comp_space` (main computer CPU) |
| 1 | `e_disk8_space` |
| 2 | `e_disk9_space` |
| 3 | `e_disk10_space` |
| 4 | `e_disk11_space` |
| other | invalid (`memspace_to_uint8_t` exports 0xff) |

Banks are 16-bit values. Use `0x82 Banks Available` to enumerate valid bank numbers for the main computer CPU; on memspaces without banks the monitor ignores the supplied bank value.

Register lists omit entries flagged with `MON_REGISTER_IS_FLAGS`. Register values are truncated to 16 bits in the binary protocol even if the underlying register is wider; the `size` metadata tells the real width in bits.

---

## 4. Asynchronous Messages

Responses sent with request ID `0xffffffff` are unsolicited events:

- Monitor open: emits `0x31 Register Info` (memspace `e_comp_space`) followed by `0x62 Stopped` with the current PC.
- Monitor close: emits `0x63 Resumed` with the current PC.
- Checkpoint hits: `mon_breakpoint.c` emits `0x11 Checkpoint Info` with `hit = 1`.
- CPU JAM: `0x61 Jam` is sent, currently with an empty body (the PC is not transmitted because the handler passes length 0).
- Other responses (e.g. `Checkpoint List`) reuse the same response types but keep the original request ID.

---

## 5. Command Reference

### Memory (0x01–0x02)

#### 0x01 – Memory Get

- Request: `[0] sidefx (0 = peek, 1 = normal read), [1–2] start address, [3–4] end address, [5] memspace, [6–7] bank`
- Response (`0x01`): `[0–1] byte count (uint16), [2+] data block`
- Notes: Addresses are inclusive; the monitor validates memspace and bank (`0x02` or `0x81` on failure). During the transfer `sidefx` temporarily overrides the global `sidefx` flag.

#### 0x02 – Memory Set

- Request: `[0] sidefx (0 = poke, 1 = write with side effects), [1–2] start address, [3–4] end address, [5] memspace, [6–7] bank, [8+] payload`
- Response (`0x02`): empty body
- Notes: Payload length must equal `(end - start + 1)` or the monitor returns `0x80`. Writes loop byte-by-byte through `mon_set_mem_val_ex`, masking the address to 16 bits.

### Checkpoints and Conditions (0x11–0x22)

#### 0x11 – Checkpoint Get

- Request: `[0–3] checkpoint number`
- Response (`0x11`): checkpoint info (see §6)
- Notes: Unknown checkpoints return `0x01`.

#### 0x12 – Checkpoint Set

- Request: `[0–1] start address, [2–3] end address, [4] stop flag, [5] enabled flag, [6] memory-op mask, [7] temporary flag`, optional byte `[8]` selects the memspace
- Response (`0x11`): the newly created checkpoint
- Notes: The memory-op mask uses bits `e_load`=1, `e_store`=2, and `e_exec`=4. If the body is at least 9 bytes the optional memspace overrides the default `e_comp_space`. The monitor disables the checkpoint if the enabled flag is zero.

#### 0x13 – Checkpoint Delete

- Request: `[0–3] checkpoint number`
- Response (`0x13`): empty
- Notes: Fails with `0x01` if the checkpoint does not exist.

#### 0x14 – Checkpoint List

- Request: empty body
- Response: one or more `0x11` messages (same request ID) for each checkpoint, followed by a `0x14` containing `[0–3] total checkpoint count`
- Notes: The per-checkpoint responses set `hit = 0`.

#### 0x15 – Checkpoint Toggle

- Request: `[0–3] checkpoint number, [4] enable flag`
- Response (`0x15`): empty
- Notes: Returns `0x01` when the checkpoint is missing.

#### 0x22 – Condition Set

- Request: `[0–3] checkpoint number, [4] expression length, [5+] expression text`
- Response (`0x22`): empty
- Notes: The monitor appends a NUL byte after the provided text and executes `cond <id> if (<expr>)`. Expression syntax matches the CLI monitor. Failure to parse or execute yields `0x8F`.

### Register Access (0x31–0x32)

#### 0x31 – Registers Get

- Request: `[0] memspace`
- Response (`0x31`): `[0–1] register count`, followed by entries `[size,id,value_lo,value_hi]`
- Notes: Only registers without `MON_REGISTER_IS_FLAGS` are returned. `size` is always 3 and values carry the low 16 bits of the hardware register.

#### 0x32 – Registers Set

- Request: `[0] memspace, [1–2] count, [3+] entries` where each entry begins `[size,id,value_lo,value_hi,…]`
- Response (`0x31`): refreshed register list for the same memspace
- Notes: The monitor validates each register with `mon_register_valid`. Only the first two value bytes are used; extra bytes (if any) are skipped.

### Snapshots (0x41–0x42)

#### 0x41 – Dump Snapshot

- Request: `[0] save ROMs flag, [1] save disks flag, [2] file name length, [3+] path`
- Response (`0x41`): empty
- Notes: The monitor inserts a trailing NUL before calling `mon_write_snapshot`. Failure yields `0x8F`.

#### 0x42 – Undump Snapshot

- Request: `[0] file name length, [1+] path`
- Response (`0x42`): `[0–1] current PC`
- Notes: On success the monitor reloads the snapshot via `mon_read_snapshot`, updates the dot address, and reports the new program counter.

### Resources (0x51–0x52)

#### 0x51 – Resource Get

- Request: `[0] name length, [1+] name`
- Response (`0x51`): string resources → `[0]=0, [1] value length, [2+] bytes`; integer resources → `[0]=1, [1]=4, [2–5] value`
- Notes: Name length must be ≥1 and ≤255; strings are limited to 255 bytes. Unknown resources return `0x01`.

#### 0x52 – Resource Set

- Request: `[0] value type (0=string,1=int), [1] name length, [2+] name, [N] value length, [N+] value`
- Response (`0x52`): empty
- Notes: Strings are NUL-terminated by the monitor before dispatch. Integer payloads may be 1, 2, or 4 bytes; other sizes trigger `0x80`. Type mismatches yield `0x81`.

### Execution Control (0x71–0x73)

#### 0x71 – Advance Instructions

- Request: `[0] step-over flag, [1–2] instruction count`
- Response (`0x71`): empty
- Notes: When the flag is non-zero the monitor uses `mon_instructions_next`, otherwise `mon_instructions_step`.

#### 0x72 – Keyboard Feed

- Request: `[0] length, [1+] PETSCII text`
- Response (`0x72`): empty
- Notes: Requires command header API version `0x02`; otherwise the monitor returns `0x82`. The server appends a NUL before calling `kbdbuf_feed`.

#### 0x73 – Execute Until Return

- Request: empty
- Response (`0x73`): empty
- Notes: Invokes `mon_instruction_return()`.

### Introspection (0x81–0x85)

#### 0x81 – Ping

- Request: empty
- Response (`0x81`): empty

#### 0x82 – Banks Available

- Request: empty
- Response (`0x82`): `[0–1] count, [2+] entries` where each entry is `[size,bank_lo,bank_hi,name_len,name]`
- Notes: Data is collected from `mon_interfaces[e_comp_space]`. Each size equals `3 + name_len`.

#### 0x83 – Registers Available

- Request: `[0] memspace`
- Response (`0x83`): `[0–1] count, [2+] entries` where each entry is `[size,id,bits,name_len,name]`
- Notes: Size equals `3 + name_len`. The `bits` field is the register width reported by `mon_reg_list_t::size`. Entries flagged with `MON_REGISTER_IS_FLAGS` are skipped.

#### 0x84 – Display Get

- Request: `[0] use alternate canvas flag, [1] format (0 = indexed 8-bit)`
- Response (`0x84`): `[0–3] info length (currently 13), [4–5] debug width, [6–7] debug height, [8–9] debug X offset, [10–11] debug Y offset, [12–13] inner width, [14–15] inner height, [16] bits per pixel (8), [17–20] buffer length, [21+] pixel data`
- Notes: Requires API version `0x02`. For the C128, setting the flag selects `machine_video_canvas_get(1)` (VDC); other machines ignore the flag. The buffer contains `debug_width * debug_height` bytes. Areas outside the visible inner rectangle are zero-filled.

#### 0x85 – VICE Info

- Request: empty
- Response (`0x85`): `[0]=4, [1–4]=VERSION_RC_NUMBER, [5]=4, [6–9]=build revision (zero unless `USE_SVN_REVISION` is defined)`
- Notes: The first length covers the four RC number bytes (major, minor, build, patch).

### Palette and I/O (0x91–0xB2)

#### 0x91 – Palette Get

- Request: `[0] use alternate canvas flag`
- Response (`0x91`): `[0–1] entry count, [2+] entries` where each entry is `[size, red, green, blue]`
- Notes: Shares the same canvas selection logic as `Display Get`. The `size` field is always 3.

#### 0xA2 – Joyport Set

- Request: `[0–1] port number, [2–3] value`
- Response (`0xA2`): empty
- Notes: Delegates to `mon_joyport_set_output`. Invalid port → `0x01`; illegal value → `0x81`; other failures → `0x8F`.

#### 0xB2 – Userport Set

- Request: `[0–1] value`
- Response (`0xB2`): empty
- Notes: Delegates to `mon_userport_set_output`. Illegal values return `0x81`; other errors return `0x8F`.

### Exit, Reset, Autostart (0xAA–0xDD)

#### 0xAA – Exit

- Request: empty
- Response (`0xAA`): empty
- Notes: Sets `exit_mon = 1`, returning execution to the emulator while keeping VICE running.

#### 0xBB – Quit

- Request: empty
- Response (`0xBB`): empty
- Notes: Calls `mon_quit()` to terminate VICE.

#### 0xCC – Reset

- Request: `[0] reset type`
- Response (`0xCC`): empty
- Notes: Value is passed straight to `mon_reset_machine`. Common values are 0 (soft), 1 (power), 8–11 (drive resets).

#### 0xDD – Autostart

- Request: `[0] run flag (0 = load only, 1 = run), [1–2] file index, [3] file name length, [4+] path`
- Response (`0xDD`): empty
- Notes: The monitor NUL-terminates the name and calls `mon_autostart`. On success the monitor exits so the autostart can continue; failures return `0x8F`.

---

## 6. Response Types

| ID | Type | Description | Body |
|----|------|-------------|------|
| 0x00 | Invalid | Error container | usually empty |
| 0x11 | Checkpoint Info | Checkpoint state | `[0–3] number, [4] hit, [5–6] start, [7–8] end, [9] stop, [10] enabled, [11] op mask, [12] temporary, [13–16] hit count, [17–20] ignore count, [21] has condition, [22] memspace` |
| 0x31 | Register Info | Register snapshot | `[0–1] count` followed by entries `(size,id,value_lo,value_hi)` |
| 0x61 | Jam | CPU jammed | empty (PC is not transmitted in the current implementation) |
| 0x62 | Stopped | Execution halted | `[0–1] current PC` |
| 0x63 | Resumed | Execution resumed | `[0–1] current PC` |

---

## 7. Example Projects

- **C64Studio** – IDE with VICE binary monitor integration.
- **vice-bridge-net** – .NET binary bridge.
- **IceBroLite** – GUI debugger.
- **VS65 Debugger** – VS Code CC65 integration.
- **VS64** – C64 build/debug/run extension.
