# c64-mcp

[![Build](https://img.shields.io/badge/build-npm%20test-brightgreen)](package.json#L7)
[![License: GPL v2](https://img.shields.io/badge/License-GPL%20v2-blue.svg)](https://www.gnu.org/licenses/old-licenses/gpl-2.0.en.html)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey)](doc/developer.md)

Local Model Context Protocol (MCP) server for driving a [Commodore 64 Ultimate](https://www.commodore.net/) or [Ultimate 64](https://ultimate64.com/) via the official REST API. It exposes a focused tool surface that lets LLM agents or automation scripts upload BASIC programs, read the video RAM buffer, and reset the machine without manual intervention.

## Highlights
- Fastify-based MCP server running locally on port 8000.
- TypeScript ESM modules throughout; `ts-node` powers the local development flow.
- BASIC text → PRG converter with byte-level tests and reusable CLI entry points.
- Configurable via `~/.c64mcp.json` (or `C64MCP_CONFIG`) so hardware details stay out of source control.

## Use Cases
- **LLM tooling integration** – expose `upload_and_run_basic`, `read_screen`, and `reset_c64` to MCP-aware agents for program synthesis experiments on real hardware.
- **Continuous integration smoke checks** – run the mock-backed tests (`npm test`) to validate regression changes without powering on the Ultimate.
- **Rapid BASIC iteration** – convert local `.bas` scripts to PRG, upload, and execute with `npm run c64:tool` or the underlying `c64-cli.mjs` commands.
- **Remote debugging** – read the `$0400` screen buffer via REST and display it in your automation pipeline or logs.
- **On-the-fly memory inspection** – use the `read_memory`/`write_memory` tools to dump or patch RAM directly from MCP workflows.

## Prerequisites

You need Node.js 20+ (npm is included). If you are starting from a clean machine:

- **Ubuntu / Debian**
  ```bash
  sudo apt update
  sudo apt install npm
  ```
  This pulls in the distribution Node.js package. If you need a newer runtime, install NodeSource’s 20.x build after this step.

- **macOS**
  ```bash
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" # if Homebrew is not present
  brew install node
  ```

Verify the installation:
```bash
node --version
npm --version
```
The commands should report Node 20.x or newer.

## Documentation
- [`AGENTS.md`](AGENTS.md) — Quick-start guidance for automation agents.
- [`doc/developer.md`](doc/developer.md) — Development environment and workflow details.
- [`doc/c64-rest-api.md`](doc/c64-rest-api.md) — Summary of the Ultimate 64 REST endpoints.
- [`doc/c64-basic-spec.md`](doc/c64-basic-spec.md) — BASIC tokenisation and PRG file layout.
- [`doc/ultimate64-openapi.yaml`](doc/ultimate64-openapi.yaml) — OpenAPI 3.1 description of the REST surface.

## Getting Started
1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/chrisgleissner/c64-mcp.git
   cd c64-mcp
   npm install
   ```
2. (Optional) Create your configuration file (a ready-made sample lives at [`doc/examples/c64mcp.sample.json`](doc/examples/c64mcp.sample.json)):
   ```json
   { "c64_host": "c64u" }
   ```
   The `c64_host` value can be either a hostname (e.g. `c64u`) or an IP address. Save the file as `~/.c64mcp.json`. You can override the path with the `C64MCP_CONFIG` environment variable. If the file is missing, the server defaults to `http://c64u`.
3. Launch the MCP server:
   ```bash
   npm start
   ```
   The server listens on `http://localhost:8000` by default. Set `PORT` to change the port.

## Build & Test
- `npm run build` — type-check the TypeScript sources.
- `npm test` — run the integration tests against an in-process mock that emulates the Ultimate 64 REST API.
- `npm test -- --real` — exercise the same tests against a real C64/Ultimate 64. By default this targets `http://c64u`; override with `--base-url=http://<host>`.
- `npm run check` — convenience command that runs both the type-check and the mock-backed test suite.

The test runner accepts the following options:
- `--mock` (default): use the bundled mock hardware emulator.
- `--real`: talk to physical hardware (requires reachable Ultimate 64).
- `--base-url=http://host[:port]`: override the REST base URL when running with `--real`.

## Utility Scripts
- `npm run c64:tool` — interactive helper that can:
  - convert a BASIC file to a PRG and store it under `artifacts/` (or a path you choose),
  - convert and immediately run the generated PRG on the configured Ultimate 64,
  - upload an existing PRG and run it on the Ultimate 64.
- `npm run api:generate` — regenerate the typed REST client under `generated/ultimate64/` from [`doc/ultimate64-openapi.yaml`](doc/ultimate64-openapi.yaml).
- Advanced users can call the underlying CLI directly:
  ```bash
  node --loader ts-node/esm scripts/c64-cli.mjs convert-basic --input path/to/program.bas
  node --loader ts-node/esm scripts/c64-cli.mjs run-basic --input path/to/program.bas
  node --loader ts-node/esm scripts/c64-cli.mjs run-prg --input artifacts/program.prg
  ```

Generated binaries are written to the `artifacts/` directory by default (ignored by git) so you can transfer them to real hardware or flash media. Make sure your `~/.c64mcp.json` (or `C64MCP_CONFIG`) points at the Ultimate 64 before using the run options.

## Available Tools
| Tool | Endpoint | Description |
| --- | --- | --- |
| `upload_and_run_basic` | `POST /tools/upload_and_run_basic` | Convert BASIC source to PRG, upload, and execute on the C64. |
| `read_screen` | `GET /tools/read_screen` | Read 1KB starting at `$0400`, convert PETSCII to ASCII, and return the screen buffer. |
| `reset_c64` | `POST /tools/reset_c64` | Trigger a soft reset via the REST API. |
| `reboot_c64` | `POST /tools/reboot_c64` | Request a firmware reboot when a soft reset is insufficient. |
| `read_memory` | `POST /tools/read_memory` | Read arbitrary memory; accepts `address` and `length` in `$HEX`, `%BIN`, or decimal form and returns a hex byte string. |
| `write_memory` | `POST /tools/write_memory` | Write a hex byte sequence (`$AABBCC…`) to any RAM address specified in hex, binary, or decimal. |

See [`src/mcpManifest.json`](src/mcpManifest.json) for the MCP manifest consumed by ChatGPT and other LLM clients.

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
- Pair VS Code tasks with the MCP server: keep `npm start` running in an integrated terminal, then use the MCP panel (Model Context Protocol extension) to invoke `upload_and_run_basic` or `read_screen` while editing BASIC snippets. The server will convert, upload, and execute the program against your configured Ultimate without leaving the editor.

## Development Workflow
- Type-check with `npm run build`.
- Update documentation under `doc/` when adding new endpoints or behaviour.
- Review [`doc/c64-rest-api.md`](doc/c64-rest-api.md) for official REST call details.

## Reference
- REST API docs: [Ultimate 64 REST API](https://1541u-documentation.readthedocs.io/en/latest/api/api_calls.html)
- Local references: see the [Documentation](#documentation) section above.
