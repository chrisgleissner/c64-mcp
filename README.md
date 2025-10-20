# c64-mcp

Local Model Context Protocol (MCP) server for driving a Commodore 64 or Ultimate 64 via the official REST API. It exposes a small set of tools that let LLM agents upload BASIC programs, read the screen buffer, and reset the machine.

## Features
- Fastify-based HTTP server running locally on port 8000.
- TypeScript ESM modules with async/await throughout.
- Minimal, extensible tool surface (upload BASIC, read screen, reset).
- Configured via `~/.c64mcp.json` so credentials never live in source control.

## Getting Started
1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/chrisgleissner/c64-mcp.git
   cd c64-mcp
   npm install
   ```
2. Create your configuration file:
   ```json
   { "c64_ip": "192.168.1.64" }
   ```
   Save it as `~/.c64mcp.json`. You can override the path with the `C64MCP_CONFIG` environment variable.
3. Launch the MCP server:
   ```bash
   npm start
   ```
   The server listens on `http://localhost:8000` by default. Set `PORT` to change the port.

## Available Tools
| Tool | Endpoint | Description |
| --- | --- | --- |
| `upload_and_run_basic` | `POST /tools/upload_and_run_basic` | Convert BASIC source to PRG, upload, and execute on the C64. |
| `read_screen` | `GET /tools/read_screen` | Read 1KB starting at `$0400`, convert PETSCII to ASCII, and return the screen buffer. |
| `reset_c64` | `POST /tools/reset_c64` | Trigger a soft reset via the REST API. |

See `src/mcpManifest.json` for the MCP manifest consumed by ChatGPT and other LLM clients.

## Using with ChatGPT MCP
1. Install the [Model Context Protocol desktop bridge](https://github.com/modelcontextprotocol/desktop) or your preferred MCP client.
2. Point the client at `http://localhost:8000` and load `src/mcpManifest.json`.
3. Configure the MCP session to expose the three tools above to the LLM.
4. Invoke the tools from your LLM of choice; the server performs REST calls against the configured Ultimate 64.

## Visual Studio Code Setup
- Open the project folder in VS Code.
- Enable TypeScript auto build: `Terminal > Run Build Task > tsc: watch - tsconfig.json`.
- Install recommended extensions (TypeScript ESLint, REST Client) for linting and manual endpoint testing.
- Use the built-in `npm` explorer to run `npm start` and `npm run build`.

## Development Workflow
- Type-check with `npm run build`.
- Update documentation under `doc/` when adding new endpoints or behaviour.
- Review `doc/c64-rest-api.md` for official REST call details.

## Reference
- REST API docs: [Ultimate 64 REST API](https://1541u-documentation.readthedocs.io/en/latest/api/api_calls.html)
- Additional notes: `doc/c64-rest-api.md`
