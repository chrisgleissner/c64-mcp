# Vice Support Plan

Objective: Provide first‑class VICE emulator support in the MCP server using the Binary Monitor (BM) protocol, achieving parity where feasible with the C64U REST experience, and making platform capabilities explicit to clients.

## Goals

- Implement a robust, typed BM client with request multiplexing and error translation.
- Enable practical day‑to‑day flows under VICE: program runs, screen capture, memory IO, pause/resume, soft reset.
- Introduce optional debugger workflows (breakpoints, registers, stepping) as a distinct capability set.
- Keep clear boundaries: do not emulate hardware‑only features (drives, firmware config, streaming) on VICE.

## Scope (What we will support on VICE)

- Memory: read/write main memory (initially comp memspace, bank=`0`) with safe bounds.
- Screen: `read_screen` via `$0400..$07E7` and ASCII conversion; polling via `wait_for_text`.
- System: soft reset; pause/resume by entering/exiting monitor; version/info probe.
- Runners: PRG runs via (a) current `x64sc -autostart` or (b) BM `0xDD`/injection; BASIC/ASM helpers preserved.
- Debugging (later phase): breakpoints, step/next, execute‑until‑return, register read/write; optional framebuffer snapshot.

## Out of Scope (remain unsupported on VICE)

- Drives and file image creation (D64/D71/D81/DNP) — REST only.
- Hardware streaming (video/audio/debug) — REST only. For VICE, prefer ad‑hoc captures.
- Firmware configuration (`/v1/configs` load/save/reset) — replace with VICE “resources” in a separate emulator‑specific module when needed.

## Technical Design

1) Vice Binary Monitor Client (`src/viceBinaryMonitor.ts`)
   - Transport: TCP to `127.0.0.1:6502` (configurable), single session, queued requests.
   - Framing: STX `0x02`, API version `0x02`, body length (uint32 LE), request ID (uint32 LE), command ID, body.
   - Commands (initial):
     - `0x85` Info (for ping/version), `0xCC` Reset, `0x01` Memory Get, `0x02` Memory Set, `0x72` Keyboard Feed, `0xAA` Exit.
   - Error handling: translate BM error codes to structured errors; timeouts; socket lifecycle (connect, keepalive, backoff reconnect).
   - Concurrency: serialize (one outstanding request); buffer unsolicited events (e.g., `Stopped/Resumed`) for logging.

2) Process Manager (`src/viceProcess.ts`)
   - Start a long‑lived `x64sc` with: `-binarymonitor`, `-binarymonitoraddress 127.0.0.1:6502`, `-sounddev dummy`, `-config /dev/null`, `-warp`, quiet mode.
   - Env integration: honor `VICE_MODE`, `VICE_LIMIT_CYCLES`, `VICE_BINARY`, `FORCE_XVFB` (see `mcp.json` and `src/viceRunner.ts`).
   - Lifecycle: start on demand; monitor stdout/stderr; auto‑restart policy with jitter; clean shutdown.
   - Optional: run under `xvfb-run` in headless/CI when needed.

3) Facade Integration (`src/device.ts`)
   - Replace the stub `ViceBackend` with implementations backed by the BM client:
     - `ping`, `version`, `info` (BM Info), `reset` (`0xCC`), `pause`/`resume` (connect vs. `0xAA Exit`),
     - `readMemory`/`writeMemory` (initially comp memspace, bank 0; extend later),
     - `runPrg` stays as today (ephemeral `-autostart`) in Phase 1; evolve to BM Autostart/injection in Phase 2.
   - Keep hardware‑specific endpoints (`drives*`, `files*`, `config*`, `stream*`) returning `UNSUPPORTED` with crisp messages.

4) Client & Tools
   - `C64Client.readMemoryRaw()` and `writeMemory()` already prefer the facade; once `ViceBackend` supports them, memory tools work unchanged.
   - `read_screen` and `wait_for_text` start working under VICE without tool changes (screen ASCII exists in `src/petscii.ts`).
   - System tool (`reset_c64`, `pause`, `resume`) starts working under VICE via facade.
   - Add optional `keyboard_feed` op later (emulator‑specific) to rapidly drive BASIC prompts.

5) Platform Description (`src/platform.ts` and platform resource)
   - Update VICE features to include: `binary-monitor`, `memory-io`, `pause/resume`, `reset`, `screen-capture`, and later `debugger-primitives`.
   - Keep limited features explicit: no hardware drives, no firmware config, no REST streams.

6) Optional Debug Module (later phase)
   - New grouped tool `c64_debug` exposing BM features: set/list/delete/toggle breakpoints, conditionals, step/next/return, register get/set, banks list, display get.
   - Separate from generic memory/system tools to avoid confusing capabilities across platforms.

## Acceptance Guidelines

- Under `C64_MODE=vice`, the following must succeed without REST:
  - `c64_memory` ops: `read`, `write`, `read_screen`, and `wait_for_text`.
  - `c64_system` ops: `reset_c64`, `pause`, `resume`.
  - `c64_program` ops: `upload_run_basic` and `upload_run_asm` continue to work (even if via ephemeral `-autostart` in Phase 1).
- Clear error messages for unsupported features when running on VICE (drives, files, streaming, firmware configs).
- Logging includes BM command timings and error codes for troubleshooting.

