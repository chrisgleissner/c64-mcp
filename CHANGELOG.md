# Changelog





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
- Documentation under `doc/`, plus `AGENTS.md`, `.github/prompts/*.prompt.md`, and `doc/context/chat.md`.
- GitHub Actions release pipeline and npm packaging configuration.
