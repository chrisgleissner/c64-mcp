# Changelog


## 0.7.1 - 2025-11-01

- No notable changes in this release.

## 0.7.0 - 2025-11-01

### Features

- Improved LLM tool discovery by consolidating to 12 tools with nested operations
- Upgrade to Node 24

## 0.6.0 - 2025-10-30

### Features

- Expanded ASM crash detection with low-memory, stack, and hardware monitoring plus post-run polling validation.
- Added comprehensive developer guides: sprite and charset workflows, PETSCII style and colour guide, BASIC pitfalls quickref.
- Introduced dynamically generated MCP resources for PETSCII and BASIC references.
- Enhanced RAG system with retrieval diversity, URI mapping, duplicate suppression, and SPDX-based metadata.
- Migrated CI and development tooling to Bun with reproducible Node 20 container workflow.
- Improved program runner outputs, audio generation, and metadata (including PRG and PAL/NTSC tags).
- Added new knowledge resources, developer examples, and improved LLM guidance.

### Bug Fixes

- Updated Docker base to Ubuntu 24.04 and installed Node 20 via `n`.
- Added native build dependencies (build-essential, python3) for Copilot setup.
- Fixed coverage configuration and reporting for Bun.
- Minor test and formatting corrections.

### Refactoring

- Optimized memory access by merging low-memory and screen RAM reads.
- Streamlined test execution and tooling using Bun.

### Documentation

- Reorganized and clarified meta tools, PETSCII, and Copilot documentation.
- Improved PETSCII code accuracy, VIC-II timing notes, and LLM readability.
- Updated rollout documentation for completed phases.
- Clarified Bun and npm compatibility.

### Tests

- Expanded test coverage across knowledge index, PETSCII, sprite workflows, and ASM polling.
- Added structured content and error handling verification.

### Other

- Improved BASIC specification and adjusted coverage targets.

## 0.5.1 - 2025-10-29

### Features

- Modularize meta.ts and add experimental tags (01bc020)
- Implement meta tools phase 1 with comprehensive tests (bc8d1bf)
- Add meta tools module for orchestration (dde23ac)

### Bug Fixes

- Improved docs on MCP server start (58c1bff)
- Use test/tmp folder for tmp test data (bd8d8ae)
- Test no longer tries to create /workspace (695d6a6)

### Refactoring

- Simplify timestamp parsing and formatting (610507e)
- Enhance filesystem tools for container awareness (97f22a5)

### Tests

- Add tests for device, metaModule, and C64Client invalid inputs (2b9c2c5)
- add tests for prompts registry (6578ea2)
- add tests for tools registry (0eed45c)
- hardcode expected MCP resource URIs and enforce min content size (782cf8a)

### Chores

- remove old monolithic meta.ts file (48e13a3)
- exclude coverage reports from git tracking (c53d898)
- sync lockfile after adding date-fns (c6b810d)
- remove tracked .c64bridge tasks.json and ignore state dir (22564b0)

### Other

- use namespaced temp dirs under .tmp-meta-tests/metaModule (82e2904)
- simplify date handling; use Date + date-fns addMilliseconds (536e75a)
- remove backwards-compat code and spec-alignment comments (0b6054c)
- align background task persistence with agent-state-spec (13cd6b7)
- Add agent state spec (31919b0)

## 0.5.0 - 2025-10-26

- No notable changes in this release.

## 0.4.0 - 2025-10-26

### Features

- Migrated to use the MCP SDK
- Improved knowledge base
- Consistent MCP/REST/RAG logs (b7c4172)
- Added chat mode on VS Code
- Improved RAG embeddings (5935f14)

## 0.3.0 - 2025-10-24

### Features

- Use device facade for backend abstraction, e.g. to support Vice(1927ff1)
- Simplify config (d62ab38)
- Add mock backend support and configure c64u base URL (4b3deaa)
- Add devices property to MCP tool options (caf9bbc)

### Bug Fixes

- post-package mcp check (d91e0f4)

### Chores

- Updated embeddings (599bfb5)
- update sample mcp config (154ccfd)
- Build PRs (c637c91)
- Build PRs (5a6cf6d)
- Run CI build on branches (58bb6d1)

## 0.2.5 - 2025-10-24

### Features

- Parallel Docker-based build (172c6d7)

### Chores

- Split package check workflow (240c06f)
- Drop swagger-typescript-api dependency (165ac8b)
- Document mock server helpers (3703cf9)
- Fix package check shell (f2c94ca)
- Harden package verification (a00ac01)
- Renamed GitHub workflow step (47dacb8)

## 0.2.4 - 2025-10-24

### Features

- Add RAG asset copying and runtime resolution (1e4f500)

### Chores

- Remove duplicate sources.csv from package (0e36f23)
- Removed 'post-' prefix from post-package-check.yml (8f700cd)
- add post-package smoke checks (4a15329)

## 0.2.3 - 2025-10-23

### Bug Fixes

- Flexible launcher so npm start works both from source and the published package (3b0ee24)
- load generated client from src during tests (0d78fff)

### Chores

- Remove duplicates from package (f1b9c23)

## 0.2.2 - 2025-10-23

### Chores

- Extend CHANGELOG.md automatically (fc3c5a3)

## 0.2.1 - 2025-10-23

### Added (0.2.1)

- CLI entrypoint `c64bridge` to enable `npx c64bridge` quick start.
- Clear installation paths in README (Quick start with npx, Persistent install with npm, From source).

### Changed (0.2.1)

- Package contents: ensure `mcp.json`, `AGENTS.md`, and `.github/prompts/**` are included in the npm tarball; tighten `files` list.
- Entry point set to `dist/index.js`; README badges refined; section icons adjusted for a more professional look.
- Health check guidance updated to use server `/health` and device `/tools/version`.

### Fixed (0.2.1)

- Post-publish smoke verification: run checks in the installed package directory (avoids false negatives).
- Release badge alignment; documentation touch-ups.

## 0.2.0 - 2025-10-23

### Added (0.2.0)

- Release preparation script (`npm run release:prepare`) to bump versions in `package.json` and `mcp.json` and regenerate `mcp-manifest.json`.
- Auto-generation of `mcp-manifest.json` at build time by scanning `@McpTool` annotations.
- Troubleshooting guide (`doc/troubleshooting-mcp.md`) and expanded documentation for RAG, SID programming, and development workflow.
- RAG discovery pipeline for GitHub sources and refreshed example embeddings.

### Changed (0.2.0)

- README: overhauled highlights, tool descriptions, and structure; relocated Local RAG documentation for clarity.
- Refactor: removed legacy `src/mcpManifest.json` in favor of generated `mcp-manifest.json`; extracted VICE execution into `viceRunner.ts`.

### Tests (0.2.0)

- Verified build emits `dist/mcp-manifest.json` with expected tools; improved mock and real-device testing notes.

## 0.1.0 - 2025-10-22

### Added

- Initial public release of c64bridge MCP server.
- Local RAG subsystem with prebuilt embeddings under `data/`.
- Full tool surface for BASIC/ASM upload, screen/memory access, drives, and SID control.
- Documentation under `doc/`, plus `AGENTS.md`, `.github/prompts/*.prompt.md`, and `data/context/chat.md`.
- GitHub Actions release pipeline and npm packaging configuration.
