# Copilot Instructions for c64-mcp

This repository contains a Model Context Protocol (MCP) server that drives Commodore 64 Ultimate hardware (Ultimate 64 / C64 Ultimate) over its REST API. Keep these guidelines in mind for any changes.

## Project Snapshot

- Language & runtime: TypeScript (ESM) targeting Node.js 18+.
- Entry points:
  - Development: `npm start` (ts-node executes `src/index.ts`).
  - Published CLI: `c64-mcp` (imports `dist/index.js`).
- Build pipeline: `npm run build` emits JavaScript into `dist/`, normalizes the layout, and regenerates `mcp-manifest.json` from `@McpTool` annotations.
- Key domains:
  - C64 hardware control (BASIC/ASM upload, screen & memory access, SID, VIC-II).
  - Local RAG over `data/` with embeddings.
  - Fastify server exposing MCP **tools** and **knowledge** endpoints.
- Documentation sources: `README.md`, `doc/` (including SID/BASIC references), `AGENTS.md`, `.github/prompts/*.prompt.md`, and `doc/context/*.md`.

## Coding Standards

- **Test-Driven Development**: write or update tests in `test/` alongside feature work. When fixing bugs, add regression coverage first.
- **KISS & DRY**: keep implementations simple, avoid duplication, and refactor shared logic into helpers when needed.
- **Maintainability**: prefer readable, well-structured code; limit cleverness; include succinct comments only where the intent is not obvious.
- **TypeScript**: use strict typing (strict mode enabled). Leverage type definitions and avoid `any` unless absolutely required.
- **Build Output**: ensure compiled files stay under `dist/` only; never commit generated artifacts outside `dist/` or `documents`.

## Commit Messages & Releases

- Follow Conventional Commits strictly (`type(scope?): concise subject`). Examples: `feat: add SID triangle-wave example`, `fix(rag): handle missing embeddings`, `docs: clarify health checks`.
- Breaking changes must append `!` (e.g., `feat!: remove legacy tool endpoint`).
- These conventions drive automated changelog generation during `npm run release:prepare`, so keep subjects tight and precise.

## Workflow Essentials

- Use `npm run release:prepare -- <semver>` to bump versions in `package.json` / `mcp.json`, regenerate the MCP manifest, and prepend changelog notes distilled from commit history.
- GitHub Actions release workflow publishes on semantic tags (`X.Y.Z`) and runs a post-publish smoke test via npm.
- Provide documentation updates (`doc/`, `README.md`, `CHANGELOG.md`) with user-facing changes.

## Prompts & Personas

- Agent context layers: `doc/context/bootstrap.md` → `AGENTS.md` → `.github/prompts/*.prompt.md` → `doc/context/chat.md` → RAG fetches. Respect existing tone, persona descriptions, and instructions.
- MCP tools reside in `src/index.ts`; regenerate the manifest after adding/modifying tool decorators.

## Review Checklist

1. Tests added/updated and green (`npm test`).
2. `npm run build` cleanly rebuilds (emits `dist/`, `mcp-manifest.json`).
3. Docs amended when user-facing behavior changes.
4. Commit messages are short, clear, and follow Conventional Commits with clear feat/fix/docs/chore/build/style/refactor/test prefixes.
5. Code adheres to TDD mindset, KISS, DRY, and maintainability goals.

Thanks for helping keep the Commodore 64 MCP server robust and user-friendly! 