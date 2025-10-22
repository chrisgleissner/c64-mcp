# c64-mcp

[![Build](https://img.shields.io/github/actions/workflow/status/chrisgleissner/c64-mcp/release.yml?label=release)](https://github.com/chrisgleissner/c64-mcp/actions)
[![npm](https://img.shields.io/npm/v/c64-mcp.svg)](https://www.npmjs.com/package/c64-mcp)
[![Build](https://img.shields.io/badge/build-npm%20test-brightgreen)](package.json#L7)
[![License: GPL v2](https://img.shields.io/badge/License-GPL%20v2-blue.svg)](https://www.gnu.org/licenses/old-licenses/gpl-2.0.en.html)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey)](doc/developer.md)

Model Context Protocol (MCP) server for driving a Commodore 64 via the official REST API of either the [Commodore 64 Ultimate](https://www.commodore.net/) or [Ultimate 64](https://ultimate64.com/). It exposes a focused tool surface that lets LLM agents or automation scripts upload and run BASIC or assembly programs on the C64, read or write its RAM, control the VIC or SID, print documents, or perform a reset.

## Highlights

- **Code** with AI support in Basic or Assembly on a C64.
- **Compose** music or create images on a C64 using AI.
- **Custom Knowledge Base**: Built-in local [RAG](https://en.wikipedia.org/wiki/Retrieval-augmented_generation) for Commodore 64 BASIC and 6502 assembly examples (no external services).
- **Offline-ready** npm package: The published npm artifact includes all necessary docs and RAG embeddings. After `npm install c64-mcp`, the server runs locally without network access to fetch docs or embeddings, e.g. for use with a locally started [Ollama](https://github.com/ollama/ollama)-based LLM.
- **Configurable** via `~/.c64mcp.json` (or `C64MCP_CONFIG`) to point to your C64's host name or IP address.
- **TypeScript** ESM modules throughout: `ts-node` powers the local development flow and exposes a Fastify-based MCP server running on your local machine on port 8000.

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

```

## Documentation

- [`AGENTS.md`](AGENTS.md) — Quick-start guidance for automation agents and persona definitions.
- [`doc/context/bootstrap.md`](doc/context/bootstrap.md) — Core primer injected ahead of agent prompts.
- `.github/prompts/*.prompt.md` — Request templates surfaced to agents (see `src/context.ts`).
- [`doc/developer.md`](doc/developer.md) — Development environment and workflow details.
- [`doc/c64-rest-api.md`](doc/c64-rest-api.md) — Summary of the c64 REST endpoints.
- [`doc/c64-basic-spec.md`](doc/c64-basic-spec.md) — BASIC tokenisation and PRG file layout.
- [`doc/c64-openapi.yaml`](doc/c64-openapi.yaml) — OpenAPI 3.1 description of the REST surface.
  - VIC-II graphics/timing spec via tool: `GET /tools/vic_ii_spec?topic=<filter>` (see Tools below)

**Note:** `mcp.json` is the human-maintained project configuration (entry point, env vars, metadata). The tool manifest consumed by MCP clients lives at `dist/mcp-manifest.json` and is regenerated via `npm run manifest` or `npm run build`. Avoid editing the generated manifest by hand.

## Getting Started

1. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/chrisgleissner/c64-mcp.git
   cd c64-mcp
   npm install
   ```

   **Audio Analysis Dependencies**: For audio feedback capabilities (automatic verification of generated SID music), the following optional dependencies are installed:

   - `meyda` - Audio feature extraction for frequency analysis
   - `pitchfinder` - Pitch detection algorithms
   - `naudiodon` - Audio I/O via PortAudio (requires system audio libraries)

   On Linux, you may need to install PortAudio development headers:

   ```bash
   sudo apt install libportaudio2-dev  # Ubuntu/Debian
   sudo yum install portaudio-devel    # CentOS/RHEL
   ```

   On macOS with Homebrew:

   ```bash
   brew install portaudio
   ```

   **Note**: Audio analysis is optional. If these dependencies fail to install, the server will still function normally but audio verification features will be unavailable.

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
   The server binds to `127.0.0.1` by default for safety. Override with `HOST=127.0.0.1` if needed.

## Agent Integration

Use with GitHub Copilot Chat (MCP) or other MCP clients. See [`AGENTS.md`](AGENTS.md) for setup and examples.

## Build & Test

- `npm run build` — type-check the TypeScript sources and generate `dist/mcp-manifest.json` by scanning `@McpTool` annotations.
- `npm test` — run the integration tests against an in-process mock that emulates the c64 REST API.
- `npm test -- --real` — exercise the same tests against a real c64 device. The runner reuses your MCP config (`~/.c64mcp.json` or `C64MCP_CONFIG`) to determine the base URL, and falls back to `http://c64u`. You can also override explicitly with `--base-url=http://<host>`.
- `npm run check` — convenience command that runs both the type-check and the mock-backed test suite.

The test runner accepts the following options:

- `--mock` (default): use the bundled mock hardware emulator.
- `--real`: talk to physical hardware (requires reachable C64 device).
- `--base-url=http://host[:port]`: override the REST base URL when running with `--real`.

## Available Tools

Here is an overview of some of the most important tools. To see all available tools, have a look at the auto-generated [`dist/mcp-manifest.json`](dist/mcp-manifest.json) which is consumed by ChatGPT and other LLM clients.


### Control

| Tool | Endpoint | Description |
| --- | --- | --- |
| `read_screen` | `GET /tools/read_screen` | Read 1KB starting at `$0400`, convert PETSCII to ASCII, and return the screen buffer. |
| `read_memory` | `POST /tools/read_memory` | Read arbitrary memory; accepts `address` and `length` in `$HEX`, `%BIN`, or decimal form and returns a hex byte string. |
| `write_memory` | `POST /tools/write_memory` | Write a hex byte sequence (`$AABBCC…`) to any RAM address specified in hex, binary, or decimal. |
| `reset_c64` | `POST /tools/reset_c64` | Trigger a soft reset via the REST API. |
| `reboot_c64` | `POST /tools/reboot_c64` | Request a firmware reboot when a soft reset is insufficient. |

### Basic

| Tool | Endpoint | Description |
| --- | --- | --- |
| `basic_v2_spec` | `GET /tools/basic_v2_spec?topic=<pattern>` | Retrieve the Commodore BASIC v2 quick spec or search sections by keyword. |
| `upload_and_run_basic` | `POST /tools/upload_and_run_basic` | Convert BASIC source to PRG, upload, and execute on the C64. |

### Assembly

| Tool | Endpoint | Description |
| --- | --- | --- |
| `asm_quick_reference` | `GET /tools/asm_quick_reference?topic=<pattern>` | Fetch or filter the 6502/6510 assembly quick reference used for fast/machine-code prompts. |
| `upload_and_run_asm` | TODO | Assemble 6502/6510 source to PRG and run it on the C64. |

### SID (Audio)

| Tool | Endpoint | Description |
| --- | --- | --- |
| `music_compile_and_play` | TODO | Compile a SIDWAVE (`.sid.yaml` / `.sidwave.yaml` or JSON) composition to PRG/SID and play it |
| `sid_reset` | TODO | Reset or silence SID |

### Graphics (VIC II)

| Tool | Endpoint | Description |
| --- | --- | --- |
| `vic_ii_spec` | `GET /tools/vic_ii_spec?topic=<pattern>` | VIC-II graphics/timing knowledge including PAL/NTSC geometry, badlines, DMA steals, border windows. |
| `generate_sprite_prg` | `POST /tools/generate_sprite_prg` | Build and run a PRG that displays one sprite from 63 raw bytes (hex/base64); options: `index`, `x`, `y`, `color`, `multicolour`. |
| `render_petscii_screen` | `POST /tools/render_petscii_screen` | Generate and run a BASIC program that clears screen, sets colours, and prints PETSCII text. |
| `create_petscii_image` | `POST /tools/create_petscii_image` | Produce PETSCII character art from prompts/text (max 320×200 bitmap) and run the generated BASIC program on the C64. |

### Printer

| Tool | Endpoint | Description |
| --- | --- | --- |
| `print_text` | TODO | Generate a BASIC program to print text to device 4 (Commodore MPS by default) and run it |

## Using with GitHub Copilot in VS Code

GitHub Copilot Chat (version 1.214+) includes native MCP support. To enable C64 MCP integration:

### Step 1: Enable MCP in Copilot Chat

- Open VS Code and ensure GitHub Copilot Chat extension is installed and signed in.
- Open **Settings** → **Extensions** → **GitHub Copilot** → **Chat: Experimental: MCP**.
- Enable the **MCP** checkbox.
- Restart VS Code.

### Step 2: Configure the C64 MCP Server

Add this configuration to your workspace `.vscode/settings.json`:

```json
{
  "github.copilot.chat.experimental.mcp": {
    "servers": [
      {
        "name": "c64-mcp",
        "url": "http://localhost:8000",
        "manifestPath": "/absolute/path/to/c64-mcp/dist/mcp-manifest.json",
        "type": "http"
      }
    ]
  }
}
```

**Important:** Replace `/absolute/path/to/c64-mcp/` with the actual absolute path to your c64-mcp project directory.

### Step 3: Start the MCP Server

```bash
npm start
```

Keep this running—it will log successful connectivity to your C64 device.

### Step 4: Use MCP Tools in Copilot Chat

More system, drive, file, streaming, and SID tools are available. For the full list and parameters, see the generated `dist/mcp-manifest.json` (built) or the legacy [`src/mcpManifest.json`](src/mcpManifest.json).

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

Any endpoint listed in the generated `dist/mcp-manifest.json` (or `src/mcpManifest.json`) can be invoked the same way by posting JSON to `/tools/<name>`.

### Local RAG (Retrieval-Augmented Generation)

This server includes a local RAG subsystem that indexes sample Commodore 64 source code from `data/basic_examples/` and `data/assembly_examples/` on startup. It maintains two compact JSON indices at `data/embeddings_basic.json` and `data/embeddings_asm.json` generated using a deterministic, offline embedding model. Override the output directory by setting `RAG_EMBEDDINGS_DIR` (defaults to `data/`). The index auto-rebuilds when files under `data/` change (polling every `RAG_REINDEX_INTERVAL_MS`, default 15000 ms).

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

You can add your own `.bas`, `.asm`, `.s`, or Markdown reference notes anywhere under `data/basic_examples/` and `data/assembly_examples/`. The indexer scans subdirectories recursively and picks up changes automatically.

A small curated set of documentation from `doc/` is also indexed; by default this includes [`doc/6502-instructions.md`](doc/6502-instructions.md). To include additional documentation without moving files, set `RAG_DOC_FILES` to a comma-separated list of paths before running `npm run rag:rebuild` or starting the server with `RAG_BUILD_ON_START=1`.

#### RAG Rebuild Policy

- Default behaviour (from this PR onward): no background reindex and no build-on-start to avoid churn and merge conflicts. The test runner forces `RAG_EMBEDDINGS_DIR=artifacts/test-embeddings` so CI and local builds never touch the tracked JSON files unless you opt in.
  - Set `RAG_REINDEX_INTERVAL_MS=0` (default) to disable periodic reindex.
  - Omit `RAG_BUILD_ON_START`; the server will load existing indices if present and otherwise operate with empty indexes.
- Opt-in rebuilds:
  - Trigger a one-time on-start rebuild by exporting `RAG_BUILD_ON_START=1`.
  - Or run `npm run rag:rebuild` explicitly to rebuild indices.
- CI recommended settings: `RAG_REINDEX_INTERVAL_MS=0` and do not set `RAG_BUILD_ON_START`.

To minimize diffs, the indexer writes files only when contents change and keeps a stable, sorted record order.

#### Extending the RAG from external sources

Extending the RAG from external sources is a three-step process: discover sources, fetch content from them, and add the content to the index.

##### Discover

To discover new C64 sources on GitHub, first create a `.env` file with GitHub credentials with these contents:
```env
GITHUB_TOKEN=<personalAccessToken>
```

The `<personalAccessToken>` can be issued at [GitHub Pesonal Access Tokens](https://github.com/settings/personal-access-tokens):

- Expiration: 90 days
- Resource owner: Your GitHub user account
- Repository access: All repositories
- Access type: Public repositories
- Permissions: Metadata (Read-only), Contents (Read-only)

Then run:

```bash
npm install --save-dev dotenv-cli
npx dotenv -e .env -- npm run rag:discover
```

This will extend the file `src/rag/sources.csv`.

##### Fetch

To download sources available at locations defined in `src/rag/sources.csv`:

1. (Optional) Extend `src/rag/sources.csv` (columns: `type,description,link,depth`) with new sources.
1. Fetch sources (opt-in, no network on builds/tests):

   ```bash
   npm run rag:fetch
   ```

##### Rebuild

1. Rebuild the RAG index to incorporate new or changed sources:

   ```bash
   # either rely on the running server's auto-reindexer (default ~15s), or
   npm run rag:rebuild
   ```

Notes:

- Downloads are stored under `external/` (gitignored) and included in the index alongside `data/*`.
- If you delete files from `external/` and rebuild, their content will be removed from the RAG. To “freeze” current embeddings, avoid rebuilding (e.g., set `RAG_REINDEX_INTERVAL_MS=0`) until you want to refresh.

For advanced options (depth semantics, throttling/limits, adaptive rate limiting, retries, logs, and environment overrides), see the dedicated section in `doc/developer.md`.

## Utility Scripts

- `npm run c64:tool` — interactive helper that can:
  - convert a BASIC file to a PRG and store it under `artifacts/` (or a path you choose),
  - convert and immediately run the generated PRG on the configured c64 device,
  - upload an existing PRG and run it on the c64 device.
- `npm run api:generate` — regenerate the typed REST client under `generated/c64/` from [`doc/c64-openapi.yaml`](doc/c64-openapi.yaml).
- Advanced users can call the underlying CLI directly:

  ```bash
  node --import ./scripts/register-ts-node.mjs scripts/c64-cli.mjs convert-basic --input path/to/program.bas
  node --import ./scripts/register-ts-node.mjs scripts/c64-cli.mjs run-basic --input path/to/program.bas
  node --import ./scripts/register-ts-node.mjs scripts/c64-cli.mjs run-prg --input artifacts/program.prg
  ```

Generated binaries are written to the `artifacts/` directory by default (ignored by git) so you can transfer them to real hardware or flash media. Make sure your `~/.c64mcp.json` (or `C64MCP_CONFIG`) points at your c64 device before using the run options.

## Troubleshooting

If the MCP server is not reachable or VS Code integration isn't working, see the comprehensive troubleshooting guide:

**📋 [MCP Troubleshooting Guide](doc/troubleshooting-mcp.md)**

Quick diagnosis commands:

```bash
# Check if server is running
lsof -i :8000

# Test basic connectivity  
curl -s http://localhost:8000/tools/info

# Emergency restart
pkill -f "npm start" && PORT=8000 npm start
```

## Development Workflow

- Type-check with `npm run build`.
- Run tests with `npm test` (mock) and `npm test -- --real` (hardware).
- Review [`doc/c64-rest-api.md`](doc/c64-rest-api.md) for official REST call details.

## Reference

- REST API docs: [Ultimate 64 REST API](https://1541u-documentation.readthedocs.io/en/latest/api/api_calls.html)
- Local references: see the [Documentation](#documentation) section above.
