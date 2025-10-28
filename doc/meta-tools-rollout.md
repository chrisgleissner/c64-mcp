## Meta Tools Rollout Plan for c64bridge

Purpose: Provide a concrete, dependency-aware rollout approach for the meta tools defined in `doc/meta-tools.md`. This plan gives ordered, checkable task lists and high-level implementation notes. It is written so another LLM can execute the rollout autonomously.

### Required reading

The following documents need to be read and understood before starting the rollout:

- `doc/meta-tools.md` — Meta tools definitions, effort/benefit/dependencies matrix
- `doc/agent-state-spec.md` — Background task registry and persistence model
- `doc/developer.md` — Architecture overview and contribution guidelines

### Operator rules for the LLM performing the rollout

- Always work tasks strictly in order as listed. Do not skip ahead unless a task is cancelled.
- After each checklist item, run the full build and test suite and proceed only if it passes:
  - Preferred: `npm run check` (build + tests) or `npm test` if already built.
- If tests fail:
  - Fix the cause if obvious and retry once.
  - If still failing, revert the last change and leave a short note in the status log, then stop.
- Keep edits minimal and focused. Prefer small, incremental changes.
- Update documentation in the same change when tool behavior or surface changes.
- For any new code, add/extend tests that cover basic happy path and one failure path.
- Respect device-affecting safeguards already in the codebase (pause/resume, stream mutual exclusion, time limits).

### Global implementation template (apply per meta tool)

- [ ] Read the tool’s entry in `doc/meta-tools.md` and its Effort/Benefit/Dependencies.
- [ ] Verify prerequisites (dependencies implemented). If missing, pause and complete dependencies first.
- [ ] Implement the meta tool wrapper in the MCP server (compose existing low-level tools; avoid firmware-only assumptions).
- [ ] Add or extend unit/integration tests for the meta tool’s happy path and a basic failure case.
- [ ] Update docs: ensure the tool’s documentation is aligned; add usage hints if applicable.
- [ ] Run full build + tests: `npm run check` must pass.

Notes:

- Do not expand the REST surface; meta tools must compose existing MCP tools.
- Ensure mutual exclusion where streams and debug capture conflict.
- Enforce timeouts and guardrails for background/scheduled operations.

---

### Phase 0 — Foundations (low-effort, high-benefit, unlocks others)

- [x] `firmware_info_and_healthcheck` — Implementation notes:
  - Compose version, info, and a tiny `readmem` probe. Return structured readiness.
  - Use short, bounded timeouts; capture latency metrics.
- [x] `wait_for_screen_text` — Implementation notes:
  - Poll screen RAM via existing helper; support regex and plain text. Provide timeout and interval.
  - Return match bounds and elapsed time.
- [x] `verify_and_write_memory` — Implementation notes:
  - Pause → read → verify → write → read-back → resume. Abort on mismatch.
  - Parameterize verification masks and expected buffer; return a diff when failing.
- [x] `start_background_task` / `stop_background_task` / `list_background_tasks` / `stop_all_background_tasks` — Implementation notes:
  - Implement a persistent registry (in-memory with serialized state to disk if available).
  - Support fixed-interval scheduling and a maximum iterations cap.
- [x] `find_paths_by_name` — Implementation notes:
  - Container-aware discovery using wildcard info endpoints; return host and logical paths.
  - Cache recent results with a short TTL to avoid repeated scans.
- [x] `memory_dump_to_file` — Implementation notes:
  - Chunked reads with retries; optional pause/resume. Support hex and binary formats.
  - Emit a checksum and write a manifest alongside the dump.
- [x] `config_snapshot_and_restore` — Implementation notes:
  - Read all categories, persist versioned JSON; support batch restore and diff preview.

Requirement: After each checkbox completion, run `npm run check` and proceed only on success.

---

### Phase 1 — Orchestration and assertions

- [x] `program_shuffle` — Implementation notes:
  - Discover PRG/CRT under root; run each for a duration; capture screen; soft reset.
  - Persist a light run log per program.
- [x] `batch_run_with_assertions` — Implementation notes:
  - Accept assertions: screen contains text, memory equals byte, SID silent.
  - Produce junit-like results; stop on failure or continue-on-error per flag.
- [x] `bundle_run_artifacts` — Implementation notes:
  - Gather screen, memory snapshot, debugreg; structure outputs per run id.
- [x] `compile_run_verify_cycle` — Implementation notes:
  - Support BASIC/ASM/SID build routes; then run and verify via screen/audio.
  - Archive artifacts in a run folder.

---

### Phase 2 — Filesystem and drives

- [ ] `drive_mount_and_verify` — Implementation notes:
  - Power on if needed; mount; reset; verify via drives list. Retry with backoff.
- [ ] `create_and_mount_blank_d64` — Implementation notes:
  - Create blank D64; mount; optional BASIC header writer.
- [ ] `container_aware_walk_and_classify` — Implementation notes:
  - Recurse host and container entries; classify BASIC vs PRG-MC via load + read.
- [ ] `classify_prg_basic_or_mc` — Implementation notes:
  - For a single PRG; detect BASIC tokenization from header bytes.
