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
  1) Continue the current `x64sc -autostart` ephemeral runner (simple, stateless, heavy startup).
  2) Manage a long‑lived VICE process with BM and implement Autostart (`0xDD`) or direct program injection + `Keyboard Feed` for `RUN` (faster iteration, enables pause/step/breakpoints).

## Design Constraints & Decisions

- Single monitor client at a time: BM accepts one TCP client; keep a singleton session and serialize requests.
- Pause/resume semantics: when connected and not "exited", the monitor halts CPU. Map MCP `pause` to "enter monitor and remain"; map `resume` to `0xAA Exit` while keeping the socket open.
- Request/response framing: implement strict STX, API version (use `0x02`), length, request ID, and per‑command bodies; buffer and parse responses until the expected `(cmdId, reqId)` is observed.
- Timeouts and error mapping: translate BM error codes (0x80–0x8F) into `ToolExecutionError` details; implement clear timeout and ECONNREFUSED handling.
- Screen capture: map `read_screen` to deferred memory reads of `$0400..$07E7` and conversion via `screenCodesToAscii`; later, optionally provide framebuffer snapshots via `0x84`.
- Keyboard automation: use `0x72` for `RUN`/`RETURN` when injecting BASIC; require API header `0x02`.
- Safety: do not emulate hardware operations that do not exist on VICE (drives, poweroff); leave them unsupported with explicit messages.

## Viability Evidence

- `scripts/vice/vice-bm-smoke-test.py` demonstrates soft reset (`0xCC`), memory write/read (`0x02/0x01`), keyboard feed (`0x72`), and screen verification in a self‑contained flow using Xvfb + `x64sc`.

## Targeted Scope per Phase (high level)

1) Core BM client + memory/screen + reset + pause/resume (keep current ephemeral PRG runner).
2) Long‑lived VICE process mgmt + Autostart (`0xDD`) or injection + keyboard feed; stable program runners; keyboard tool.
3) Debugger features: breakpoints, stepping, registers; bank/memspace awareness surfaced; optional display get.
4) Emulator resources & display capture polish; finalize platform descriptors and docs.

