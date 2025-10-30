## Meta Tools Rollout Plan for c64bridge

Purpose: Provide a concrete, dependency-aware rollout approach for the meta tools defined in `doc/meta-tools/catalog.md`. This plan gives ordered, checkable task lists and high-level implementation notes. It is written so another LLM can execute the rollout autonomously.

### Required reading

The following documents need to be read and understood before starting the rollout:

- `doc/meta-tools/catalog.md` — Meta tools definitions, effort/benefit/dependencies matrix
- `doc/meta-tools/analysis.md` — Impact analysis and prioritization rationale
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

- [ ] Read the tool’s entry in `doc/meta-tools/catalog.md` and its Effort/Benefit/Dependencies.
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

### Phase 2a — Quick Wins (high-impact, low-effort tools for immediate agent effectiveness)

Rationale: These tools provide maximum value with minimal implementation effort. They enable core agent capabilities: finding programs, composing music, and understanding file collections. See `doc/meta-tools/analysis.md` for detailed impact analysis.

- [x] `find_and_run_program_by_name` — Implementation notes:
  - **Priority #1** — Most requested feature; enables agents to search and run programs from disk collections.
  - Search under a root (including inside `.d64/.d71/.d81/.t64`) for the first program whose filename contains a substring; run it.
  - Supports PRG and CRT, case sensitivity toggle, and optional sort (path order vs. alphabetical).
  - Agent state: recent searches (root, pattern, extensions), last run path.
  - REST: Container-aware GET /v1/files/{root}/**/*:info (wildcards) to discover; if target is inside a container, mount via PUT /v1/drives/{drive}:mount and run via a tiny BASIC loader (upload_and_run_basic) or menu automation; direct PUT /v1/runners:run_prg|:run_crt when file is on the host filesystem.
  - Dependencies: `find_paths_by_name` (✅ implemented)
  - Effort: 45 minutes
- [ ] `silence_and_verify` — Implementation notes:
  - **Priority #2** — Essential foundation for all SID testing; quick win that unblocks music workflows.
  - Silence all voices, then verify via short audio capture that output drops below a threshold.
  - Agent state: threshold, capture window.
  - REST: PUT|POST /v1/machine:writemem (SID reset), optional streams
  - Dependencies: None
  - Effort: 35 minutes
- [ ] `filesystem_stats_by_extension` — Implementation notes:
  - **Priority #3** — Provides context for file operations; helps agents understand collections.
  - Walk all files beneath a root—including files inside disk/tape images—and compute counts and size statistics (total, min, max, mean) per extension.
  - Agent state: cached directory index, prior stats snapshots for trend comparisons.
  - REST: Container-aware GET /v1/files/{root}/**/*:info (wildcards); fallback: mount images and scrape directory via BASIC.
  - Dependencies: None
  - Effort: 35 minutes
- [ ] `music_compile_play_analyze` — Implementation notes:
  - **Priority #4** — Complete music development workflow in one tool; high value for composition.
  - Compile SIDWAVE→PRG or SID, play, then record-and-analyze; export analysis JSON and summary.
  - Agent state: compilation cache, expected score, analysis logs.
  - REST: POST /v1/runners:run_prg or POST /v1/runners:sidplay
  - Dependencies: `silence_and_verify`
  - Effort: 90 minutes

Phase 2a total effort: ~205 minutes (3.4 hours) — High-impact foundation for agent capabilities.

---

### Phase 2b — Graphics & Extraction (medium effort, high value for creative work)

- [ ] `extract_sprites_from_ram` — Implementation notes:
  - **Priority #5** — Extract sprites from running programs for analysis and reuse.
  - Search with stride for 63-byte sprite patterns; export `.spr`/hex/base64.
  - Agent state: candidate heuristics, sprite index mapping, output folder.
  - REST: GET /v1/machine:readmem, optional PUT /v1/machine:pause|resume
  - Dependencies: `memory_dump_to_file` (✅ implemented)
  - Effort: 80 minutes
- [ ] `rip_charset_from_ram` — Implementation notes:
  - **Priority #6** — Extract custom character sets for reuse and font library building.
  - Locate 2KB charsets by structure; export binary and a PNG preview.
  - Agent state: range scan plan, preview images, output paths.
  - REST: GET /v1/machine:readmem, optional PUT /v1/machine:pause|resume
  - Dependencies: `memory_dump_to_file` (✅ implemented)
  - Effort: 75 minutes
