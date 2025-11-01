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
- [x] M1: Remove the artificial dependency between `upload_run_basic` and `read_screen`, ensuring documentation reflects independent usage (`src/tools/memory.ts`, related docs or schemas).

## Phase 4 — Reproducibility & Packaging

> Implementation guardrails for S1  
> • Base image must be `node:24-bookworm-slim` (or newer 24.x digest) to keep parity with local tooling.  
> • Create a dedicated non-root user (e.g., `bridge`) with home `/app` and run the container as that user.  
> • Copy `package.json`, `package-lock.json`, and `npm ci` during build before adding the rest of the repo to leverage caching.  
> • Switch `WORKDIR` to `/app`, copy the code, and set `CMD ["npm","start"]`.  
> • Ensure the container runs `npm start` without extra flags, reading configuration from env vars.  
> • Update `README.md` (Containers section) and `doc/improve-knowledge/notes.md` with build/run examples (`docker build` / `docker run`).  
> • Validate locally via `docker build` + `docker run --rm c64bridge:dev` before checking the box.

- [x] S1: Produce the reproducible container workflow described above, updating `Dockerfile`, README, and notes so future operators can rebuild and run the MCP server in that container.
- [x] S2: Replace license name and URL with SPDX identifier in structured RAG refs (ensure `origin`, `uri`, `spdxId` fields are present; map when possible) (`src/rag/indexer.ts`, `src/rag/retriever.ts`, `src/tools/rag.ts`).
- [x] D1: Add a concise “What changed” MCP summary to README/resource index after build; link the platform status resource (`README.md`, `src/mcp-server.ts`).
- [x] D2: Cross-link prompts to key resources (SID best-practices, VIC-II, PETSCII/charset quickrefs) for richer in-editor guidance (`src/prompts/registry.ts`).

## Phase 5 — Knowledge Exposure & Retrieval Enhancements

- [x] K3: Add “BASIC pitfalls” quickref and publish as MCP resource; link from BASIC runners (`data/basic/basic-pitfalls.md`, `src/rag/knowledgeIndex.ts`, `src/tools/programRunners.ts`).
- [x] K4: Publish PETSCII/charset quickrefs (char codes, glyph map) as MCP resources; dynamically generate Markdown table from `data/video/character-set.csv` (build-time or runtime) to avoid duplicate sources (`src/rag/knowledgeIndex.ts`).
- [x] K5: Publish VIC-II register quickref as MCP resource and ensure graphics tools reference it (`data/video/vic-spec.md`, `src/tools/graphics.ts`).
- [x] R2: Include bundle/resource URIs in RAG results when matches originate from docs (`src/rag/retriever.ts`, `src/tools/rag.ts`).
- [x] R3: Add retrieval diversity and simple duplicate suppression in top-K (`src/rag/retriever.ts`).
- [x] M5: Add PAL/NTSC-sensitive tags to relevant tools (SID, graphics) to nudge system-awareness (`src/tools/audio.ts`, `src/tools/graphics.ts`).
- [x] M4: Audit remaining tools for validation messages and examples; bring to parity (`src/tools/*`).
- [x] T2: Add e2e test for `rag_retrieve_*` verifying structured refs open via `ReadResource` (`test/rag.test.mjs`).

## Phase 6 — Creative Surface: Graphics & SID Workflows

- [x] G2: Auto-detect or remind PAL/NTSC context for `sid_note_on`; reflect in metadata (`src/c64Client.ts`, `src/tools/audio.ts`).
- [x] G3: Include PRG metadata (entry addresses, bytes) in program runners’ structured outputs (`src/tools/programRunners.ts`).
- [x] G4: Ensure PETSCII structured outputs and docs highlight selected glyphs/codes and miniature preview (`src/tools/graphics.ts`, docs).
- [x] G5: Document PETSCII style presets (contrast, dithering, palette) and link from prompts (`src/prompts/registry.ts`, docs under `data/video/`).
- [ ] G6: Add hires bitmap PRG generator tool and document a minimal usage flow (`src/tools/graphics.ts`, `test/graphicsModule.test.mjs`).
- [x] K6: Add “Sprite & Charset workflows best-practices” document and expose as resource (`data/video/sprite-charset-best-practices.md`, `src/rag/knowledgeIndex.ts`).
- [x] T4: Add PETSCII generation e2e test verifying preview fields and PRG execution (`test/graphicsModule.test.mjs`).
- [x] T5: Add sprite preview PRG test (bytes copied, coords/colour applied, screen captured) (`test/graphicsModule.test.mjs`).

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
