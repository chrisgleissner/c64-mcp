# VICE Binary Monitor vs Ultimate 64 REST API

This document summarizes the union of capabilities exposed by the [VICE Binary Monitor protocol](https://vice-emu.sourceforge.io/vice_13.html) and the [Ultimate 64 REST API](https://1541u-documentation.readthedocs.io/en/latest/api/api_calls.html). Each row shows how to invoke the feature through either interface and highlights functional gaps.

Legend: 🟢 green light (full support or best option), 🟡 amber light (partial or indirect support), 🔴 red light (not available here). Indicators appear at the start of each platform cell.

## Memory and CPU State

| Capability | VICE Binary Monitor | Ultimate REST API | Notes |
| --- | --- | --- | --- |
| Memory read | 🟢 `0x01` Memory Get — body `[sidefx,start_lo,start_hi,end_lo,end_hi,memspace,bank_lo,bank_hi]`; response `0x01` with length and data block. | 🟡 `GET /v1/machine:readmem?address=$ADDR&length=$LEN` (DMA map, default length 256). | Binary monitor supports memspaces and banks; REST access is limited to the flattened DMA-visible map and must not wrap past `$FFFF`. |
| Memory write | 🟢 `0x02` Memory Set — request extends Memory Get body with the payload bytes for `[start,end]`. | 🟡 `PUT /v1/machine:writemem?address=$ADDR&data=...` or `POST /v1/machine:writemem` with binary attachment. | Monitor enforces payload length match and offers side-effect control; REST writes up to 128 bytes per call using the current DMA mapping. |
| Register snapshot | 🟢 `0x31` Registers Get — body `[memspace]`; response lists `(size,id,value_lo,value_hi)` tuples. | 🔴 Not available (except `GET /v1/machine:debugreg` for `$D7FF`). | REST lacks general-purpose register visibility; only the Ultimate 64 debug register is exposed. |
| Register update | 🟢 `0x32` Registers Set — `[memspace,count,{size,id,value_lo,value_hi,...}]`; response echoes `0x31`. | 🔴 Not available. | Direct CPU register writes require the monitor. |
| Banks enumeration | 🟢 `0x82` Banks Available — lists bank IDs and names for `e_comp_space`. | 🔴 Not available. | REST cannot query cartridge banks; the monitor is needed for bank-aware tools. |
| Register catalog | 🟢 `0x83` Registers Available — reports register IDs, bit widths, and names. | 🔴 Not available. | REST offers no equivalent metadata. |
| VICE info | 🟡 `0x85` VICE Info — returns `VERSION_RC_NUMBER` and optional revision bytes. | 🟢 `GET /v1/version`, `GET /v1/info`. | REST delivers richer device metadata (product, firmware, FPGA); monitor only returns emulator build numbers. |
| Ping | 🟢 `0x81` Ping — empty request/response. | 🟢 `GET /v1/version` (lightweight health check). | Monitor ping also verifies API negotiation (error `0x82` on bad version). |

## Breakpoints, Conditions, and Execution Flow

| Capability | VICE Binary Monitor | Ultimate REST API | Notes |
| --- | --- | --- | --- |
| Create checkpoint | 🟢 `0x12` Checkpoint Set — `[start,end,stop,enabled,op_mask,temporary,(optional)memspace]`; response `0x11`. | 🔴 Not available. | Only the monitor exposes code/data breakpoints. |
| Query checkpoint | 🟢 `0x11` Checkpoint Get — `[checknum]`; response `0x11`. | 🔴 Not available. | REST has no breakpoint introspection. |
| Delete checkpoint | 🟢 `0x13` Checkpoint Delete — `[checknum]`. | 🔴 Not available. | — |
| Toggle checkpoint | 🟢 `0x15` Checkpoint Toggle — `[checknum,enable]`. | 🔴 Not available. | — |
| List checkpoints | 🟢 `0x14` Checkpoint List — emits one `0x11` per entry then `0x14` with total count. | 🔴 Not available. | — |
| Conditional breakpoint | 🟢 `0x22` Condition Set — `[checknum,len,expr_bytes]`. | 🔴 Not available. | Expressions mirror CLI monitor syntax. |
| Step/advance | 🟢 `0x71` Advance Instructions — `[step_over,count_lo,count_hi]`. | 🔴 Not available. | REST cannot single-step; use pause/resume only. |
| Execute until return | 🟢 `0x73` Execute Until Return. | 🔴 Not available. | — |
| Keyboard feed | 🟢 `0x72` Keyboard Feed (API header must be `0x02`). | 🔴 Not available. | Useful for scripted monitor input; REST offers no keyboard injection. |
| Jam/stop/resume events | 🟢 Async responses `0x61/0x62/0x63` with request ID `0xffffffff`. | 🔴 Not available. | REST lacks push notifications; clients must poll status. |

## Machine Lifecycle

| Capability | VICE Binary Monitor | Ultimate REST API | Notes |
| --- | --- | --- | --- |
| Exit monitor | 🟢 `0xAA` Exit — releases control back to emulator loop. | 🟡 Not required. | REST calls run out-of-band and do not halt the CPU by default. |
| Quit emulator/device | 🟡 `0xBB` Quit — invokes `mon_quit()`. | 🟢 `PUT /v1/machine:poweroff` (powers off), `PUT /v1/machine:reboot`. | Monitor quit terminates VICE; REST poweroff stops the Ultimate hardware. |
| Reset | 🟢 `0xCC` Reset — `[reset_type]` (0 soft, 1 hard, 8–11 drive IDs). | 🟢 `PUT /v1/machine:reset` (system), `PUT /v1/drives/{drive}:reset` (per-drive). | Monitor supports fine-grained drive resets via type codes; REST splits drive resets per endpoint. |
| Pause/resume | 🟡 Resume controlled by exiting monitor; stop state signaled with `0x62/0x63`. | 🟢 `PUT /v1/machine:pause` / `PUT /v1/machine:resume`. | REST offers explicit pause control without entering a monitor. |
| Autostart/run program | 🟡 `0xDD` Autostart — `[run_flag,file_index,name_len,name_bytes]`. | 🟢 `PUT/POST /v1/runners:run_prg` (DMA load + run) or `...:load_prg` (load only). | Monitor autostart exits the monitor after queuing the autostart; REST runners reset the machine automatically. |

## Snapshots, Display, and Peripherals

| Capability | VICE Binary Monitor | Ultimate REST API | Notes |
| --- | --- | --- | --- |
| Save snapshot | 🟢 `0x41` Dump Snapshot — `[save_roms,save_disks,name_len,name_bytes]`. | 🔴 Not available. | REST has no snapshot API. |
| Load snapshot | 🟢 `0x42` Undump Snapshot — `[name_len,name_bytes]`; response returns PC. | 🔴 Not available. | — |
| Display capture | 🟢 `0x84` Display Get (API `0x02`) — `[alt_canvas,mode]`; response includes geometry metadata and pixel buffer. | 🟡 `PUT /v1/streams/video:start?ip=host[:port]` for live UDP streaming (Ultimate 64 only). | Monitor provides immediate framebuffer dumps; REST streams continuous video but no single-frame capture. |
| Palette capture | 🟢 `0x91` Palette Get — `[alt_canvas]`; returns RGB triples. | 🔴 Not available. | REST lacks palette inspection. |
| Joyport output | 🟢 `0xA2` Joyport Set — `[port_lo,port_hi,value_lo,value_hi]`. | 🔴 Not available. | REST cannot toggle joystick lines. |
| Userport output | 🟢 `0xB2` Userport Set — `[value_lo,value_hi]`. | 🔴 Not available. | — |
| Keyboard injection | 🟢 `0x72` Keyboard Feed. | 🔴 Not available. | — |

## Configuration and Resources

| Capability | VICE Binary Monitor | Ultimate REST API | Notes |
| --- | --- | --- | --- |
| Resource read | 🟡 `0x51` Resource Get — `[name_len,name_bytes]`; response indicates type and value. | 🟡 `GET /v1/configs`, `GET /v1/configs/{category}`, `GET /v1/configs/{category}/{item}`. | Monitor accesses emulator resource system; REST targets Ultimate firmware settings. |
| Resource write | 🟡 `0x52` Resource Set — `[type,name_len,name_bytes,value_len,value_bytes]`. | 🟡 `PUT /v1/configs/{...}?value=...`, `POST /v1/configs` (batch). | Resource namespaces differ: monitor affects VICE runtime options, REST changes Ultimate firmware configuration. |
| Batch configuration | 🔴 Not available. | 🟢 `POST /v1/configs` (nested JSON). | — |
| Load/save config to flash | 🔴 Not available. | 🟢 `PUT /v1/configs:load_from_flash`, `PUT /v1/configs:save_to_flash`. | Flash persistence is firmware-specific. |
| Factory reset config | 🔴 Not available. | 🟢 `PUT /v1/configs:reset_to_default`. | — |

## Media, Drives, and Audio (REST Exclusive)

| Capability | VICE Binary Monitor | Ultimate REST API | Notes |
| --- | --- | --- | --- |
| SID playback | 🔴 Not available. | 🟢 `PUT/POST /v1/runners:sidplay`. | Hardware audio runners are outside the scope of the monitor. |
| MOD playback | 🔴 Not available. | 🟢 `PUT/POST /v1/runners:modplay`. | — |
| Cartridge/PRG DMA load | 🟡 Autostart (`0xDD`) accepts filenames from the host FS. | 🟢 `PUT/POST /v1/runners:run_crt`, `...:run_prg`, `...:load_prg`. | Monitor runs within VICE and uses its virtual FS; REST accesses the Ultimate storage or uploaded payloads. |
| Drive management | 🔴 Not available (except checkpointing on drive CPU via memspace). | 🟢 `/v1/drives` (info), `/v1/drives/{drive}:mount`, `:remove`, `:on`, `:off`, `:set_mode`, `:load_rom`. | REST controls physical drive emulation directly. |
| File image creation | 🔴 Not available. | 🟢 `PUT /v1/files/{path}:create_d64/d71/d81/dnp`. | Monitor has no disk image authoring commands. |
| Data streams | 🔴 Not available. | 🟢 `PUT /v1/streams/<stream>:start` / `PUT /v1/streams/<stream>:stop` (stream = `video`, `audio`, `debug`). | REST can export live video/audio/debug streams. |

## Observations

- The VICE Binary Monitor is the only interface that exposes low-level debugger primitives (breakpoints, register manipulation, single-stepping, framebuffer snapshots, palette dumps, joystick/userport control).
- The Ultimate REST API focuses on machine orchestration and firmware-level services (DMA loading, media playback, drive management, persistent configuration, and streaming), none of which are available through the binary monitor.
- Memory access and reset operations overlap; however, the monitor supports banked address spaces and fine-grained CPU control, while the REST DMA endpoints operate on the flattened Ultimate memory view and offer coarse pause/resume semantics.
- Integrations needing both precise debugging and system management typically combine the monitor for CPU/memory inspection with REST calls for device control and file management.