- [ ] `drive_mount_and_verify` — Implementation notes:
  - **Priority #7** — Reliable drive mounting with retry logic.
  - Power on if needed; mount; reset; verify via drives list. Retry with backoff.
  - Agent state: retries, final mode, verification snapshot.
  - REST: PUT /v1/drives/{drive}:on, PUT /v1/drives/{drive}:mount, PUT /v1/drives/{drive}:reset, GET /v1/drives
  - Dependencies: `firmware_info_and_healthcheck` (✅ implemented)
  - Effort: 45 minutes

Phase 2b total effort: ~200 minutes (3.3 hours) — Graphics extraction and reliable disk handling.

---

### Phase 2c — Advanced Features (lower priority, implement as needed)

- [ ] `classify_prg_basic_or_mc` — Implementation notes:
  - **Priority #8** — Distinguish BASIC from machine code for better error messages.
  - For a given PRG path (host or inside a container), determine if it is tokenized BASIC or machine code/data using load address and token checks.
  - Agent state: last probe result, token scanner configuration (PAL/NTSC irrelevant here).
  - REST: PUT /v1/runners:load_prg (does not run), GET /v1/machine:readmem (few hundred bytes from load address), optional PUT /v1/machine:reset.
  - Dependencies: None
  - Effort: 45 minutes
- [ ] `screen_capture_timeline` — Implementation notes:
  - **Priority #9** — Record program execution over time.
  - Timed captures; export timestamped log and optional GIF.
  - Agent state: timer, frame store, export settings.
  - REST: GET /v1/machine:readmem (via screen helper), or use MCP read_screen; optional PUT /v1/machine:pause|resume
  - Dependencies: `wait_for_screen_text` (✅ implemented)
  - Effort: 50 minutes
- [ ] `sid_param_sweep` — Implementation notes:
  - **Priority #10** — Advanced SID experimentation tool.
  - Sweep ADSR/waveform/pulse width across ranges; schedule notes, capture audio, and score results.
  - Agent state: sweep matrix, top-N results, audio artifacts.
  - REST: PUT|POST /v1/machine:writemem (via SID registers), POST /v1/runners:sidplay (for sid attachments), optional streams
  - Dependencies: `silence_and_verify`
  - Effort: 90 minutes
- [ ] `create_and_mount_blank_d64` — Implementation notes:
  - **Priority #11** — Create working disks for file operations.
  - Create blank D64; mount; optional BASIC header writer.
  - Agent state: created image metadata.
  - REST: PUT /v1/files/{path}:create_d64, PUT /v1/drives/{drive}:mount
  - Dependencies: `drive_mount_and_verify`
  - Effort: 35 minutes
- [ ] `memory_snapshot_and_diff` — Implementation notes:
  - **Priority #12** — Debug memory changes during program execution.
  - Take two or more snapshots of one or multiple address ranges and produce a diff report (hex and structured JSON with offsets and values).
  - Agent state: named snapshots, diff histories.
  - REST: GET /v1/machine:readmem, PUT /v1/machine:pause, PUT /v1/machine:resume
  - Dependencies: `memory_dump_to_file` (✅ implemented)
  - Effort: 50 minutes
- [ ] `disassemble_ram_region` — Implementation notes:
  - **Priority #13** — Understand machine code in memory.
  - Pause, read region, disassemble 6502 bytes (agent-side disassembler), write labeled listing to disk with optional symbol hints; resume.
  - Agent state: symbol map, disassembly options, output files.
  - REST: PUT /v1/machine:pause, GET /v1/machine:readmem, PUT /v1/machine:resume
  - Dependencies: None
  - Effort: 60 minutes

---

### Phase 3 — Container Classification & Filesystem Management (when advanced filesystem work needed)

- [ ] `container_aware_walk_and_classify` — Implementation notes:
  - Recurse host and container entries; classify BASIC vs PRG-MC via load + read.
  - Agent state: classification cache keyed by content hash and CBM directory entry, per-container manifests.
  - REST: Container-aware GET /v1/files/{root}/**/*:info; for BASIC vs PRG‑MC, either (a) read PRG header bytes if `/files:read` is available, or (b) use PUT /v1/runners:load_prg followed by GET /v1/machine:readmem at the file's load address to inspect tokens; cleanup via PUT /v1/machine:reset.
  - Dependencies: `find_paths_by_name` (✅ implemented)
  - Effort: 60 minutes
