## Meta Tools Catalog for c64bridge (Research Draft)

Purpose: Reduce round-trips and keep richer agent-side state by bundling multiple REST calls into single, stateful meta tools. Each entry lists its intent, agent-managed state, and the underlying Ultimate 64 REST endpoints it composes.

Conventions:
- Endpoint notation: METHOD /v1/<route>[:<command>] (see `doc/rest/c64-rest-api.md`).
- When a meta tool composes MCP tools, these map onto the same REST calls via the `C64Client` facade.
- Agent-managed state includes timers, queues, background tasks, rolling buffers, snapshots, and derived artifacts written to the agent filesystem.

### Memory inspection, capture, and disassembly

- "memory_dump_to_file"
  - Capture a large RAM range in chunks and write to a local file (hex or binary), with optional pause/resume for stability.
  - Agent state: chunking progress, retries, output file path, checksum.
  - REST: GET /v1/machine:readmem, PUT /v1/machine:pause, PUT /v1/machine:resume

- "memory_snapshot_and_diff"
  - Take two or more snapshots of one or multiple address ranges and produce a diff report (hex and structured JSON with offsets and values).
  - Agent state: named snapshots, diff histories.
  - REST: GET /v1/machine:readmem, PUT /v1/machine:pause, PUT /v1/machine:resume

- "verify_and_write_memory"
  - Pause, read current bytes, verify expected pattern, write bytes, read back to confirm, then resume. Fails fast on mismatch.
  - Agent state: expected vs actual buffers, verification report.
  - REST: PUT /v1/machine:pause, GET /v1/machine:readmem, PUT|POST /v1/machine:writemem, PUT /v1/machine:resume

- "watch_memory_until_condition"
  - Poll a region until a predicate matches (e.g., value equals, non-zero, bitmask set), with timeout and sampling period; optional callback tool.
  - Agent state: poll scheduler, condition function, elapsed time.
  - REST: GET /v1/machine:readmem

- "disassemble_ram_region"
  - Pause, read region, disassemble 6502 bytes (agent-side disassembler), write labeled listing to disk with optional symbol hints; resume.
  - Agent state: symbol map, disassembly options, output files.
  - REST: PUT /v1/machine:pause, GET /v1/machine:readmem, PUT /v1/machine:resume

- "trace_code_flow_by_checksums"
  - Periodically hash code ranges, detect self-modifying changes, and log a time series; optional dump on change.
  - Agent state: rolling hashes, change log, thresholds.
  - REST: GET /v1/machine:readmem

### Graphics, sprites, and screen workflows

- "extract_sprites_from_ram"
  - Scan RAM (configured ranges and stride) for likely 63-byte sprite patterns; decode and save each as `.spr`/hex/base64 with coordinates if discoverable.
  - Agent state: candidate heuristics, sprite index mapping, output folder.
  - REST: GET /v1/machine:readmem, optional PUT /v1/machine:pause|resume

- "rip_charset_from_ram"
  - Locate 2 KB character sets (8x8 tiles × 256) by entropy/structure checks; export as binary and preview PNG.
  - Agent state: range scan plan, preview images, output paths.
  - REST: GET /v1/machine:readmem, optional PUT /v1/machine:pause|resume

- "screen_capture_timeline"
  - Capture PETSCII text screen at fixed intervals, producing a time-stamped log and optional GIF assembled from frames (agent-side).
  - Agent state: timer, frame store, export settings.
  - REST: GET /v1/machine:readmem (via screen helper), or use MCP read_screen; optional PUT /v1/machine:pause|resume

- "sprite_preview_prg_batch"
  - For many sprite binaries, generate and run preview PRGs back-to-back; snapshot screen between runs.
  - Agent state: job queue, per-item results, failures.
  - REST: POST /v1/runners:run_prg, GET /v1/machine:readmem (screen), PUT /v1/machine:reset

### Program execution and orchestration

- "program_shuffle"
  - Discover PRG/CRT under a root path, run each for a configurable duration, capture screen, then soft reset and continue.
  - Agent state: iterator cursor, per-program artifacts, time budgets, failure handling.
  - REST: PUT /v1/runners:run_prg, PUT /v1/runners:run_crt, PUT /v1/machine:reset, GET /v1/machine:readmem, GET /v1/files/{path}:info

