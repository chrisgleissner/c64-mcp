# Knowledge Improvement Rollout Plan

Purpose: Execute the prioritized improvements captured in `doc/improve-knowledge/plan.md` so the MCP server delivers better grounding, creative defaults, and structured outputs. This rollout is written for an LLM operator; all tasks must be completed strictly in order with checkboxes ticked sequentially.

## Required Reading (complete before any checkbox work)

- `doc/improve-knowledge/plan.md` — Findings, recommendations, ranked shortlist.
- `doc/developer.md` — Contribution workflow, testing guidance.
- `README.md` (API section) — Current tool/resource surface to validate documentation updates.
- Target source files referenced per recommendation (see sections below).

## Operator Rules (follow for the entire rollout)

- Always process tasks exactly in the order listed. Do not tick a checkbox until all previous boxes in this document are ticked.
- After completing any checklist item, immediately run `npm run check`. Only proceed if it succeeds.
- If `npm run check` fails:
  - Attempt a focused fix once.
  - If still failing, revert the latest change, note the failure in a status log, and stop execution.
- Keep changes minimal and scoped to the current checklist item. Avoid refactors unless explicitly required.
- When implementing new behavior, update or add tests that cover the happy path and at least one failure/edge case.
- Update documentation in the same change when tool surfaces, schemas, or defaults shift.
- Respect hardware-affecting safeguards already in the codebase (pause/resume, timeouts, mutual exclusion).

## Global Implementation Template (apply for each improvement)

For every checklist item below, execute the following sub-steps in order (these sub-steps do not require additional checkboxes but must be followed):

1. Review the cited code paths and confirm dependencies are in place.
2. Draft minimal changes to satisfy the recommendation.
3. Extend or add tests covering the new behavior.
4. Update documentation, schemas, and TypeScript types as required.
5. Run `npm run check` and ensure it passes before ticking the item.

## Phase 0 — Rollout Initialization

- [x] Confirm all documents in “Required Reading” are reviewed and summarize key acceptance criteria from `doc/improve-knowledge/plan.md` in your working notes.

## Phase 1 — Retrieval & Knowledge Grounding (highest-priority shortlist items)

- [x] R1: Implement structured RAG results with URI, origin, and score metadata (`src/tools/rag.ts`, `src/rag/retriever.ts`, `src/rag/indexer.ts`). Ensure responses expose resource URIs compatible with `ReadResource`.
- [x] K1: Expose memory and IO documentation as MCP resources (`src/rag/knowledgeIndex.ts`, `src/mcp-server.ts`, `data/memory/*`, `data/io/*`). Add schema entries if needed.
- [x] K2: Publish SID best-practices as an accessible MCP resource (`data/audio/sid-programming-best-practices.md`, resource registry).

## Phase 2 — Creative Defaults & Validation

- [x] G1: Update `music_generate` defaults to triangle waveform with recommended ADSR profile; document the new “musical expression” preset (`src/tools/audio.ts`, `src/c64Client.ts`, best-practices doc). Preserve options to request legacy pulse behavior.
- [x] T1: Add automated tests verifying the new SID defaults (PAL/NTSC pitch accuracy and ADSR adherence) (`test/audioAnalysis.test.mjs` or adjacent suites).

## Phase 3 — MCP Surface Improvements

- [x] M2: Standardize structured JSON outputs for all program runners, including entry addresses, artifacts, and URIs while retaining human-readable summaries (`src/tools/programRunners.ts`, `src/tools/types.ts`).
- [x] M1: Remove the artificial dependency between `upload_and_run_basic` and `read_screen`, ensuring documentation reflects independent usage (`src/tools/memory.ts`, related docs or schemas).

## Phase 4 — Reproducibility & Packaging

- [ ] S1: Produce a runnable, reproducible container path (Node 20 LTS, non-root user, `npm ci`, `npm start`) updating `Dockerfile` and associated docs.

## Done Definition (before ticking any item)

Only tick a checkbox when all of the following are true for that item:

- TypeScript compilation succeeds with no new errors.
- All new or updated tests pass locally.
- `npm run check` has been executed successfully immediately after the change.
- Relevant documentation and schemas reflect the change.
- No subsequent checklist item has been started.

## Notes on Sequencing

- If a task reveals a missing prerequisite not covered earlier, pause, document the gap, and stop instead of reordering tasks.
- Within each phase, tasks are intentionally ordered by dependency and impact; do not parallelize or skip.

## Post-Rollout Wrap-Up (perform after all checkboxes are ticked)

- Document a short retrospective (location of your choice) summarizing lessons learned, remaining risks, and follow-up candidates that were out of scope.
- Share the retrospective with maintainers alongside the final change set.
