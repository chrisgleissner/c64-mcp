# MCP Setup Guide

Step-by-step instructions for installing, configuring, and running the Commodore 64 MCP server with the official Model Context Protocol SDK.

## Audience

This guide targets engineers and advanced users who need to bring the C64 Bridge server online, wire it into an MCP-capable client (such as GitHub Copilot Chat), and verify connectivity against either real hardware or the bundled mock server.

## Prerequisites

- Bun 1.3+ (install via `curl -fsSL https://bun.sh/install | bash`)
- Optional: Ultimate 64 or Commodore 64 Ultimate hardware reachable over HTTP
- macOS, Linux, or WSL are fully supported. Windows works when the shell supports stdio transports.

## 1. Install Dependencies

```bash
bun install
```

The install step pulls the MCP SDK and the generated REST client stubs.

## 2. Configure the C64 Endpoint

The server looks for configuration in the following order (first match wins):

1. JSON file referenced by the `C64BRIDGE_CONFIG` environment variable (if the variable is unset, the default path is `~/.c64bridge.json`)
2. `.c64bridge.json` in the repository root
3. Built-in defaults (`host=c64u`, `port=80`)

Recommended configuration file:

```json
{
  "c64u": {
    "host": "c64u",
    "port": 80
  }
}
```

## 3. Run the MCP Server (source tree)

For active development against TypeScript sources:

```bash
bun run start
```

`bun run start` locates `src/mcp-server.ts`, loads the config, and launches the stdio transport. Successful startup prints:

```text
Starting c64bridge MCP server...
[c64u] GET http://192.168.1.64 status=200 bytes=41608 latencyMs=177
Connectivity check succeeded for c64 device at http://192.168.1.64
[c64u] GET /v1/machine:readmem status=200 bytes=1 latencyMs=31
Zero-page probe @ $0000: $00
c64bridge MCP server running on stdio
```

When TypeScript is unavailable (for example inside a packaged release tarball) use the compiled entry point:

```bash
bun run build
bun run dist/index.js
```

The npm package also exposes a CLI named `c64bridge`; `npx c64bridge` or an installed binary launches the same stdio server.

## 4. Connect an MCP Client

### GitHub Copilot Chat (VS Code)

1. Enable MCP support: Settings > Extensions > GitHub Copilot > Chat > Experimental: MCP.
2. Add the server entry (Command Palette > Preferences: Open Settings (JSON)).

   When running from the cloned repository after `npm run build`:

   ```json
   {
     "github.copilot.chat.experimental.mcp": {
       "servers": [
         {
           "name": "c64bridge",
           "command": "node",
           "args": ["./dist/index.js"],
           "type": "stdio"
         }
       ]
     }
   }
   ```

   When using the published npm package instead of the local build:

   ```json
   {
     "github.copilot.chat.experimental.mcp": {
       "servers": [
         {
           "name": "c64bridge",
           "command": "node",
           "args": ["./node_modules/c64bridge/dist/index.js"],
           "type": "stdio"
         }
       ]
     }
   }
   ```

3. Keep `bun run start` or the CLI running in the background.
4. In Copilot Chat, reference tools naturally (for example, "Read the current screen" or "Upload and run this BASIC program").

## 5. Verify Operation

Run the automated test suites against the mock hardware:

```bash
bun test
```

To exercise a real device, ensure your config points at the desired host/port and set an env var:

```bash
C64_TEST_TARGET=real bun test
```

`bun test --coverage` captures LCOV coverage for CI parity.

## 6. Common Tasks

- Rebuild TypeScript output: `bun run build`
- Regenerate REST client from OpenAPI: `bun run api:generate`
- Refresh RAG embeddings after updating `data/`: `bun run rag:rebuild`
- Smoke test the packaged tarball (used in CI): `bun run verify-package`

## 7. Troubleshooting

- Confirm connectivity logs appear on startup; missing logs indicate the REST endpoint is unreachable.
- If `bun run start` exits immediately, ensure your configuration file is resolvable and Bun is on your PATH.
- When GitHub Copilot cannot see tools, restart VS Code after editing MCP settings.
- Additional guidance lives in `doc/troubleshooting-mcp.md`.

## 8. Where to Go Next

- Architecture and contribution details: `doc/developer.md`
- MCP tooling deep dive: `doc/tasks/use-mcp-sdk.md`
- Agent personas and context layering: `AGENTS.md`
- Knowledge base surfaced to LLMs: `data/` markdown files and specs