- "batch_run_with_assertions"
  - Run a list of programs with post-conditions (screen contains text, memory byte equals value, SID silent); abort on first failure or continue-on-error.
  - Agent state: assertions, pass/fail log, junit-like report.
  - REST: PUT /v1/runners:run_prg or :run_crt, GET /v1/machine:readmem, GET /v1/machine:debugreg, optional PUT /v1/machine:pause|resume|reset

- "compile_run_verify_cycle"
  - Assemble/compile source (BASIC/ASM/SIDWAVE), run, then verify via screen and/or audio analysis; archive artifacts.
  - Agent state: build outputs, verification records.
  - REST: POST /v1/runners:run_prg (uploaded PRG), GET /v1/machine:readmem; SID path uses POST /v1/runners:sidplay

- "cold_boot_and_run"
  - Firmware reboot, then run target; used to validate cold-start behavior.
  - Agent state: boot timing, outcomes.
  - REST: PUT /v1/machine:reboot, PUT /v1/runners:run_prg or :run_crt

### Background scheduling and automation

- "start_background_task"
  - Start a named background task that invokes a tool (e.g., read_memory, read_screen, sid_note_on) at a fixed interval for N iterations or indefinitely.
  - Agent state: task registry (id, name, schedule, next-run, last error), persistent across session.
  - REST: Depends on scheduled tool; common: GET /v1/machine:readmem, PUT|POST /v1/machine:writemem, PUT /v1/runners:run_prg, etc.

- "stop_background_task"
  - Stop a task by name/id; supports graceful drain.
  - Agent state: registry update.
  - REST: none (meta only)

- "list_background_tasks"
  - List active and recent tasks with status and next fire time.
  - Agent state: registry enumeration.
  - REST: none (meta only)

- "stop_all_background_tasks"
  - Cancel all active tasks.
  - Agent state: registry update.
  - REST: none (meta only)

### Storage, drives, and filesystem recipes

- "drive_mount_and_verify"
  - Mount an image, power-on if needed, reset drive, and verify state via drive list.
  - Agent state: retries, final mode, verification snapshot.
  - REST: PUT /v1/drives/{drive}:on, PUT /v1/drives/{drive}:mount, PUT /v1/drives/{drive}:reset, GET /v1/drives

- "create_and_mount_blank_d64"
  - Create a blank D64 at path, mount it, and optionally run a BASIC program to write a directory header.
  - Agent state: created image metadata.
  - REST: PUT /v1/files/{path}:create_d64, PUT /v1/drives/{drive}:mount

- "batch_on_assets_apply_tools"
  - For all PRG/CRT/D64 under a root path (wildcards), apply a named sequence of tools with templated args.
  - Agent state: recipe registry, per-asset logs, concurrency window.
  - REST: GET /v1/files/{path}:info (wildcards), PUT /v1/runners:run_prg|:run_crt, PUT /v1/drives/{drive}:mount

- "drive_mode_profile_switch"
  - Set drive to 1541/1571/1581, reset, and verify; optional ROM load before switching.
  - Agent state: selected profile, last mode.
  - REST: PUT /v1/drives/{drive}:load_rom, PUT /v1/drives/{drive}:set_mode, PUT /v1/drives/{drive}:reset

- "eject_and_poweroff_drive"
  - Remove image and power off selected drive slot.
  - Agent state: last known image, slot state.
  - REST: PUT /v1/drives/{drive}:remove, PUT /v1/drives/{drive}:off

### Filesystem discovery and deduplication

- "find_and_run_program_by_name"
  - Search under a root for the first program whose filename contains a substring; run it. Supports PRG and CRT, case sensitivity toggle, and optional sort (path order vs. alphabetical).
  - Agent state: recent searches (root, pattern, extensions), last run path.
  - REST: GET /v1/files/{root}/**/*{substring}*.{prg|crt}:info (wildcards), PUT /v1/runners:run_prg, PUT /v1/runners:run_crt

- "filesystem_stats_by_extension"
  - Walk all files beneath a root and compute counts and size statistics (total, min, max, mean) per extension, with convenience rollups for PRG vs non‑PRG and per‑folder summaries.
  - Agent state: cached directory index, prior stats snapshots for trend comparisons.
  - REST: GET /v1/files/{root}/**/*:info (wildcards)

