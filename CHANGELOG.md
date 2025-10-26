# Changelog







## 0.4.0 - 2025-10-26

### Features

- Updated config (7626e62)
- Updated docs (f674b9d)
- Updated mcp.json (a184b3d)
- Moved RAG docs to developer.md (79be5c3)
- Consistent MCP/REST/RAG logs (b7c4172)
- Added more docs (41220d7)
- migrate control tools (f579acd)
- Added Markdown for low memory map (c14af39)
- migrate sid control tools (15c336f)
- migrate write_memory tool (ef5ee08)
- migrate read_memory tool (62b2339)
- migrate read_screen tool (a1ee50f)
- migrate upload_and_run_asm tool (b0f4371)
- scaffold modular registry (61a2909)
- expose knowledge bundles with metadata (679a1aa)
- Improved language specs (d45fa9e)
- Improved Basic spec (349ce5a)

### Bug Fixes

- Correct README links to documentation (#38) (03f8644)
- Log on stderr (48d4722)
- Log package contents (647839c)
- Verfy package (8555090)
- Remove check for mcp-manifest.json since now exposed at runtime (eedaca5)
- Build all PRs regardless of target branch (68fafbc)
- Clarified prompt types (21e27d7)
- Improved guidelines (2725c4f)
- Improved test times (1f43863)
- Reduce test runtime (4333ed1)
- Added hex codes and assembly example to printer spec (f149e4a)
- Improved printer specs (a4a57de)
- Consistent naming of specs and tools exposing them (8cde9e9)

### Refactoring

- Removed outdated HTTP server (24ccc69)
- Improved RAG (e60e15c)
- Trimmed c64u config to host and port (a41eeca)
- Removed task docs (ddac72c)
- Autogen documentation (4361998)
- Completed all steps (9f53d18)
- Completed step 8.1 (ff1f24b)
- Completed 7.7 (bd382af)
- Remove static MCP manifest generation (6302867)
- Improve CI, docs, and test coverage reporting (b0278ac)
- Finally completed 5.2 (Platform support) (adad470)
- Completed 5.2 (Platform support) (4239bd4)
- Added notes on platform support (2d822b5)
- Completed step 4.9 (581476a)
- Completed step 5.1 (295b6a7)
- Completed step 4.8 (d7b280d)
- Completed step 4.1 (982dfe5)
- Finished step 3.22 (7959c7e)
- Finished step 3.21 (c77c9bb)
- Finished step 3.19 (fcd703a)
- Finished step 3.18 (c699a57)
- Finished step 3.17 (ef1f49d)
- Finished step 3.16 (644990b)
- Finished step 3.15 (235a90c)
- Finished step 3.14 (9c45cab)
- Added Kernal/Basic API specs. Continued refactor. (7e4fe71)
- Completed 3.5 (91806e3)
- Completed step 3.4 (34f672c)
- MCP SDK (step 2 done) (7917f0f)
- MCP SDK (f8360be)
- Improved steps (b2247e8)
- Clean data directory (d30aa42)

### Documentation

- align tracker with expanded plan (bb9a3a9)

### Tests

- Verified REST with MCP tool alignment. Improved tests. (341051f)

### Other

- Improved RAG embeddings (5935f14)
- Proof-read docs (886f731)
- Improved docs (40fca56)
- Added drive spec (1f789c0)

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

- CLI entrypoint `c64-mcp` to enable `npx c64-mcp` quick start.
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

- Initial public release of c64-mcp MCP server.
- Local RAG subsystem with prebuilt embeddings under `data/`.
- Full tool surface for BASIC/ASM upload, screen/memory access, drives, and SID control.
- Documentation under `doc/`, plus `AGENTS.md`, `.github/prompts/*.prompt.md`, and `data/context/chat.md`.
- GitHub Actions release pipeline and npm packaging configuration.
