# Vice Support Rollout Plan

Purpose: Deliver practical, high‑value VICE support quickly, with clear platform semantics and safe fallbacks. Each phase targets what can be completed in a single focused LLM session, avoiding fragmentation.

## Required Reading (before starting)

- `doc/vice/vice-binary-monitor-spec.md` — Protocol framing, command set, error codes.
- `doc/vice/vice-bm-vs-c64u-rest.md` — Feature comparison and gaps.
- `doc/plans/vice-support/plan.md` and `doc/plans/vice-support/notes.md` — Objectives and design decisions.
- Code references: `src/device.ts`, `src/c64Client.ts`, `src/petscii.ts`, `src/mcp-server.ts`, `src/platform.ts`, `src/viceRunner.ts`.
- Smoke test inspiration: `scripts/vice/vice-bm-smoke-test.py`.

## Operator Rules

- Execute phases strictly in order; do not parallelize across phases.
- After any change, run `npm run check` and only proceed if it passes.
- Keep changes minimal and focused on the current phase; update tests and docs alongside code changes.
- Preserve hardware behaviors; do not introduce fake drive/config semantics under VICE.

## Phase 1 — Core BM client and memory/screen/system (Foundations)

Deliverables:

- Implement `src/viceBinaryMonitor.ts` with: connect, request framing, `0x85` Info, `0x01` Memory Get, `0x02` Memory Set, `0xCC` Reset, `0x72` Keyboard Feed, `0xAA` Exit; serialize requests; timeouts + error translation.
- Integrate into `src/device.ts` by replacing the stubbed `ViceBackend` methods: `ping`, `version`, `info`, `reset`, `pause`, `resume`, `readMemory`, `writeMemory`.
- Leave `runPrg` as currently implemented (`x64sc -autostart`) to reduce scope.
- Verify `c64_memory` (`read`, `write`, `read_screen`, `wait_for_text`) and `c64_system` (`reset_c64`, `pause`, `resume`) work under `C64_MODE=vice`.
- Update `src/platform.ts` VICE features to include `binary-monitor`, `memory-io`, `pause/resume`, `reset`, `screen-capture`.

Acceptance:

- Under `C64_MODE=vice`, a BASIC hello world loaded via memory write + `Keyboard Feed` displays on screen; `read_screen` captures it; `wait_for_text` detects `READY.`.
- Memory read/write round‑trip tests pass; reset/pause/resume behave predictably.

## Phase 2 — Stable runners and lifecycle (Long‑lived VICE)

Deliverables:

- Add `src/viceProcess.ts` to spawn and supervise a single VICE instance with `-binarymonitor`; integrate with env (`VICE_*`, `FORCE_XVFB`), following patterns in `src/viceRunner.ts`.
- Extend `ViceBackend.runPrg(prg|file)` to use BM Autostart (`0xDD`) when a supervised VICE is running, or fall back to the existing ephemeral `-autostart` path when not.
- Add optional `keyboard_feed` tool (emulator‑specific) to send PETSCII to the keyboard buffer for scripted interactions.

Acceptance:

- `c64_program` operations (`upload_run_basic`, `upload_run_asm`) succeed under VICE without spawning a new emulator per run when the supervisor is active.
- A short BASIC program can be injected and started via BM with subsequent screen verification.

## Phase 3 — Debugger capabilities (Breakpoints, stepping, registers)

Deliverables:

- Implement BM commands: `0x11/0x12/0x13/0x14/0x15` (breakpoint CRUD/toggle), `0x22` (conditional), `0x71/0x73` (step/next/return), `0x31/0x32` (register get/set), `0x82/0x83` (banks/registers metadata where applicable).
- Add a new grouped module `c64_debug` with ops: `set_breakpoint`, `list_breakpoints`, `delete_breakpoint`, `toggle_breakpoint`, `set_condition`, `step`, `next`, `until_return`, `get_registers`, `set_registers`.
- Clearly mark `supportedPlatforms: ["vice"]` for these debug‑only tools.

Acceptance:

- A minimal program breakpoints demo: set exec breakpoint on a known address, run PRG, verify stop, inspect registers, single‑step a few instructions, then resume to completion.

## Phase 4 — Emulator resources and display capture (Polish)

Deliverables:

- Implement `0x84` (Display Get) to capture a single framebuffer; expose as `c64_vice.display_get` returning geometry and raw pixels; optionally add a PNG encoder fallback.
- Implement `0x51/0x52` (Resource get/set) for emulator options; expose as `c64_vice.resource_get`/`resource_set` with careful validation and namespacing.
- Update platform resource (`/platform`) to reflect debugger features and emulator‑specific tools; refresh README notes.

Acceptance:

- `display_get` returns consistent geometry/pixels (sanity‑checked size); resource get/set demonstrates reading and toggling a small, safe option (e.g., confirm a boolean/enum round‑trip).

## Done Definition

- TypeScript builds cleanly; tests pass (`npm run check`).
- VICE features appear in the platform resource with correct supported/unsupported tool lists.
- Unsupported operations on VICE return informative errors without crashing the server.
- README and platform docs call out feature parity and differences succinctly.

