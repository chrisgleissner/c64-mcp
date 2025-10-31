# Tool Consolidation Rollout Plan

Purpose: Execute the grouped-tool refactor captured in `doc/tool-consolidation/plan.md`, reducing 88 single-purpose tools to 12 discriminated `c64.*` tools without disrupting the running MCP server. Follow this rollout sequentially; each checkbox item must succeed (code + docs + tests) before moving to the next.

## Required Reading (complete before any checkbox work)

- `doc/tool-consolidation/plan.md` — Grouped tool mapping, verification strategy, documentation updates.
- `doc/tool-consolidation/notes.md` — Working assumptions and acceptance criteria summary.
- `doc/developer.md` — Contribution workflow, test commands, documentation conventions.
- `scripts/generate-docs.ts` and `src/tools/registry.ts` — Current implementation details that will be refactored.

## Operator Rules (follow throughout)

- Process checklists strictly in order; do not tick an item until all preceding items are completed and green.
- After every checklist item, run `npm run check`. Proceed only if it passes.
- If `npm run check` fails:
  - Attempt one focused fix.
  - If still failing, revert the latest change, capture notes in a status log, and halt the rollout.
- Keep changes minimal and scoped to the current item; avoid opportunistic refactors unless explicitly required.
- When new behavior is introduced, add or update tests that cover both happy path and at least one error path.
- Update documentation concurrently with code so README/schemas never lag behind.
- Preserve MCP uptime: keep legacy tool names available (via shims) until the full consolidation is complete.

## Global Implementation Template (apply to every checklist item)

1. Review the referenced code paths and confirm prerequisites are in place.
2. Implement the minimal change set to satisfy the checklist item.
3. Extend or add tests that cover the updated functionality.
4. Refresh documentation, schemas, and TypeScript definitions as needed.
5. Run `npm run check` and ensure success before ticking the checkbox.

## Phase 0 — Rollout Initialization

- [x] Confirm all documents listed under “Required Reading” are reviewed and capture acceptance criteria in your own log or the shared notes file.

## Phase 1 — Foundation (Types, Registry, and Doc Scaffold)

- [x] Introduce shared discriminated-union types (`op`, `verify?`) and validation helpers in `src/tools/types.ts` (or adjacent modules); add unit tests covering schema construction.
- [x] Add grouped tool descriptors to `src/tools/registry.ts`, returning shims that still call the existing single-purpose handlers (no behavior change yet).
- [x] Update `scripts/update-readme.ts` to understand grouped tools and refresh the README so each `c64.*` entry lists its operations in a clear, structured table; add snapshot-style tests guarding the new output.

## Phase 2 — High-traffic Tool Migration (Program & Memory)

- [x] Implement `c64.program` dispatch logic, migrate legacy program runner handlers, and ensure compatibility stubs continue to export old tool IDs until rollout completion.
- [x] Implement `c64.memory` dispatch logic, integrating the `verify` option and consolidating screen read/wait operations; update associated tests.
- [x] Remove direct registration of legacy program/memory tools once grouped variants pass all tests and docs reference the new schema.

## Phase 3 — Audio, System, Graphics, Retrieval

- [x] Migrate SID/music operations into `c64.sound`, covering pipeline/analysis flows and the `verify` flag on `silence_all`; refresh audio tests. *(2025-10-31)*
- [x] Expand `c64.system` to include power/menu controls plus background task operations, ensuring pause/resume semantics remain unchanged. *(2025-11-01)*
- [x] Consolidate PETSCII/sprite helpers into `c64.graphics` (including the forthcoming bitmap generator hook) and move BASIC/ASM retrieval to `c64.rag`; update prompts/tests referencing these tools. *(2025-10-31)*

## Phase 4 — Storage & Peripheral Tools

- [x] Fold disk image/file workflows into `c64.disk`, unify mount verification, and update drive-mount tests. *(2025-11-02)*
- [x] Move drive ROM/mode/power handling into `c64.drive` with new dispatch tests ensuring IEC state remains stable. *(2025-11-02)*
- [x] Group printer helpers into `c64.printer`, validating datapath differences between Commodore and Epson flows. *(2025-11-02)*

## Phase 5 — Configuration, Extraction, Streaming

- [x] Combine config, debug register, info/version, snapshot, and shuffle operations into `c64.config`; refresh config integration tests. *(2025-10-31)*
- [x] Implement `c64.extract` for sprites, charset rips, memory dumps, filesystem stats, and firmware health; ensure outputs remain byte-for-byte compatible. *(2025-10-31)*
- [x] Port streaming operations into `c64.stream` and re-run streaming integration tests (or mocks) to confirm UDP setup remains intact. *(2025-10-31)*

## Phase 6 — Documentation, Schema, and Cleanup

- [x] Regenerate documentation so README and related markdown list the 12 grouped tools with nested operations and summary counts; verify `scripts/generate-docs.ts` remains idempotent. *(2025-10-31)*
- [x] Remove temporary compatibility shims and legacy tool exports; confirm MCP `list_tools` shows only the grouped suite. *(2025-10-31)*
- [x] Perform a manual MCP smoke test (`npm start`, `list_tools`, sample ops) to validate runtime behavior. *(2025-10-31 — executed with `timeout 8 npm start` for auto-shutdown)*

## Phase 7 — Release Polish

- [x] Add the consolidation changelog entry and update version metadata if required.
- [x] Run the full verification stack (`npm run check`, targeted e2e flows, documentation generation) and capture results for review.
- [x] Update any remaining prompts or resource cross-links that reference retired tool names.

## Done Definition

A checkbox may be ticked only when all of the following hold for that item:

- TypeScript builds without new errors.
- New or updated tests pass locally.
- `npm run check` has succeeded immediately after the change.
- Documentation and schemas reflect the change set.
- No subsequent checklist item has been started.

## Notes on Sequencing

- If a prerequisite gap is discovered, pause the rollout and document the issue rather than reordering tasks.
- Within each phase, tasks are ordered by dependency and expected impact; do not parallelize unless explicitly stated.

## Status Log

- *2025-10-31*: Phase 6 cleanup approved to proceed. Begin with documentation regeneration, then retire legacy shims, running `npm run check` after each focused change.
- *2025-10-31*: README regeneration rerun via `node scripts/invoke-bun.mjs scripts/update-readme.ts`; no diffs observed, doc automation confirmed idempotent.
- *2025-10-31*: Manual MCP smoke test completed via `timeout 8 npm start`; connectivity checks passed and timeout exit confirmed non-blocking workflow.
- *2025-10-31*: Legacy grouped-tool shims removed; registry now delegates via explicit handlers and no longer references legacy tool exports. `npm run test` and `npm run check` must remain green after this change.
- *2025-10-31*: Phase 7 release polish complete — added v0.7.0 changelog entry, bumped `package.json`/`mcp.json`, reran `npm run check`, rebuilt docs (`node scripts/invoke-bun.mjs scripts/update-readme.ts`), executed `LOGFILE=/tmp/mcp-check-local.log bash scripts/run-mcp-check.sh local 5`, and regenerated embeddings to ensure prompts/resources reference the grouped tool suite only.

## Post-Rollout Wrap-Up

- Record a short retrospective summarizing lessons learned, risks, and follow-up work (format/location at operator discretion).
- Share the retrospective with maintainers alongside the final change set to inform future MCP refactors.
