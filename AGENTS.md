# Agent Onboarding

This repository hosts a local MCP server that bridges large language models with Ultimate 64 hardware.

## Quick Start
- Install dependencies with `npm install`.
- Configure the target device by creating `~/.c64mcp.json` (see `README.md`).
- Start the MCP server locally via `npm start`.

## Development Guardrails
- Maintain TypeScript ESM modules; use async/await.
- Avoid introducing additional runtime dependencies without discussing them.
- Keep REST interactions in `src/c64Client.ts` and shared utilities in dedicated modules.
- Update `src/mcpManifest.json` when exposing new tools.

## Validation Checklist
- Run `npm run build` to type-check.
- Exercise the tool endpoints with `curl` or the MCP Inspector before submitting changes.
- Update documentation (`README.md`, `doc/`) when adding capabilities.