- "find_paths_by_name"
  - Return fully qualified device paths for files whose names contain a substring; optional extension filter and max results.
  - Agent state: result caches with TTL and last search parameters.
  - REST: GET /v1/files/{root}/**/*{substring}*{.{ext}}:info (wildcards)

- "run_copy_move_delete_by_path"
  - Execute a batch of file operations addressed by fully qualified paths. Operations: run (PRG/CRT), copy, move, delete. Supports dry‑run planning and per‑op guards.
  - Agent state: audit log of planned/applied ops, allowlist/denylist of roots, optional quarantine path for deletes.
  - REST: Run → PUT /v1/runners:run_prg|:run_crt; Copy/Move/Delete → not exposed in current API (host‑side or future firmware endpoints). When unavailable, tool returns a plan and no‑ops unless host mapping is configured.

- "dedup_scan"
  - Discover duplicate files under a root using a tiered strategy: (1) group by size and extension; (2) optional filename normalization; (3) optional content fingerprint when available. Produces groups of candidate duplicates.
  - Agent state: size→paths index, optional fingerprint cache, serialized scan manifests.
  - REST: GET /v1/files/{root}/**/*:info (wildcards). Note: content hashing requires a future `/files:read` capability; when absent, tool limits to size/name heuristics.

- "dedup_plan_and_apply"
  - From a dedup scan, create a reversible plan that keeps one canonical file per group and quarantines the rest. Apply step moves duplicates into a timestamped quarantine directory; final deletion is an explicit, separate step.
  - Agent state: quarantine root, manifest of moved paths, rollback map, retention policy.
  - REST: No direct delete/move endpoints today; this tool defaults to dry‑run and plan output. Apply is disabled unless host‑side filesystem integration or future endpoints are configured.
  - Safety guards: dry‑run by default; explicit `apply=true` and `confirm_phrase` required; path allowlist; maximum deletions threshold; quarantine with rollback window; never touches outside allowed roots.

### SID, music, and audio analysis

- "sid_param_sweep"
  - Sweep ADSR/waveform/pulse width across ranges; schedule notes, capture audio, and score results by analysis.
  - Agent state: sweep matrix, top-N results, audio artifacts.
  - REST: PUT|POST /v1/machine:writemem (via SID registers), POST /v1/runners:sidplay (for sid attachments), optional streams

- "music_compile_play_analyze"
  - Compile SIDWAVE→PRG or SID, play, then record-and-analyze; export analysis JSON and summary.
  - Agent state: compilation cache, expected score, analysis logs.
  - REST: POST /v1/runners:run_prg or POST /v1/runners:sidplay

- "silence_and_verify"
  - Silence all voices, then verify via short audio capture that output drops below a threshold.
  - Agent state: threshold, capture window.
  - REST: PUT|POST /v1/machine:writemem (SID reset), optional streams

### Streaming and monitoring

- "stream_video_for_duration"
  - Start video stream to host:port for a fixed duration; stop and record timing.
  - Agent state: timer, destination, failure logs.
  - REST: PUT /v1/streams/video:start, PUT /v1/streams/video:stop

- "stream_audio_and_record"
  - Start audio stream, run program, keep stream for N seconds, then stop; optionally run analysis afterward.
  - Agent state: chained schedule (start→run→stop), record path.
  - REST: PUT /v1/streams/audio:start, PUT /v1/streams/audio:stop, PUT /v1/runners:run_prg|:sidplay

- "debug_stream_watch"
  - Start debug stream, collect diagnostic packets, and summarize rates; auto-stop on idle.
  - Agent state: packet counters, idle detection.
  - REST: PUT /v1/streams/debug:start, PUT /v1/streams/debug:stop

#### Debug stream–based feedback loops

- "debug_loop_run_and_capture"
  - Pause → start debug stream → resume → perform action (tool callback) → wait window or until condition → pause → stop stream → parse and summarize packets.
  - Agent state: host:port, selected mode (6510/VIC/1541), rolling buffer, filters (address ranges, R/W, device), last summary.
  - REST: PUT /v1/machine:pause, PUT /v1/streams/debug:start, PUT /v1/machine:resume, [action tool], PUT /v1/machine:pause, PUT /v1/streams/debug:stop
  - Safety: refuse when video stream is active; enforce max duration; auto-stop on packet loss; configurable throttling.

