# Meta Tools Documentation

This folder contains documentation for c64bridge meta tools — high-level orchestration tools that compose multiple MCP operations into single, stateful workflows.

## Documents

- **[catalog.md](catalog.md)** — Comprehensive catalog of all meta tools with detailed specifications, effort/benefit analysis, and dependency matrix
- **[rollout.md](rollout.md)** — Implementation checklist with phases, dependencies, and done criteria for executing the meta tools rollout
- **[analysis.md](analysis.md)** — Impact analysis and prioritization rationale; explains why tools are ordered as they are based on agent effectiveness
- **[notes.md](notes.md)** — Implementation notes, observations, lessons learned, and technical decisions

## Quick Overview

### What are Meta Tools?

Meta tools reduce round-trips between client and server by bundling multiple REST/MCP calls into single, stateful operations with agent-side state management (snapshots, buffers, registries, etc.).

### Current Status

**Implemented (Phase 0-2a quick wins)**:
- Foundation tools (Phase 0): firmware health checks, screen polling, memory verification, background tasks
- Orchestration (Phase 1): program shuffle, batch assertions, artifact bundling, compile-run-verify cycles
- Quick wins (Phase 2a): find-and-run program by name, silence-and-verify SID output, filesystem stats by extension

**Not Implemented (~60 tools)**: See catalog.md for full list

### Implementation Priority (New Reprioritization)

See [analysis.md](analysis.md) for detailed rationale.

**Phase 2a — Quick Wins** (~3.4 hours, high impact):
1. `find_and_run_program_by_name` — Find and run programs in disk collections
2. `silence_and_verify` — SID testing foundation
3. `filesystem_stats_by_extension` — Understand file collections
4. `music_compile_play_analyze` — Complete music workflow

**Phase 2b — Graphics & Extraction** (~3.3 hours):
- Extract sprites and character sets from RAM
- Reliable drive mounting

**Phase 2c — Advanced Features**: Classification, timelines, parameter sweeps, memory diffing

**Phase 3 — Container Management**: Classify PRG types, deduplication

**Phase 4 — Additional Orchestration**: Developer loops, RAG-coupled tools

**Phase 5 — Debug Streaming** (Post-GA, requires ~72 hours of infrastructure):
- Assembly verification, IRQ validation, bus tracing
- Deferred until UDP ingest pipeline is ready

## Key Insights from Analysis

1. **Filesystem navigation is critical** — Agents struggle to find programs in disk collections; `find_and_run_program_by_name` is the #1 priority
2. **SID testing needs proper silence verification** — Quick win that unblocks music composition
3. **Debug streaming is valuable but complex** — Requires UDP infrastructure; better to ship simpler high-value features first
4. **Graphics extraction has broad appeal** — Sprite/charset extraction enables creative reuse

## For Implementers

Start with [rollout.md](rollout.md) which provides:
- Required reading list
- Operator rules (process strictly in order, run tests after each change)
- Global implementation template
- Phase-by-phase checklists with dependencies

Each meta tool entry includes:
- Priority ranking
- Effort estimate (minutes)
- Benefit level (high/medium/low)
- Dependencies
- Implementation notes
- REST endpoints used

## For Users

See [catalog.md](catalog.md) for:
- Tool purpose and use cases
- Agent-managed state
- Underlying REST/MCP operations
- Expected behavior

## Architecture

Meta tools live in `src/tools/meta/` with submodules:
- `diagnostics.ts` — Health checks, firmware info
- `screen.ts` — Screen polling, text matching
- `memory.ts` — Memory dumps, verification, diffs
- `background.ts` — Background task scheduling
- `filesystem.ts` — File discovery, stats
- `config.ts` — Configuration snapshots
- `program.ts` — Program orchestration
- `artifacts.ts` — Artifact bundling
- `compilation.ts` — Build-test cycles

All meta tools are marked as experimental and exposed through the standard MCP tool registry.

## Related Documentation

- `doc/agent-state-spec.md` — Background task registry specification
- `doc/developer.md` — Architecture overview and contribution guidelines
- `doc/improve-knowledge/` — Similar documentation structure pattern
- `src/tools/meta/` — Implementation source code
