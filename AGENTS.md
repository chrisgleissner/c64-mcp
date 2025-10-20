# Agent Onboarding

This repository hosts a local MCP server that bridges large language models with Commodore 64 Ultimate hardware.

## Quick Start
- Install dependencies with `npm install`.
- Configure the target device by creating `~/.c64mcp.json` (see `README.md` or `doc/developer.md`). Without it, the server uses the bundled repo-level `.c64mcp.json` (defaults to `c64u`).
- Start the MCP server locally via `npm start`.

## Repository Layout
- `src/` – Fastify entry-point (`index.ts`), Ultimate 64 REST client, BASIC converter, and config loader.
- `test/` – Node test runner suites (`*.test.mjs`) and the mock Ultimate 64 server.
- `scripts/` – Helper CLIs (e.g. `run-tests.mjs` to toggle mock vs real hardware).
- `doc/` – Engineering docs (`c64-rest-api.md`, `c64-basic-spec.md`, `developer.md`, OpenAPI schema).
- `AGENTS.md` & `README.md` – High-level guidance.

## Key Commands
- `npm start` – Run the MCP server with ts-node (listens on `PORT` or `8000`).
- `npm run build` – Type-check TypeScript.
- `npm test` – Execute tests against the in-process mock C64 (`test/mockC64Server.mjs`).
- `npm test -- --real [--base-url=http://host]` – Re-run tests against an actual Ultimate 64 instance.
- `npm run check` – Sequential `build` + `test`.
- `npm run c64:tool` – Interactive helper to turn BASIC into PRG files, upload binaries, and run them on hardware.
- `npm run api:generate` – Regenerate the typed REST client from the OpenAPI spec when endpoints change.
- MCP tools exposed: `upload_and_run_basic`, `read_screen`, `reset_c64`, `reboot_c64`, `read_memory`, and `write_memory`.

## Development Guardrails
- Maintain TypeScript ESM modules; use async/await.
- Avoid introducing additional runtime dependencies without discussing them.
- Keep REST interactions in `src/c64Client.ts` and shared utilities in dedicated modules.
- Update `src/mcpManifest.json` when exposing new tools.
- Follow KISS and DRY principles. Prefer simple, composable solutions over clever ones, and reuse existing helpers before adding new abstractions.
- Consistency matters: match existing patterns, naming conventions, and error handling styles across the codebase.

## Validation Checklist
- Run `npm run build` to type-check.
- Exercise the tool endpoints with `curl` or the MCP Inspector before submitting changes.
- Update documentation (`README.md`, `doc/`) when adding capabilities.
- Ensure the BASIC encoder remains covered by `test/basicConverter.test.mjs`.
- Confirm MCP behaviour with `npm test -- --real` before shipping changes that touch hardware interactions.
- Always run `npm run build` followed by `npm test` (and real hardware tests when applicable) before finalizing any change.