- "debug_trace_until_cpu_write"
  - Run until a CPU write to an address (or set) is observed; then immediately pause and return a short trace window around the event.
  - Agent state: address watch set, pre/post window sizes, event metadata.
  - REST: PUT /v1/machine:pause, PUT /v1/streams/debug:start, PUT /v1/machine:resume, PUT /v1/machine:pause, PUT /v1/streams/debug:stop

- "verify_irq_jitter"
  - Measure IRQ handler periodicity by detecting writes to $D019 (IRQ ack) or reads/writes around vector/$0314; compute intervals and jitter vs. threshold.
  - Agent state: target addresses, acceptable jitter, histogram of deltas.
  - REST: PUT /v1/machine:pause|resume, PUT /v1/streams/debug:start|stop

- "verify_raster_irq_line"
  - Verify raster IRQ is programmed to a specific line by correlating writes to $D012/$D011 and ensuing IRQ acks; report mismatches.
  - Agent state: expected lines, tolerance for off-by-one conditions.
  - REST: PUT /v1/machine:pause|resume, PUT /v1/streams/debug:start|stop

- "iec_bus_handshake_probe"
  - Use 1541 debug mode to capture ATN/CLOCK/DATA activity during a load/save; verify protocol phases and timings.
  - Agent state: phase detector, timing thresholds, pass/fail report.
  - REST: PUT /v1/machine:pause|resume, PUT /v1/streams/debug:start|stop (1541 mode), optional PUT /v1/runners:load_prg|:run_prg

- "sid_register_write_profile"
  - Capture and summarize writes to $D400–$D418 (SID) to verify gates, ADSR and waveform updates; report per-voice rates and anomalies.
  - Agent state: address filters, per-register counters, time-bucketed stats.
  - REST: PUT /v1/machine:pause|resume, PUT /v1/streams/debug:start|stop

- "action_latency_measure"
  - Measure cycles between issuing an action (e.g., menu_button, write_memory) and the first observed matching bus event; return cycle/µs estimate.
  - Agent state: action timestamp, first-match timestamp, CPU clock assumption (PAL/NTSC option).
  - REST: PUT /v1/machine:pause|resume, PUT /v1/streams/debug:start|stop, PUT /v1/machine:menu_button|:writemem|runners

- "time_bounded_trace_around_event"
  - Maintain a circular buffer of debug entries and freeze it when a predicate matches (address, R/W, data mask); export the pre/post window.
  - Agent state: predicate, buffer size, captured window.
  - REST: PUT /v1/machine:pause|resume, PUT /v1/streams/debug:start|stop

Notes:
- Debug stream consumes significant bandwidth and cannot run concurrently with video; tools enforce mutual exclusion and strict time limits.
- Modes supported: 6510, VIC, 6510&VIC, 1541, 6510&1541. Tools select minimal necessary mode for the predicate to reduce load.

### Configuration and diagnostics bundles

- "config_snapshot_and_restore"
  - Read all categories, persist a JSON snapshot; restore later via batch update.
  - Agent state: snapshot store (versioned), diff reports.
  - REST: GET /v1/configs, GET /v1/configs/{category}, POST /v1/configs (batch), PUT /v1/configs:save_to_flash|:load_from_flash

- "firmware_info_and_healthcheck"
  - Fetch version and info, run zero-page read probe, and produce a readiness report.
  - Agent state: probe outcomes, latency metrics.
  - REST: GET /v1/version, GET /v1/info, GET /v1/machine:readmem

- "safe_reset_sequence"
  - Pause, snapshot select RAM ranges, soft reset, verify ranges known to persist (or not), and resume.
  - Agent state: before/after snapshots, persistence metrics.
  - REST: PUT /v1/machine:pause, GET /v1/machine:readmem, PUT /v1/machine:reset, PUT /v1/machine:resume

### High-level screen and UI assertions

- "wait_for_screen_text"
  - Poll screen until a regex/text appears or timeout; return matched region and timestamp.
  - Agent state: screen sampling schedule, regex cache.
  - REST: GET /v1/machine:readmem (screen RAM)

- "menu_navigation_script"
  - Send menu button toggles with delays, capturing screens between steps; export a chronicle.
  - Agent state: scripted steps, captures.
  - REST: PUT /v1/machine:menu_button, GET /v1/machine:readmem

