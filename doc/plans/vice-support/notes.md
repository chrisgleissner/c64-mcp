# Vice Support — Working Notes

These notes summarize the current state of VICE support in the MCP server, gaps vs. C64U REST, and design constraints for a robust Binary Monitor (BM) integration.

## Current State (as of this branch)

- Backend abstraction exists (`src/device.ts`) with a `ViceBackend` facade, but it only supports:
  - `runPrg(prg)` and `runPrgFile(path)` by spawning `x64sc` with `-autostart -warp -silent`.
  - Everything else throws `UNSUPPORTED` (memory, system control, config, drives, etc.).
- A VICE runner utility exists for SID → WAV capture (`src/viceRunner.ts`) but is unrelated to BM.
- Tools mark some operations as `supportedPlatforms: ["c64u", "vice"]`, yet under VICE most calls fail because the facade is a stub.
- `read_screen` relies on `client.readMemoryRaw` (screen RAM at `$0400`), which currently fails on the VICE path because `ViceBackend.readMemory` is unsupported.

## Protocol & Feature Parity Summary

Reference docs:

- VICE Binary Monitor protocol: `doc/vice/vice-binary-monitor-spec.md`
- Comparison: `doc/vice/vice-bm-vs-c64u-rest.md`

Key signals from the comparison:

- BM excels at debugger primitives: memory read/write, breakpoints, single-stepping, register IO, display framebuffer, palette, keyboard feed.
- C64U REST excels at hardware orchestration: DMA-based program runners, drive management, persistent configuration, audio/video/debug streaming.
- Overlap areas: reset and memory IO are available in both; semantics differ (BM supports memspaces and banks, REST exposes a flattened DMA map).

Implications for MCP:

- We can deliver strong memory/screen/debug flows via BM under VICE.
- We cannot reasonably replicate drive management, file image creation, streams, or Ultimate firmware configuration on VICE; these remain unsupported or receive emulator-specific resource controls (VICE "resources").
- Program execution can be handled in two ways under VICE:
  1) BM RAM injection on a long‑lived process (default): fast, DMA‑like, precise control.
  2) BM `0xDD` Autostart (fallback): file‑based, minimal pointer logic.
  3) Per‑run `x64sc -autostart` spawn (last resort): slowest; avoids long‑lived state.
  2) Manage a long‑lived VICE process with BM and implement Autostart (`0xDD`) or direct program injection + `Keyboard Feed` for `RUN` (faster iteration, enables pause/step/breakpoints).

## Design Constraints & Decisions

- Single monitor client at a time: BM accepts one TCP client; keep a singleton session and serialize requests.
- Pause/resume semantics: the BM halts CPU while processing; explicitly resume (`0xAA Exit`) between polling reads so emulation continues (used in readiness helpers and smoke test).
- Request/response framing: implement strict STX, API version (use `0x02`), length, request ID, and per‑command bodies; buffer and parse responses until the expected `(cmdId, reqId)` is observed.
- Timeouts and error mapping: translate BM error codes (0x80–0x8F) into `ToolExecutionError` details; implement clear timeout and ECONNREFUSED handling.
- Screen capture: map `read_screen` to deferred memory reads of `$0400..$07E7` and conversion via `screenCodesToAscii`; later, optionally provide framebuffer snapshots via `0x84`.
- Keyboard automation: use `0x72` for `RUN`/`RETURN` when injecting BASIC; require API header `0x02`.
- Safety: do not emulate hardware operations that do not exist on VICE (drives, poweroff); leave them unsupported with explicit messages.

## Viability Evidence

- `test/vice/viceSmokeTest.ts` (TS) demonstrates hard/soft reset, memory write/read, keyboard feed, screen polling with resume hooks, and clean process teardown (visible or headless).

## Scope Clarifications

- Long‑lived VICE process: the default workflow keeps a supervised emulator running and injects programs into RAM for speed and parity with C64U DMA.
- Autostart remains an optional fallback (BM `0xDD`) but is not the default. Per‑run spawn is a last resort.
- `src/viceRunner.ts` is kept for SID→WAV audio export only; general VICE control is implemented behind the facade using `src/vice/viceClient.ts` + `src/vice/readiness.ts` and a supervisor.

## Targeted Scope per Phase (high level)

1) Core BM client + memory/screen + reset + pause/resume (keep current ephemeral PRG runner).
2) Long‑lived VICE process mgmt + Autostart (`0xDD`) or injection + keyboard feed; stable program runners; keyboard tool.
3) Debugger features: breakpoints, stepping, registers; bank/memspace awareness surfaced; optional display get.
4) Emulator resources & display capture polish; finalize platform descriptors and docs.
