# c64-mcp

[![Build](https://img.shields.io/badge/build-npm%20test-brightgreen)](package.json#L7)
[![License: GPL v2](https://img.shields.io/badge/License-GPL%20v2-blue.svg)](https://www.gnu.org/licenses/old-licenses/gpl-2.0.en.html)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey)](doc/developer.md)

Local Model Context Protocol (MCP) server for driving a c64 via the official REST API of either the [Commodore 64 Ultimate](https://www.commodore.net/) or [Ultimate 64](https://ultimate64.com/). It exposes a focused tool surface that lets LLM agents or automation scripts upload BASIC programs, read the video RAM buffer, and reset the machine without manual intervention.

## Highlights
- Fastify-based MCP server running locally on port 8000.
- TypeScript ESM modules throughout; `ts-node` powers the local development flow.
- BASIC text → PRG converter with byte-level tests and reusable CLI entry points.
- Configurable via `~/.c64mcp.json` (or `C64MCP_CONFIG`) so hardware details stay out of source control.
- Built-in local RAG for Commodore 64 BASIC and 6502 assembly examples (no external services).

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
- [`doc/c64-rest-api.md`](doc/c64-rest-api.md) — Summary of the c64 REST endpoints.
- [`doc/c64-basic-spec.md`](doc/c64-basic-spec.md) — BASIC tokenisation and PRG file layout.
- [`doc/c64-openapi.yaml`](doc/c64-openapi.yaml) — OpenAPI 3.1 description of the REST surface.
 - VIC-II graphics/timing spec via tool: `GET /tools/vic_ii_spec?topic=<filter>` (see Tools below)

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

#### RAG Rebuild Policy

- Default behaviour (from this PR onward): no background reindex and no build-on-start to avoid churn and merge conflicts.
  - Set `RAG_REINDEX_INTERVAL_MS=0` (default) to disable periodic reindex.
  - Omit `RAG_BUILD_ON_START`; the server will load existing indices if present and otherwise operate with empty indexes.
- Opt-in rebuilds:
  - Trigger a one-time on-start rebuild by exporting `RAG_BUILD_ON_START=1`.
  - Or run `npm run rag:rebuild` explicitly to rebuild indices.
- CI recommended settings: `RAG_REINDEX_INTERVAL_MS=0` and do not set `RAG_BUILD_ON_START`.

To minimize diffs, the indexer writes files only when contents change and keeps a stable, sorted record order.

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

## Available Tools
| Tool | Endpoint | Description |
| --- | --- | --- |
| `upload_and_run_basic` | `POST /tools/upload_and_run_basic` | Convert BASIC source to PRG, upload, and execute on the C64. |
| `read_screen` | `GET /tools/read_screen` | Read 1KB starting at `$0400`, convert PETSCII to ASCII, and return the screen buffer. |
| `reset_c64` | `POST /tools/reset_c64` | Trigger a soft reset via the REST API. |
| `reboot_c64` | `POST /tools/reboot_c64` | Request a firmware reboot when a soft reset is insufficient. |
| `read_memory` | `POST /tools/read_memory` | Read arbitrary memory; accepts `address` and `length` in `$HEX`, `%BIN`, or decimal form and returns a hex byte string. |
| `write_memory` | `POST /tools/write_memory` | Write a hex byte sequence (`$AABBCC…`) to any RAM address specified in hex, binary, or decimal. |
| `basic_v2_spec` | `GET /tools/basic_v2_spec?topic=<pattern>` | Retrieve the Commodore BASIC v2 quick spec or search sections by keyword. |
| `asm_quick_reference` | `GET /tools/asm_quick_reference?topic=<pattern>` | Fetch or filter the 6502/6510 assembly quick reference used for fast/machine-code prompts. |
| `vic_ii_spec` | `GET /tools/vic_ii_spec?topic=<pattern>` | VIC-II graphics/timing knowledge including PAL/NTSC geometry, badlines, DMA steals, border windows. |
| `generate_sprite_prg` | `POST /tools/generate_sprite_prg` | Build and run a PRG that displays one sprite from 63 raw bytes (hex/base64); options: `index`, `x`, `y`, `color`, `multicolour`. |
| `render_petscii_screen` | `POST /tools/render_petscii_screen` | Generate and run a BASIC program that clears screen, sets colours, and prints PETSCII text. |

See [`src/mcpManifest.json`](src/mcpManifest.json) for the MCP manifest consumed by ChatGPT and other LLM clients.

## Using with GitHub Copilot in VS Code

GitHub Copilot Chat (version 1.214+) includes native MCP support. To enable C64 MCP integration:

### 1. Enable MCP in Copilot Chat

- Open VS Code and ensure GitHub Copilot Chat extension is installed and signed in
- Open **Settings** → **Extensions** → **GitHub Copilot** → **Chat: Experimental: MCP**
- Enable the **MCP** checkbox
- Restart VS Code

### 2. Configure the C64 MCP Server

Add this configuration to your workspace `.vscode/settings.json`:

```json
{
  "github.copilot.chat.experimental.mcp": {
    "servers": [
      {
        "name": "c64-mcp",
        "url": "http://localhost:8000",
        "manifestPath": "/absolute/path/to/c64-mcp/src/mcpManifest.json",
        "type": "http"
      }
    ]
  }
}
```

**Important:** Replace `/absolute/path/to/c64-mcp/` with the actual absolute path to your c64-mcp project directory.

### 3. Start the MCP Server

```bash
npm start
```

Keep this running - it will log successful connectivity to your c64 device.

### 4. Use MCP Tools in Copilot Chat

Open Copilot Chat in VS Code and use natural language to interact with your C64:

**Example prompts:**

- "Upload and run this BASIC program: `10 PRINT "HELLO WORLD" \n 20 GOTO 10`"
- "Read the current screen content from my C64"
- "Reset my C64"
- "Make the border red by writing to memory address $D020"
- "Write a love message with PETSCII characters"

Copilot will automatically use the appropriate MCP tools (`upload_and_run_basic`, `read_screen`, `reset_c64`, `read_memory`, `write_memory`) to execute your requests on the actual C64 hardware.

## Using with Other MCP Clients

1. Install the [Model Context Protocol desktop bridge](https://github.com/modelcontextprotocol/desktop) or your preferred MCP client.
2. Point the client at `http://localhost:8000` and load `src/mcpManifest.json`.
3. Configure the MCP session to expose the available tools to the LLM.
4. Invoke the tools from your LLM of choice; the server performs REST calls against the configured c64 device.

## Visual Studio Code Walkthrough: “HELLO WORLD”

Step-by-step instructions to upload and run a BASIC program from VS Code:

1. **Start the MCP server**
   ```bash
   npm start
   ```
   Leave it running in a terminal; it logs connectivity to your c64 device (`c64_host`).

2. **Enable Copilot MCP support**
   - GitHub Copilot (versions 1.214 and later) includes the MCP client. Full instructions live in the [official guide](https://code.visualstudio.com/api/extension-guides/ai/mcp).
   - Make sure Copilot Chat is installed and signed in. If Copilot prompts you to enable MCP, accept the prompt; otherwise open Copilot Chat and run `@workspace enable mcp` (or toggle the setting under **Settings → GitHub Copilot → Experimental → MCP Support**).
   - Restart VS Code after enabling. Copilot Chat will expose an **MCP Servers** section in its settings once MCP is active.

3. **Register the local MCP server**
   - In VS Code, open **Settings → GitHub Copilot → Experimental → MCP Servers**.
   - Click **Add Server**, choose **HTTP**.
   - Supply:
     * **Name:** `c64-mcp` (any label works).
     * **Server URL:** `http://localhost:8000`.
     * **Manifest path:** absolute path to `src/mcpManifest.json`.
   - Save. Copilot Chat now lists `c64-mcp`; expand it to run the tools from the chat interface.

4. **Upload and run the BASIC program**
   - In the MCP panel, expand **c64-mcp → Tools**.
   - Click ▶ next to `upload_and_run_basic`.
   - Provide the request body:
     ```json
     {
       "program": "10 PRINT \"HELLO WORLD\"\n20 GOTO 10"
     }
     ```

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