### Developer loops and QA harnesses

- "red_green_refactor_loop"
  - Run program → capture screen → apply write_memory fixups → rerun and compare; stop when assertion passes.
  - Agent state: assertion, iteration counter, diffs.
  - REST: PUT /v1/runners:run_prg, GET /v1/machine:readmem, PUT|POST /v1/machine:writemem, PUT /v1/machine:reset

- "multi_range_guardrails"
  - Enforce invariant constraints across several memory regions (e.g., IRQ vector unchanged); if violated, auto-restore from snapshot.
  - Agent state: invariant set, restore buffers.
  - REST: GET /v1/machine:readmem, PUT|POST /v1/machine:writemem

- "drive_recovery_sequence"
  - Detect drive error, then reset, power cycle, remount last image, and verify.
  - Agent state: last-known drive config, retries, backoff.
  - REST: PUT /v1/drives/{drive}:reset, PUT /v1/drives/{drive}:off, PUT /v1/drives/{drive}:on, PUT /v1/drives/{drive}:mount, GET /v1/drives

### RAG-coupled meta tools (knowledge + action)

- "ask_and_apply_memory_fix"
  - Retrieve assembly guidance (RAG), compute targeted writes, then apply verify_and_write_memory.
  - Agent state: retrieved refs, decision trace, applied edits.
  - REST: GET /v1/machine:readmem, PUT|POST /v1/machine:writemem

- "sprite_program_from_prompt"
  - Generate PETSCII/sprite from text prompt, upload preview PRG, and capture screen for report.
  - Agent state: prompt, generated assets, screen capture.
  - REST: POST /v1/runners:run_prg, GET /v1/machine:readmem

### Artifact pipelines (exports and reports)

- "export_directory_listing_via_basic"
  - Run a tiny BASIC that prints disk directory; scrape screen pages into a single directory listing, write to disk.
  - Agent state: pagination state, parsed entries.
  - REST: PUT /v1/runners:run_prg, GET /v1/machine:readmem

- "bundle_run_artifacts"
  - For any run, collect screen capture, memory snapshot, debugreg, and tool logs into a single folder/tarball.
  - Agent state: run session id, paths.
  - REST: GET /v1/machine:readmem, GET /v1/machine:debugreg

---

## Additional ideas (brief)

- "memory_heatmap_over_time": periodical reads of ranges, visualize write frequency (GET /v1/machine:readmem).
- "irq_latency_probe": run tiny PRG that toggles debug/colour and sample with debug stream; compute jitter (streams + run_prg).
- "sid_voice_stuck_guard": watchdog that issues sid_note_off for lingering gates (writemem to SID regs).
- "auto_benchmark_suite": run set of PRGs with timing reads from zero-page timers (run_prg + readmem).
- "firmware_compat_matrix": try features and record which endpoints function on current hardware (GET/PUT variety).
- "ultimate_config_migrate": snapshot on device A and batch apply to device B (GET /v1/configs, POST /v1/configs).

---

## Notes on composition with existing MCP tools

These meta tools build atop existing MCP tools which already wrap the REST surface:
- Memory: `read_memory`, `write_memory`, `read_screen`
- Programs: `upload_and_run_basic`, `upload_and_run_asm`, `run_prg_file`, `load_prg_file`, `run_crt_file`
- Machine control: `reset_c64`, `reboot_c64`, `pause`, `resume`, `menu_button`, `debugreg_read`, `debugreg_write`
- Storage: `drives_list`, `drive_mount`, `drive_remove`, `drive_reset`, `drive_on`, `drive_off`, `drive_mode`, `file_info`, `create_d64|d71|d81|dnp`
- Audio/SID: `sid_volume`, `sid_reset`, `sid_note_on`, `sid_note_off`, `sid_silence_all`, `sidplay_file`, `modplay_file`, `music_generate`, `music_compile_and_play`, `record_and_analyze_audio`, `analyze_audio`
- Streaming: `stream_start`, `stream_stop`
- Developer/Config: `version`, `info`, `config_list|get|set|batch_update|load_from_flash|save_to_flash|reset_to_default`

By bundling these into single, parameterized meta tools with agent-side scheduling and state, the agent can execute complex workflows with one invocation, reducing latency and improving determinism.
