# MCP Setup Guide

Step-by-step instructions for installing, configuring, and running the Commodore 64 MCP server with the official Model Context Protocol SDK.

## Audience

This guide targets engineers and advanced users who need to bring the C64 MCP server online, wire it into an MCP-capable client (such as GitHub Copilot Chat), and verify connectivity against either real hardware or the bundled mock server.

## Prerequisites

- Node.js 18 or newer (Node 20 recommended)
- npm (ships with Node)
- Optional: Ultimate 64 or Commodore 64 Ultimate hardware reachable over HTTP
- macOS, Linux, or WSL are fully supported. Windows works when the shell supports stdio transports.

## 1. Install Dependencies

```bash
npm install
```

The install step pulls the MCP SDK, test tooling, and the generated REST client stubs.

## 2. Configure the C64 Endpoint

The server looks for configuration in the following order (first match wins):

1. JSON file referenced by the `C64MCP_CONFIG` environment variable (if the variable is unset, the default path is `~/.c64mcp.json`)
2. `.c64mcp.json` in the repository root
3. Built-in defaults (`http://c64u:80`)

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
npm start
```

`npm start` locates `src/mcp-server.ts`, loads the config, and launches the stdio transport. Successful startup prints:

```text
> c64-mcp@0.3.0 start
> node scripts/start.mjs

Starting c64-mcp MCP server...
[c64u] GET http://192.168.1.64 status=200 bytes=41608 latencyMs=177
Connectivity check succeeded for c64 device at http://192.168.1.64
[c64u] GET /v1/machine:readmem status=200 bytes=1 latencyMs=31
Zero-page probe @ $0000: $00
c64-mcp MCP server running on stdio
```

When TypeScript is unavailable (for example inside a packaged release tarball) use the compiled entry point:

```bash
npm run build
node dist/index.js
```

The npm package also exposes a CLI named `c64-mcp`; `npx c64-mcp` or an installed binary launches the same stdio server.

## 4. Connect an MCP Client

### GitHub Copilot Chat (VS Code)

1. Enable MCP support: Settings > Extensions > GitHub Copilot > Chat > Experimental: MCP.
2. Add the server entry (Command Palette > Preferences: Open Settings (JSON)):

   ```json
   {
     "github.copilot.chat.experimental.mcp": {
       "servers": [
         {
           "name": "c64-mcp",
           "command": "node",
           "args": ["./node_modules/c64-mcp/dist/index.js"],
           "type": "stdio"
         }
       ]
     }
   }
   ```

3. Keep `npm start` or the CLI running in the background.
4. In Copilot Chat, reference tools naturally (for example, "Read the current screen" or "Upload and run this BASIC program").

## 5. Verify Operation

Run the automated test suites against the mock hardware:

```bash
npm test
```

To exercise a real device, ensure your config points at the desired host/port and append `-- --real`:

```bash
npm test -- --real
```

`npm run coverage` captures c8 coverage for CI parity.

## 6. Common Tasks

- Rebuild TypeScript output: `npm run build`
- Regenerate REST client from OpenAPI: `npm run api:generate`
- Refresh RAG embeddings after updating `data/`: `npm run rag:rebuild`
- Smoke test the packaged tarball (used in CI): `npm run verify-package`

## 7. Troubleshooting

- Confirm connectivity logs appear on startup; missing logs indicate the REST endpoint is unreachable.
- If `npm start` exits immediately, ensure Node can locate `ts-node/register` (installed via dev dependencies).
- When GitHub Copilot cannot see tools, restart VS Code after editing MCP settings.
- Additional guidance lives in `doc/troubleshooting-mcp.md`.

## 8. Where to Go Next

- Architecture and contribution details: `doc/developer.md`
- MCP tooling deep dive: `doc/tasks/use-mcp-sdk.md`
- Agent personas and context layering: `AGENTS.md`
- Knowledge base surfaced to LLMs: `data/` markdown files and specs
