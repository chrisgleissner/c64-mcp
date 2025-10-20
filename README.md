# c64-mcp

[![Build](https://img.shields.io/badge/build-npm%20test-brightgreen)](package.json#L7)
[![License: GPL v2](https://img.shields.io/badge/License-GPL%20v2-blue.svg)](https://www.gnu.org/licenses/old-licenses/gpl-2.0.en.html)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey)](doc/developer.md)

Local Model Context Protocol (MCP) server for driving a c64 via the official REST API of either the [Commodore 64 Ultimate](https://www.commodore.net/) or [Ultimate 64](https://ultimate64.com/). It exposes a focused tool surface that lets LLM agents or automation scripts upload BASIC programs, read the video RAM buffer, and reset the machine without manual intervention.

## Highlights
- Fastify-based MCP server running locally on port 8000.
- TypeScript ESM modules throughout; `ts-node` powers the local development flow.
- BASIC text → PRG converter and integrated 6502/6510 assembler with tests.
- Configurable via `~/.c64mcp.json` (or `C64MCP_CONFIG`) so hardware details stay out of source control.
- Built-in local RAG for Commodore 64 BASIC and 6502 assembly examples (no external services).

## Use Cases
- **LLM tooling integration** – expose `upload_and_run_basic`, `read_screen`, and `reset_c64` to MCP-aware agents for program synthesis experiments on real hardware.
- **Continuous integration smoke checks** – run the mock-backed tests (`npm test`) to validate regression changes without powering on the Ultimate.
- **Rapid BASIC iteration** – convert local `.bas` scripts to PRG, upload, and execute with `npm run c64:tool` or the underlying `c64-cli.mjs` commands.
- **Remote debugging** – read the `$0400` screen buffer via REST and display it in your automation pipeline or logs.
- **On-the-fly memory inspection** – use the `read_memory`/`write_memory` tools to dump or patch RAM directly from MCP workflows.

## Installation

Requires Node.js 18+ (20+ recommended) and npm.

- Linux (Ubuntu/Debian)
  ```bash
  sudo apt update
  sudo apt install -y curl ca-certificates
  # Option A: distro packages (may be older)
  sudo apt install -y nodejs npm
  # Option B (recommended): NodeSource LTS (20.x)
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
  ```

- macOS
  ```bash
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" # if Homebrew not installed
  brew install node@20
  brew link --overwrite node@20
  ```

- Windows
  ```powershell
  # Option A: winget (Windows 10/11)
  winget install OpenJS.NodeJS.LTS
  # Option B: Chocolatey
  choco install nodejs-lts -y
  ```

Verify:
```bash
node --version  # v18+ (v20+ recommended)
npm --version
```

## Documentation
- [`AGENTS.md`](AGENTS.md) — Agent integration (MCP clients, Copilot Chat).
- [`doc/developer.md`](doc/developer.md) — Development workflow and architecture.
- [`doc/c64-rest-api.md`](doc/c64-rest-api.md) — c64 REST endpoints summary.
- [`doc/c64-basic-spec.md`](doc/c64-basic-spec.md) — BASIC tokenisation/PRG layout.
- [`doc/c64-openapi.yaml`](doc/c64-openapi.yaml) — OpenAPI 3.1 schema.

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
   The `c64_host` value can be either a hostname (e.g. `c64u`) or an IP address. Save the file as `~/.c64mcp.json`. You can override the path with the `C64MCP_CONFIG` environment variable. If the file is missing, the server first looks for the bundled [`.c64mcp.json`](.c64mcp.json) in the project root, and finally falls back to `http://c64u`.
3. Launch the MCP server:
   ```bash
   npm start
   ```
   The server listens on `http://localhost:8000` by default. Set `PORT` to change the port.

## Agent Integration

Use with GitHub Copilot Chat (MCP) or other MCP clients. See [`AGENTS.md`](AGENTS.md) for setup and examples.

### Local RAG (Retrieval-Augmented Generation)

This server includes a local RAG subsystem that indexes sample Commodore 64 source code from `data/basic_examples/` and `data/assembly_examples/` on startup. It maintains two compact JSON indices at `data/embeddings_basic.json` and `data/embeddings_asm.json` generated using a deterministic, offline embedding model. The index auto-rebuilds when files under `data/` change (polling every `RAG_REINDEX_INTERVAL_MS`, default 15000 ms).

- Programmatic use inside MCP flow: the server uses the retriever to inject relevant examples into prompts. You can also call helper endpoints to validate retrieval:
  - `GET /rag/retrieve?q=<text>&k=3&lang=basic|asm` — returns reference snippets
  - `POST /tools/rag_retrieve_basic` body `{ "q": "your query", "k": 3 }`
  - `POST /tools/rag_retrieve_asm` body `{ "q": "your query", "k": 3 }`

Examples:

```bash
curl -s "http://localhost:8000/rag/retrieve?q=draw%20a%20sine%20wave&k=3&lang=basic" | jq
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"q":"cycle border colors","k":3}' \
  http://localhost:8000/tools/rag_retrieve_asm | jq
```

You can add your own `.bas`, `.asm`, `.s`, or Markdown reference notes (e.g. [`doc/6502-instructions.md`](doc/6502-instructions.md)) anywhere under `data/basic_examples/` and `data/assembly_examples/`. The indexer scans subdirectories recursively and picks up changes automatically.

#### Extending the RAG (external sources)

To add internet sources in a controlled, reproducible way:

1) Edit `src/rag/sources.csv` (columns: `type,description,link,depth`).
2) Fetch (opt-in, no network on builds/tests):
```bash
npm run rag:fetch
```
3) Update the RAG index:
```bash
# either rely on the running server's auto-reindexer (default ~15s), or
npm run rag:rebuild
```

Notes:
- Downloads are stored under `external/` (gitignored) and included in the index alongside `data/*`.
- If you delete files from `external/` and rebuild, their content will be removed from the RAG. To “freeze” current embeddings, avoid rebuilding (e.g., set `RAG_REINDEX_INTERVAL_MS=0`) until you want to refresh.

For advanced options (depth semantics, throttling/limits, adaptive rate limiting, retries, logs, and environment overrides), see the dedicated section in `doc/developer.md`.

## Build & Test
- `npm run build` — type-check the TypeScript sources.
- `npm test` — run the integration tests against an in-process mock that emulates the c64 REST API.
- `npm test -- --real` — exercise the same tests against a real c64 device. The runner reuses your MCP config (`~/.c64mcp.json` or `C64MCP_CONFIG`) to determine the base URL, and falls back to `http://c64u`. You can also override explicitly with `--base-url=http://<host>`.
- `npm run check` — convenience command that runs both the type-check and the mock-backed test suite.

The test runner accepts the following options:
- `--mock` (default): use the bundled mock hardware emulator.
- `--real`: talk to physical hardware (requires reachable c64 device).
- `--base-url=http://host[:port]`: override the REST base URL when running with `--real`.

## Utility Scripts
- `npm run c64:tool` — interactive helper that can:
  - convert a BASIC file to a PRG and store it under `artifacts/` (or a path you choose),
  - convert and immediately run the generated PRG on the configured c64 device,
  - upload an existing PRG and run it on the c64 device.
- `npm run api:generate` — regenerate the typed REST client under `generated/c64/` from [`doc/c64-openapi.yaml`](doc/c64-openapi.yaml).
- Advanced users can call the underlying CLI directly:
  ```bash
  node --loader ts-node/esm scripts/c64-cli.mjs convert-basic --input path/to/program.bas
  node --loader ts-node/esm scripts/c64-cli.mjs run-basic --input path/to/program.bas
  node --loader ts-node/esm scripts/c64-cli.mjs run-prg --input artifacts/program.prg
  ```

Generated binaries are written to the `artifacts/` directory by default (ignored by git) so you can transfer them to real hardware or flash media. Make sure your `~/.c64mcp.json` (or `C64MCP_CONFIG`) points at your c64 device before using the run options.

## Core Tools (selection)
- `POST /tools/upload_and_run_basic`: Convert BASIC to PRG, upload, run.
- `POST /tools/upload_and_run_asm`: Assemble 6502/6510 to PRG, upload, run.
- `POST /tools/upload_and_run_program`: Auto-infer BASIC vs ASM and run.
- `GET /tools/read_screen`: Read `$0400` screen buffer (PETSCII→ASCII).
- `POST /tools/read_memory`, `POST /tools/write_memory`: Inspect/patch RAM.
- `POST /tools/reset_c64`, `POST /tools/reboot_c64`: Control device state.
- `GET /tools/basic_v2_spec`, `GET /tools/asm_quick_reference`: Built-in quick refs.

More system, drive, file, streaming, and SID tools are available. For the full list and parameters, see [`src/mcpManifest.json`](src/mcpManifest.json).

## Minimal CLI interaction

If you want to exercise the MCP endpoints from a terminal, you can call them directly with `curl` (or any HTTP client). Examples:

```bash
# Upload and run HELLO WORLD
curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"program": "10 PRINT \"HELLO\"\n20 GOTO 10"}' \
  http://localhost:8000/tools/upload_and_run_basic | jq

# Fetch the current screen buffer
curl -s http://localhost:8000/tools/read_screen | jq

# Reset or reboot the machine
curl -s -X POST http://localhost:8000/tools/reset_c64
curl -s -X POST http://localhost:8000/tools/reboot_c64
```

Any endpoint listed in [`src/mcpManifest.json`](src/mcpManifest.json) can be invoked the same way by posting JSON to `/tools/<name>`.

## Development Workflow
- Type-check with `npm run build`.
- Run tests with `npm test` (mock) and `npm test -- --real` (hardware).
- Review [`doc/c64-rest-api.md`](doc/c64-rest-api.md) for official REST call details.

## Reference
- REST API docs: [Ultimate 64 REST API](https://1541u-documentation.readthedocs.io/en/latest/api/api_calls.html)
- Local references: see the [Documentation](#documentation) section above.
