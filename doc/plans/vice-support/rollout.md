# Vice Support Rollout Plan

Purpose: Deliver practical, high‑value VICE support quickly, with clear platform semantics and safe fallbacks. Each phase targets what can be completed in a single focused LLM session, avoiding fragmentation.

## Required Reading (before starting)

- [ ] Read `doc/vice/vice-binary-monitor-spec.md` (BM framing, commands, errors).
- [ ] Read `doc/vice/vice-bm-vs-c64u-rest.md` (feature comparison). The guidance remains correct, with one emphasis from our findings: the BM pauses CPU during monitor handling — explicitly call `0xAA Exit` between screen/memory polls so emulation progresses.
- [ ] Read `doc/plans/vice-support/plan.md` and `doc/plans/vice-support/notes.md` (objectives, design decisions).
- [ ] Skim code refs: `src/device.ts`, `src/c64Client.ts`, `src/petscii.ts`, `src/mcp-server.ts`, `src/platform.ts`, `src/viceRunner.ts` (audio only).
- [ ] Run/understand `test/vice/viceSmokeTest.ts` (long‑lived VICE, readiness, injection, screen verification).

## Operator Rules

- Execute phases strictly in order; do not parallelize across phases.
- After any change, run `npm run check` and only proceed if it passes.
- Keep changes minimal and focused on the current phase; update tests and docs alongside code changes.
- Preserve hardware behaviors; do not introduce fake drive/config semantics under VICE.
- Prefer using a real VICE binary when available; fall back to the BM stub only when explicitly requested (see Test Harness checklist).

## CI and Headless Testing

- [ ] Configure CI to run any VICE‑dependent tests under X11 virtualization. Either:
  - Set `FORCE_XVFB=1` (or `CI=1`) so helpers spawn `Xvfb` automatically; or
  - Wrap commands in `xvfb-run`.
- [ ] Add a CI step to run the smoke test headlessly: `FORCE_XVFB=1 npm run vice:smoke`.
- [ ] Recommend the same locally during builds to avoid VICE windows popping up and to catch headless issues early: `FORCE_XVFB=1 npm run vice:smoke` (and any VICE‑dependent tests).

## Smoke Test and Test Strategy

- [ ] Reuse the existing minimal BM client for smoke tests (`src/vice/viceClient.ts` with `src/vice/readiness.ts`), proven by `test/vice/viceSmokeTest.ts`.
- [ ] Keep the smoke test simple: start VICE, wait for READY., inject a tiny BASIC program, RUN, verify the screen, clean up processes.
- [ ] Do not grow the smoke test further; any new VICE features must have their own normal tests (unit/integration) alongside other prod features under `test/`.
- [ ] Avoid UI‑sensitive/timing‑brittle assertions in the smoke test; prefer feature‑specific tests for deeper coverage.
- [ ] Gate smoke-test execution behind the same flag used in phase deliverables (e.g., real VICE unless `VICE_TEST_TARGET=mock`).

## Phase 1 — Core client + screen/memory/system (Foundations)

Checklist:

- [ ] Implement BM client and readiness helpers (`src/vice/viceClient.ts`, `src/vice/readiness.ts`): `info`, `reset`, `memGet`, `memSet`, `keyboardFeed`, `exitMonitor`, screen polling.
- [ ] Add smoke test (`test/vice/viceSmokeTest.ts`): launch VICE, wait READY., inject BASIC, RUN, verify screen; include process cleanup; support visible and headless.
- [ ] Wire `src/device.ts` `ViceBackend` to use the client for: `ping`, `version`, `info`, `reset`, `readMemory`, `writeMemory`; `pause`/`resume` via monitor enter/exit.
- [ ] Update platform features (`src/platform.ts`) for VICE: `binary-monitor`, `memory-io`, `pause/resume`, `reset`, `screen-capture`.
- [ ] Introduce a BM stub (`src/vice/mockServer.ts` or similar) for tests: respond to minimal command set; controlled via flag `VICE_TEST_TARGET=mock`. Default should attempt real VICE.
- [ ] Document env detection order (developer guide): real VICE when available; stub only when explicitly requested; tests skip gracefully if neither is present.

Acceptance:

- [ ] Under `C64_MODE=vice`, `c64_memory` (`read`, `write`, `read_screen`, `wait_for_text`) and `c64_system` (`reset_c64`, `pause`, `resume`) work end‑to‑end using BM.
- [ ] Smoke test passes both with real VICE (default) and with the stub (`VICE_TEST_TARGET=mock`).

## Phase 2 — Long‑lived process + injection runners

Checklist:

- [ ] Add supervisor (`src/vice/process.ts`) to spawn and supervise a single VICE process; honor `VICE_*` env; headless via Xvfb; clean shutdown.
- [ ] Extend `ViceBackend.runPrg(prg|file)` to inject into RAM on the supervised process (BASIC pointer patch + `keyboardFeed RUN`); keep BM `0xDD` as optional fallback; remove per‑run spawn from the default path.
- [ ] Ensure resume/exit hooks are used between polls so emulation runs during readiness and screen waits.
- [ ] Add documentation to developer guide for visible vs headless runs; keep vice:smoke as a sanity command.

Acceptance:

- [ ] `c64_program` (`upload_run_basic`, `upload_run_asm`) use the supervised VICE without respawning; hello world displays and is captured by `read_screen`.

## Phase 3 — Debugger capabilities (Breakpoints, stepping, registers)

Checklist:

- [ ] Implement BM: `0x11/0x12/0x13/0x14/0x15` (breakpoints), `0x22` (conditions), `0x71/0x73` (step/return), `0x31/0x32` (registers), `0x82/0x83` (banks/registers metadata).
- [ ] Add grouped module `c64_debug` with ops for the above; mark `supportedPlatforms: ["vice"]`.

Acceptance:

- [ ] Demo: set breakpoint, run PRG, verify stop, inspect registers, step a few instructions, resume to completion.

## Phase 4 — Emulator resources and display capture (Polish)

Checklist:

- [ ] Implement `0x84` Display Get; expose minimal `c64_vice.display_get` returning geometry + pixels; optional PNG encoding.
- [ ] Implement `0x51/0x52` Resource get/set; expose `c64_vice.resource_get`/`resource_set` with safe namespacing.
- [ ] Update platform resource/README to reflect emulator‑specific tools and debugger status.

Acceptance:

- [ ] `display_get` returns consistent geometry/pixels; resource get/set toggles a simple option end‑to‑end.

## Done Definition

- [ ] TypeScript builds cleanly; tests pass (`npm run check`).
- [ ] VICE features appear in the platform resource with correct supported/unsupported tool lists.
- [ ] Unsupported operations on VICE return informative errors without crashing the server.
- [ ] README and platform docs call out feature parity and differences succinctly.

## Notes on Existing Code

- `src/viceRunner.ts` (SID→WAV) is retained for audio capture only; do not extend it for program runners. All general VICE control lives behind the facade using `src/vice/viceClient.ts` + supervisor.