- [ ] `dedup_scan` — Implementation notes:
  - Group by size and extension; optional normalized names; optional hash when available.
  - Agent state: size→paths index, optional fingerprint cache, serialized scan manifests.
  - REST: GET /v1/files/{root}/**/*:info (wildcards). Note: content hashing requires a future `/files:read` capability; when absent, tool limits to size/name heuristics.
  - Dependencies: `filesystem_stats_by_extension`
  - Effort: 60 minutes
- [ ] `dedup_plan_and_apply` — Implementation notes:
  - Produce reversible quarantine plan; default dry-run; require explicit confirm to apply.
  - Agent state: quarantine root, manifest of moved paths, rollback map, retention policy.
  - REST: No direct delete/move endpoints today; this tool defaults to dry‑run and plan output. Apply is disabled unless host‑side filesystem integration or future endpoints are configured.
  - Safety guards: dry‑run by default; explicit `apply=true` and `confirm_phrase` required; path allowlist; maximum deletions threshold; quarantine with rollback window; never touches outside allowed roots.
  - Dependencies: `dedup_scan`
  - Effort: 75 minutes

Optional filesystem tools:
- [ ] `sprite_preview_prg_batch` — Generate+run preview PRGs for many sprite blobs; capture screens. (Effort: 60 minutes)
- [ ] `drive_mode_profile_switch` — Set drive mode with ROM load support. (Effort: 40 minutes)
- [ ] `eject_and_poweroff_drive` — Remove image and power off drive. (Effort: 25 minutes)

---

### Phase 4 — Additional Orchestration & Workflows (as needed)

Not yet prioritized. See `doc/meta-tools/catalog.md` for full list of additional meta tools including:
- Storage orchestration (batch_on_assets_apply_tools, etc.)
- Screen/UI automation (menu_navigation_script, wait_for_screen_text extensions)
- Developer loops (red_green_refactor_loop, multi_range_guardrails, safe_reset_sequence, drive_recovery_sequence)
- Streaming workflows (stream_video_for_duration, stream_audio_and_record)
- RAG-coupled tools (ask_and_apply_memory_fix, sprite_program_from_prompt)
- Artifact pipelines (export_directory_listing_via_basic)

These tools remain in the catalog for future implementation based on user demand and feedback.

---

### Phase 5 — Debug Stream Workflows (post‑GA)

**Infrastructure Prerequisites** (must be satisfied before starting this phase):
  - UDP ingest pipeline with backpressure and packet‑loss handling (~40 hours — estimate includes design, implementation, testing)
  - Sampling/windowing design for high‑rate streams and summary accuracy (~8 hours — research and prototyping)
  - Performance targets validated via load and soak tests (~8 hours — test infrastructure and benchmarking)
  - Observability and failure‑mode coverage (metrics, logs, alerts, drop counters) (~16 hours — instrumentation and monitoring setup)
  - **Total infrastructure work: ~72 hours** (estimates based on similar streaming pipeline projects)

**Rationale for Deferral**: Debug streaming tools are extremely valuable for assembly program verification (comparing expected vs actual execution) but require significant infrastructure work. Better to ship high-value, low-complexity features first (Phases 2a-3), then revisit debug streaming as a dedicated infrastructure project.

**High-Value Debug Tools** (implement after infrastructure ready):

- [ ] `debug_stream_watch` — Implementation notes:
  - **Foundation tool** — Start/stop debug streams; summarize packet rates; enforce mutual exclusion with video stream.
  - Agent state: packet counters, idle detection.
  - REST: PUT /v1/streams/debug:start, PUT /v1/streams/debug:stop
  - Dependencies: UDP infrastructure
  - Effort: 55 minutes
- [ ] `debug_loop_run_and_capture` — Implementation notes:
  - **Critical for assembly verification** — Pause → start debug → resume → action → pause → stop → summarize packets.
  - Support modes: 6510, VIC, 1541; choose minimal scope by default.
  - Agent state: host:port, selected mode, rolling buffer, filters (address ranges, R/W, device), last summary.
  - REST: PUT /v1/machine:pause, PUT /v1/streams/debug:start, PUT /v1/machine:resume, [action tool], PUT /v1/machine:pause, PUT /v1/streams/debug:stop
  - Safety: refuse when video stream is active; enforce max duration; auto-stop on packet loss; configurable throttling.
  - Dependencies: `debug_stream_watch`
  - Effort: 80 minutes
