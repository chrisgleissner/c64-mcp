# Meta Tools Implementation Notes

This document tracks observations, decisions, and learnings from the meta tools rollout.

## Overview

Meta tools are high-level orchestration tools that compose multiple MCP operations into single, stateful workflows. They reduce round-trips between client and server and enable complex agent behaviors.

## Current State (as of 2025-10-30)

### Implemented Tools (12)
- Phase 0 foundations: firmware_info_and_healthcheck, wait_for_screen_text, verify_and_write_memory, background task suite, find_paths_by_name, memory_dump_to_file, config_snapshot_and_restore
- Phase 1 orchestration: program_shuffle, batch_run_with_assertions, bundle_run_artifacts, compile_run_verify_cycle
- Phase 2 quick wins: find_and_run_program_by_name, silence_and_verify, filesystem_stats_by_extension

### File Organization
- Source: `src/tools/meta/` with submodules by domain (diagnostics, screen, memory, background, filesystem, config, program, artifacts, compilation)
- Tests: Integrated into existing test suites, no dedicated meta/ test folder yet
- Docs: **Reorganized into `doc/meta-tools/`** (matching improve-knowledge pattern)

## Documentation Structure

Following the improve-knowledge precedent:
```
doc/meta-tools/
  ├── catalog.md        (formerly meta-tools.md — comprehensive tool definitions)
  ├── rollout.md        (formerly meta-tools-rollout.md — implementation checklist)
  ├── analysis.md       (NEW — impact analysis and prioritization)
  └── notes.md          (this file — observations and decisions)
```

Benefits:
- Cleaner doc/ root folder
- Related documents grouped together
- Easier to find meta tools documentation
- Consistent with improve-knowledge structure

## Prioritization Rationale

### Why Reprioritize?

Original rollout followed dependency order and implementation phases. However, based on actual agent usage patterns, some unimplemented tools would provide much higher value:

1. **Filesystem discovery** — Agents frequently struggle to find programs in disk collections
2. **SID testing** — Current music workflows lack proper silence verification
3. **Graphics extraction** — Users want to analyze and reuse sprites/charsets from programs
4. **Debug streaming** — Highly valuable but requires significant infrastructure

### Decision: High-Impact, Low-Effort First

New approach prioritizes:
- Quick wins (35-45 minute tools with high impact)
- Foundation tools that enable agent creativity (find programs, compose music)
- Tools with clear, testable outcomes
- Deferring infrastructure-heavy work (debug streaming)

See `analysis.md` for detailed impact breakdown.

## Implementation Patterns

### Meta Tool Anatomy

Each meta tool typically:
1. **Composes** existing MCP tools (no direct REST calls when possible)
2. **Maintains state** agent-side (snapshots, buffers, registries)
3. **Provides retry logic** and error recovery
4. **Returns structured results** with metadata and URIs
5. **Respects hardware safeguards** (pause/resume, timeouts, mutual exclusion)

### Testing Strategy

- Unit tests for tool logic (parameter validation, error handling)
- Integration tests with mock C64Client
- No hardware required for CI/CD
- Real hardware testing manual (for now)

### Documentation Requirements

For each implemented tool:
- [ ] Entry in `catalog.md` with full specification
- [ ] Checkbox in `rollout.md` marked complete
- [ ] Tests covering happy path and one failure case
- [ ] Usage examples in tool description
- [ ] Dependencies clearly documented

## Technical Decisions

### Background Tasks Registry

**Decision**: In-memory registry with optional persistence to disk
**Rationale**: Simplicity for MVP; disk persistence can be added later if needed
**Trade-offs**: Tasks lost on restart, but acceptable for experimental features

### Container-Aware Filesystem Tools

**Decision**: Implement discovery that recurses into D64/D71/D81/T64 containers
**Rationale**: C64 programs are often stored in disk images, not loose files
**Implementation**: Use wildcards when firmware supports them; fall back to mount+BASIC scraping when necessary

### Debug Streaming Infrastructure

**Decision**: Defer all debug streaming tools to Post-GA
**Rationale**: Requires UDP ingest, backpressure handling, performance validation (~72 hours of infrastructure work)
**Alternative considered**: Implement basic version with TCP — rejected because packet loss handling is essential
**Next steps**: Plan dedicated infrastructure sprint before tackling Phase 5 debug tools

### File Organization

**Decision**: Keep meta tools in `src/tools/meta/` submodule structure
**Rationale**: 
- Clear separation from core tools
- Easy to mark as experimental/beta
- Modular structure by domain (diagnostics, screen, memory, etc.)
- No impact on MCP tool registration (all tools exposed equally)

**Trade-offs**: Slightly deeper import paths, but better organization

## Lessons Learned

### From Phase 0-1 Implementation

1. **Background tasks are versatile** — Can schedule any tool, not just specific operations
2. **Verification patterns reusable** — verify_and_write_memory pattern applies to many tools
3. **Screen polling essential** — wait_for_screen_text foundation for many workflows
4. **Artifacts bundling popular** — bundle_run_artifacts frequently requested by users

### From Impact Analysis

1. **Filesystem navigation is critical** — Most common agent failure: "I can't find that program"
2. **SID testing needs improvement** — Silence verification missing causes flaky tests
3. **Debug streaming is desirable but complex** — High demand, but infrastructure not ready
4. **Graphics tools have broad appeal** — Sprite/charset extraction enables creative reuse

## Future Considerations

### Potential Improvements

1. **Meta tool composition** — Allow meta tools to call other meta tools
2. **Persistent background tasks** — Survive server restarts
3. **Progress callbacks** — Report progress during long-running operations
4. **Cancellation** — Abort in-progress meta tools gracefully
5. **Dry-run mode** — Preview actions without executing (especially for destructive ops)

### Infrastructure Needs

For debug streaming (Phase 5):
- UDP packet receiver with reassembly
- Backpressure and flow control
- Circular buffer for trace windows
- Packet loss detection and reporting
- Performance benchmarks and load tests
- Observability (metrics, logging, tracing)

### Documentation Gaps

- No architecture diagram for meta tool system
- Limited examples of meta tool composition patterns
- No performance guidelines (when to avoid meta tools)
- Testing best practices not documented

## Open Questions

1. **Should meta tools be separately versioned?** Currently experimental, but what's the graduation criteria?
2. **How to handle breaking changes?** Meta tools compose other tools — cascade impacts?
3. **Rate limiting?** Some meta tools could issue many requests — need throttling?
4. **Observability?** How to monitor meta tool usage and performance in production?

## References

- `catalog.md` — Full meta tool definitions with effort/benefit matrix
- `rollout.md` — Implementation checklist with dependencies
- `analysis.md` — Impact analysis and prioritization rationale
- `doc/improve-knowledge/` — Similar documentation structure pattern
- `doc/agent-state-spec.md` — Background task registry specification
- `src/tools/meta/` — Implementation source code