- [ ] `filesystem_stats_by_extension` — Implementation notes:
  - Compute counts and sizes; rollups per extension and per-folder/container.
- [ ] `dedup_scan` — Implementation notes:
  - Group by size and extension; optional normalized names; optional hash when available.
- [ ] `dedup_plan_and_apply` — Implementation notes:
  - Produce reversible quarantine plan; default dry-run; require explicit confirm to apply.

Optional in this phase:

- [ ] `drive_mode_profile_switch`
- [ ] `eject_and_poweroff_drive`

---

### Phase 3 — Graphics and screen pipelines

- [ ] `extract_sprites_from_ram` — Implementation notes:
  - Search with stride for 63-byte sprite patterns; export `.spr`/hex/base64.
- [ ] `rip_charset_from_ram` — Implementation notes:
  - Locate 2KB charsets by structure; export binary and a PNG preview.
- [ ] `screen_capture_timeline` — Implementation notes:
  - Timed captures; export timestamped log and optional GIF.
- [ ] `sprite_preview_prg_batch` — Implementation notes:
  - Generate+run preview PRGs for many sprite blobs; capture screens.

---

### Phase 4 — SID and audio

- [ ] `silence_and_verify` — Implementation notes:
  - Write SID reset/silence; record short audio; verify threshold.
- [ ] `music_compile_play_analyze` — Implementation notes:
  - Compile SIDWAVE→PRG or SID; play; record; analyze; save JSON.
- [ ] `sid_param_sweep` — Implementation notes:
  - Sweep ADSR/waveform/pulse width; schedule notes; analyze; score.

---

### Phase 5 — Debug stream workflows (post‑GA)

- Prerequisites (must be satisfied before starting this phase):
  - UDP ingest pipeline with backpressure and packet‑loss handling.
  - Sampling/windowing design for high‑rate streams and summary accuracy.
  - Performance targets validated via load and soak tests.
  - Observability and failure‑mode coverage (metrics, logs, alerts, drop counters).
- [ ] `debug_stream_watch` — Implementation notes:
  - Start/stop; summarize rates; enforce mutual exclusion with video stream.
- [ ] `debug_loop_run_and_capture` — Implementation notes:
  - Pause → start debug → resume → action → pause → stop → summarize packets.
  - Support modes: 6510, VIC, 1541; choose minimal scope by default.
- [ ] `verify_raster_irq_line` — Implementation notes:
  - Correlate writes to $D012/$D011 and IRQ ack; configurable tolerance.
- [ ] `debug_trace_until_cpu_write` — Implementation notes:
  - Watch address set; freeze a pre/post window when first write observed.
- [ ] `action_latency_measure` — Implementation notes:
  - Timestamp action issue and first matching event; compute cycles/µs.

Optional follow-ons in this phase (implement after above pass):

- [ ] `verify_irq_jitter`
- [ ] `sid_register_write_profile`
- [ ] `iec_bus_handshake_probe`
- [ ] `time_bounded_trace_around_event`

---

### Phase 6 — Developer and recovery loops

- [ ] `red_green_refactor_loop` — Implementation notes:
  - Iterate: run → capture screen → write_memory fixes → rerun until pass.
- [ ] `multi_range_guardrails` — Implementation notes:
  - Continuously verify invariants; auto-restore from snapshot on violations.
- [ ] `safe_reset_sequence` — Implementation notes:
  - Snapshot select ranges; reset; compare persistence; resume.
- [ ] `drive_recovery_sequence` — Implementation notes:
  - Detect error; reset; power cycle; remount last image; verify.

---

### RAG-coupled meta tools

- [ ] `ask_and_apply_memory_fix` — Implementation notes:
  - Retrieve assembly guidance (RAG), compute targeted writes, then `verify_and_write_memory`.
- [ ] `sprite_program_from_prompt` — Implementation notes:
  - Generate PETSCII/sprite asset from text; preview PRG; capture screen.

---

### Optional follow-ups and experiments

- [ ] `memory_heatmap_over_time`
- [ ] `irq_latency_probe`
- [ ] `sid_voice_stuck_guard`
- [ ] `auto_benchmark_suite`
- [ ] `firmware_compat_matrix`
- [ ] `ultimate_config_migrate`

---

### Per-task Done Definition (LLM must verify before ticking)

- Implementation compiles with no TypeScript errors (where applicable).
- New/updated tests exist and are passing locally.
- `npm run check` passes end-to-end.
- Documentation updated if tool behavior changed.

### How to tick off checkboxes (LLM instructions)

- After completing a checklist item and confirming the Done Definition, update the corresponding `- [ ]` line to `- [x]` in `doc/meta-tools-rollout.md`.
- Only tick one line at a time, from top to bottom, respecting phases and dependencies.
- After ticking, immediately run `npm run check` again to ensure that the documentation update did not break formatting-sensitive scripts.

### Notes on sequencing

- Respect the dependency graph from `doc/meta-tools.md` (Effort/Benefit/Dependencies Matrix).
- Within a phase, process items in order. If an item depends on another not yet done, jump to the dependency’s phase, complete it, then resume.