- [ ] `verify_raster_irq_line` — Implementation notes:
  - **Essential for graphics programming** — Verify raster IRQ is programmed to a specific line by correlating writes to $D012/$D011 and ensuing IRQ acks; report mismatches.
  - Agent state: expected lines, tolerance for off-by-one conditions.
  - REST: PUT /v1/machine:pause|resume, PUT /v1/streams/debug:start|stop
  - Dependencies: `debug_loop_run_and_capture`
  - Effort: 70 minutes
- [ ] `debug_trace_until_cpu_write` — Implementation notes:
  - **Precise debugging** — Run until a CPU write to an address (or set) is observed; then immediately pause and return a short trace window around the event.
  - Agent state: address watch set, pre/post window sizes, event metadata.
  - REST: PUT /v1/machine:pause, PUT /v1/streams/debug:start, PUT /v1/machine:resume, PUT /v1/machine:pause, PUT /v1/streams/debug:stop
  - Dependencies: `debug_loop_run_and_capture`
  - Effort: 70 minutes
- [ ] `action_latency_measure` — Implementation notes:
  - **Performance measurement** — Measure cycles between issuing an action (e.g., menu_button, write_memory) and the first observed matching bus event; return cycle/µs estimate.
  - Agent state: action timestamp, first-match timestamp, CPU clock assumption (PAL/NTSC option).
  - REST: PUT /v1/machine:pause|resume, PUT /v1/streams/debug:start|stop, PUT /v1/machine:menu_button|:writemem|runners
  - Dependencies: `debug_loop_run_and_capture`
  - Effort: 75 minutes

Optional debug tools (implement after above pass):

- [ ] `verify_irq_jitter` — Measure IRQ handler periodicity. (Effort: 70 minutes)
- [ ] `sid_register_write_profile` — Capture and summarize SID writes. (Effort: 70 minutes)
- [ ] `iec_bus_handshake_probe` — Use 1541 debug mode to capture IEC bus activity. (Effort: 85 minutes)
- [ ] `time_bounded_trace_around_event` — Maintain circular buffer and freeze on predicate match. (Effort: 70 minutes)

Notes:
- Debug stream consumes significant bandwidth and cannot run concurrently with video; tools enforce mutual exclusion and strict time limits.
- Modes supported: 6510, VIC, 6510&VIC, 1541, 6510&1541. Tools select minimal necessary mode for the predicate to reduce load.

---

### Phase 4 — Additional Orchestration & Workflows (moved from original Phase 6, lower priority)

Not yet prioritized; these tools remain in the catalog for future implementation based on user demand:

- [ ] `red_green_refactor_loop` — Iterate: run → capture screen → write_memory fixes → rerun until pass.
- [ ] `multi_range_guardrails` — Continuously verify invariants; auto-restore from snapshot on violations.
- [ ] `safe_reset_sequence` — Snapshot select ranges; reset; compare persistence; resume.
- [ ] `drive_recovery_sequence` — Detect error; reset; power cycle; remount last image; verify.

RAG-coupled meta tools:

- [ ] `ask_and_apply_memory_fix` — Retrieve assembly guidance (RAG), compute targeted writes, then `verify_and_write_memory`.
- [ ] `sprite_program_from_prompt` — Generate PETSCII/sprite asset from text; preview PRG; capture screen.

Optional experiments:

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

- After completing a checklist item and confirming the Done Definition, update the corresponding `- [ ]` line to `- [x]` in `doc/meta-tools/rollout.md`.
- Only tick one line at a time, from top to bottom, respecting phases and dependencies.
- After ticking, immediately run `npm run check` again to ensure that the documentation update did not break formatting-sensitive scripts.

### Notes on sequencing

- Respect the dependency graph from `doc/meta-tools/catalog.md` (Effort/Benefit/Dependencies Matrix).
- Within a phase, process items in order. If an item depends on another not yet done, jump to the dependency’s phase, complete it, then resume.
