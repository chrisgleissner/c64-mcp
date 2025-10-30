# Copilot Instructions for c64bridge

This repository contains a Model Context Protocol (MCP) server that drives Commodore 64 Ultimate hardware (Ultimate 64 / C64 Ultimate) over its REST API. Keep these guidelines in mind for any changes.

## Project Snapshot

- Language & runtime: TypeScript (ESM) targeting Node.js 18+, with Bun for build and test tooling.
- Entry points:
  - Development: `npm start` (runs via Node, loads `src/mcp-server.ts`).
  - Published CLI: `c64bridge` (imports `dist/index.js`).
- Build pipeline: `bun run build` compiles TypeScript into `dist/`, normalizes the layout, and refreshes README tool/resource tables. No client manifest is required for MCP; `mcp.json` is human-maintained metadata used by packaging.
- Test pipeline: `bun test` runs tests using Bun's native test runner. Use `bun run coverage` for coverage reports.
- Key domains:
  - C64 hardware control (BASIC/ASM upload, screen & memory access, SID, VIC-II).
  - Local RAG over `data/` with embeddings.
  - Only transport is MCP over stdio.
- Documentation sources: `README.md`, `doc/` (including SID/BASIC references), `AGENTS.md`, `.github/prompts/*.prompt.md`, and `data/context/*.md`.

## Coding Standards

- **Test-Driven Development**: write or update tests in `test/` alongside feature work. When fixing bugs, add regression coverage first.
- **Code Coverage**: maintain or improve overall coverage (check `bun run coverage`) which must exceed 80%, but aim for 85%+.
- **KISS & DRY**: keep implementations simple, avoid duplication, and refactor shared logic into helpers when needed.
- **Maintainability**: prefer readable, well-structured code; limit cleverness; include succinct comments only where the intent is not obvious.
- **TypeScript**: use strict typing (strict mode enabled). Leverage type definitions and avoid `any` unless absolutely required.
- **Build Output**: ensure compiled files stay under `dist/` only; never commit generated artifacts outside `dist/` or `documents`.
- **Security**: never commit secrets or credentials; validate all inputs; follow principle of least privilege.

## Commit Messages & Releases

- Follow Conventional Commits strictly (`type(scope?): concise subject`). Examples: `feat: add SID triangle-wave example`, `fix(rag): handle missing embeddings`, `docs: clarify health checks`.
- Breaking changes must append `!` (e.g., `feat!: remove legacy tool endpoint`).
- These conventions drive automated changelog generation during `npm run release:prepare`, so keep subjects tight and precise.

## Workflow Essentials

- Use `npm run release:prepare -- <semver>` to bump versions in `package.json` / `mcp.json`, regenerate the MCP manifest, and prepend changelog notes distilled from commit history.
- GitHub Actions release workflow publishes on semantic tags (`X.Y.Z`) and runs a post-publish smoke test via npm.
- Provide documentation updates (`doc/`, `README.md`, `CHANGELOG.md`) with user-facing changes.
- Build with: `bun run build` (compiles TypeScript, runs postbuild, updates README).
- Test with: `bun test` (runs all tests) or `bun run coverage` (generates coverage reports).
- Development server: `npm start` (uses Node to run the MCP server).

## Prompts & Personas

- Agent context layers: `data/context/bootstrap.md` → `AGENTS.md` → `.github/prompts/*.prompt.md` → `data/context/chat.md` → RAG fetches. Respect existing tone, persona descriptions, and instructions.
- MCP server wiring lives in `src/mcp-server.ts` (imported by `src/index.ts`). No manifest regeneration step is needed; clients discover tools dynamically via MCP.

## Review Checklist

1. Tests added/updated and green (`bun test`).
2. `bun run build` cleanly rebuilds (emits `dist/`).
3. Docs amended when user-facing behavior changes.
4. Commit messages are short, clear, and follow Conventional Commits with clear feat/fix/docs/chore/build/style/refactor/test prefixes.
5. Code adheres to TDD mindset, KISS, DRY, and maintainability goals.
6. Security review: no hardcoded secrets, proper input validation, safe dependencies.

## Task Delegation & Scope

- **Ideal Tasks**: Bug fixes, documentation updates, test coverage improvements, refactoring, adding well-defined features with clear acceptance criteria.
- **Avoid**: High-complexity cross-repository tasks, deep legacy system changes, or tasks requiring extensive domain knowledge not available in context.
- **Issue Structure**: When creating or working on issues, ensure they have:
  - Clear problem description or feature request
  - Specific acceptance criteria
  - Indication of which files/areas are involved
  - Whether tests are required
- **Human Review Required**: All pull requests require human approval. Treat agent contributions like code from a junior developer—review thoroughly, request changes, and iterate.

## Pull Request Guidelines

- Keep PRs focused and minimal—change only what's necessary to address the task.
- Provide clear descriptions explaining what changed and why.
- Link to related issues using GitHub keywords (Fixes #123, Closes #456).
- Ensure CI passes before requesting review.
- Respond to review feedback promptly and professionally.

Thanks for helping keep the Commodore 64 MCP server robust and user-friendly! 

---

## Using MCP with Copilot Chat (and Eager C64 Activation)

Use these rules to ensure Copilot reliably engages the `c64bridge` server when the user asks for C64 work.

- Only transport is stdio; always use it. Ensure the experimental MCP setting is enabled and a server entry exists for `c64bridge` (see `doc/MCP_SETUP.md`). If the server is not running, start it.
- Treat the following as strong routing signals: "c64", "commodore 64", "ultimate 64", "c64u", "vic", "sid", "petscii", "basic v2", "6510".
- When such signals appear, prefer MCP tool usage from `c64bridge` without waiting for the user to select a server.
- If the stdio server is not yet connected, attempt a tool list or a simple no-op like `version`/`info` to trigger activation. If the client cannot start the server automatically, start it (e.g., `npm start` or `node ./node_modules/c64bridge/dist/index.js`).

### Lightweight C64 Chat Mode

- Interpret `/C64` or `/c64` at the beginning of a message as a request to route subsequent steps through the `c64bridge` tools for this turn. Also accept `C64U` and `c64u` as equivalent triggers.
- In C64 mode:
  - Use `upload_and_run_basic` or `upload_and_run_asm` for program execution.
  - Use `read_screen`, `read_memory`, or `write_memory` for inspection or patches.
  - Use SID/VIC helpers (`music_generate`, `sid_note_on`, `render_petscii_screen`, etc.) when relevant.
  - Explain intended tool calls briefly before invoking them.

### Fallback Guidance

- If MCP tooling is unavailable, propose the minimal steps to bring it online:
  1) ensure MCP is enabled in Copilot, 2) add the stdio server entry for `c64bridge`, 3) run `npm start` (uses Node for runtime compatibility).
- Avoid performing destructive actions (reset/reboot/power) without explicit confirmation.

### Example Prompts for Activation

- "Read the current C64 screen" → connect and call `read_screen`.
- "/C64 draw a rectangle using BASIC" → generate BASIC, call `upload_and_run_basic`, then `read_screen`.
- "Play a C major scale on the SID" → call `music_generate`, then `analyze_audio` for verification.
