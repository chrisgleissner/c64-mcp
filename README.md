![Logo](./doc/img/logo.png)

# c64-mcp

Your AI Bridge for the Commodore 64.

[![npm](https://img.shields.io/npm/v/c64-mcp.svg)](https://www.npmjs.com/package/c64-mcp)
[![Build](https://img.shields.io/github/actions/workflow/status/chrisgleissner/c64-mcp/ci.yaml)](https://github.com/chrisgleissner/c64-mcp/actions/workflows/ci.yaml)
[![License: GPL v2](https://img.shields.io/badge/License-GPL%20v2-blue.svg)](https://www.gnu.org/licenses/old-licenses/gpl-2.0.en.html)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-forestgreen)](doc/developer.md)


## About

Model Context Protocol ([MCP](https://modelcontextprotocol.io/docs/getting-started/intro)) server for driving a Commodore 64 with AI via the REST API of the [Commodore 64 Ultimate](https://www.commodore.net/) or [Ultimate 64](https://ultimate64.com/). It is built on the official TypeScript `@modelcontextprotocol/sdk` and communicates over the stdio transport by default; an HTTP compatibility surface remains for manual testing.

Exposes tools and knowledge that enable [LLM agents](https://www.promptingguide.ai/research/llm-agents) to upload and run BASIC or assembly programs, read/write RAM, control the VIC or SID, print documents, and more.

## Features ✨

- **Code** in Basic or Assembly
- **Compose** music
- **Create** PETSCII drawings
- **Custom Knowledge Base** with built-in local Retrieval-Augmented Generation ([RAG](https://en.wikipedia.org/wiki/Retrieval-augmented_generation)) for prompt enrichment

## What is MCP?

The **Model Context Protocol (MCP)** defines a universal, secure, and consistent way for LLM-based applications to connect with external systems and data sources.  

Often called [*“the USB-C port for AI”*](https://docs.anthropic.com/en/docs/mcp), it provides a standardized interface that allows language models to access information and perform actions safely, predictably, and repeatably.

Although it resembles a traditional API, MCP is designed specifically for the way LLMs think and interact. An MCP server can:

- **Expose data** through **Resources** — structured information the model can draw into its working context.  
- **Provide functionality** through **Tools** — executable actions that perform tasks or cause effects.  
- **Offer guidance** through **Prompts** — reusable conversation patterns for complex operations.  

**C64-MCP** applies this to the **Commodore 64**, serving as an **AI bridge and control deck**.  

You’re the Commodore at the helm — AI assists, extending the reach of your commands into the 8-bit world.

## Examples 🎬

Let's compose a children song on the C64 using ChatGPT and VS Code:

1. We type the prompt:
`play a children song on the c64`.
1. ChatGPT reads our prompt and creates a song. In this case it creates a Basic program that plays a song, but direct SID creation is work in progress.
1. The LLM then uses this MCP to transfer the Basic program to the Ultimate 64 and play it.

The following image shows the final output, using the [C64 Stream](https://github.com/chrisgleissner/c64stream/) OBS plugin to capture the C64 video and audio output:

![duck song](./doc/img/prompts/duck_song.png)

1. After the follow-up prompt `Now create a PETSCII image related to that song` the following image of ducks swimming on a pond appears:

![duck petscii](./doc/img/prompts/duck_petscii.png)

...and our C64 is now AI-powered!

## Installation 📦

The installation consists of two steps: Installing Node.js and then installing and running the MCP server.

### Install Node.js

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

### Install and Run the MCP Server

You have three options to install and run the MCP server: quick start with npx, persistent install via npm, or install from source via GitHub if you want to run tests and contribute.

#### Quick start (npx, zero-setup)

Run the prebuilt server without creating a project. npx downloads the package and expands all bundled files on disk for this session.

```sh
npx -y c64-mcp@latest
```

By default, the MCP server looks for `~/.c64mcp.json`. To target your device, create:

```json
{
  "c64u": {
    "host": "<hostname or IP>",
    "port": 80
  }
}
```

#### Persistent install (npm)

This installs the prebuilt `c64-mcp` Node package from [npm](https://www.npmjs.com/package/c64-mcp) and then runs the server. No build step required.

1. Create a folder (or use an existing project) and install the package:

```bash
mkdir -p ~/c64-mcp && cd ~/c64-mcp
npm init -y
npm install c64-mcp
```

1. Configure your C64 target (optional but recommended):

Create `~/.c64mcp.json` with your device settings:

```json
{ "c64u": { "host": "c64u" } }
```

1. Start the server (stdio MCP):

```bash
node ./node_modules/c64-mcp/dist/index.js
```

Notes

- Works fully offline. The npm package bundles `doc/`, `data/`, and `mcp.json`.
- All environment flags (e.g., `RAG_BUILD_ON_START=1`) apply the same as in a source checkout.
- Using npx or a local install both place the package contents on the filesystem in expanded form.

#### Install from source (GitHub)

Use this path if you plan to run tests or contribute code; `npm start` automatically prefers the TypeScript sources (via ts-node) when they are available and falls back to the compiled JavaScript otherwise.

1. Clone and install dependencies

```bash
git clone https://github.com/chrisgleissner/c64-mcp.git
cd c64-mcp
npm install
```

1. Start the development server

```bash
npm start
```

The dev server runs via ts-node; to build the compiled output, you can run:

```bash
npm run build
```

## Documentation 📚

The Agent has two main artifacts:

- [`mcp.json`](mcp.json):  human-maintained project configuration (entry point, env vars, metadata).
  (No manifest file required; MCP clients discover tools at runtime over stdio.)

Besides this `README.md` document, the project includes extensive documentation:

- [`AGENTS.md`](AGENTS.md) — Quick-start guidance for automation agents and persona definitions.
- [`data/context/bootstrap.md`](data/context/bootstrap.md) — Core primer injected ahead of agent prompts.
- `.github/prompts/*.prompt.md` — Request templates surfaced to agents (see `src/context.ts`).
- [`doc/developer.md`](doc/developer.md) — Development environment and workflow details.
- [`doc/rest/c64-rest-api.md`](doc/rest/c64-rest-api.md) — Summary of the c64 REST endpoints.
- [`data/basic/basic-spec.md`](data/basic/basic-spec.md) — BASIC tokenisation and PRG file layout.
- [`doc/rest/c64-openapi.yaml`](doc/rest/c64-openapi.yaml) — OpenAPI 3.1 description of the REST surface.

## Configuration ⚙️

The MCP server reads configuration from a JSON file called `.c64mcp.json`. The recommended location is your home directory (`~/.c64mcp.json`). You can override the path with the `C64MCP_CONFIG` environment variable. As a convenience during development, a project-local [`.c64mcp.json`](.c64mcp.json) at the repo root is also picked up if present. Lookup order is: explicit `C64MCP_CONFIG` (falling back to `~/.c64mcp.json` when unset), then the repo-local file, and finally the built-in defaults (`host=c64u`, `port=80`). Legacy keys (`c64_host`, `c64_ip`) are normalised automatically.

Configuration is split by device type. No top-level `backend` field is required; the server selects a backend automatically (see selection rules below).

### C64U (real hardware)

Use this section to point the server at an Commodore 64 Ultimate or Ultimate 64 device.

Provide the host (DNS name or IP, defaults to `c64u`) and a port (defaults to `80`).

```json
{
  "c64u": {
    "host": "c64u",
    "port": 80
  }
}
```

### VICE (emulator)

> [!NOTE] This is an experimental feature that is currently very limited.

This backend starts a fresh VICE process for each PRG run using the emulator binary. In phase one, memory/register operations are not supported; the focus is deterministic PRG execution.

```json
{
  "vice": {
    "exe": "/usr/bin/x64sc"
  }
}
```

Notes:

- If `vice.exe` is not set, the server attempts to find `x64sc` (or `x64`) on your `PATH`.
- Each program execution spawns a new VICE instance, e.g.:

  ```bash
  x64sc -autostart "program.prg" -silent -warp
  ```

### Backend selection rules

Backend selection is automatic with clear logging. The following precedence applies:

1. Explicit override: if `C64_MODE=c64u` or `C64_MODE=vice` is set in the environment, that backend is used.
2. Config presence: if only one of `c64u` or `vice` is configured, it is used.
3. Both configured: prefer `c64u` unless VICE is explicitly requested via `C64_MODE=vice`.
4. No configuration: probe the default C64U address (`http://c64u`); if unavailable, fall back to VICE.

On startup, the server logs the selected backend and reason, for example:

- `Active backend: c64u (from config)`
- `Active backend: vice (fallback – hardware unavailable)`

### File locations and overrides

- Primary: `~/.c64mcp.json`
- Override path: set `C64MCP_CONFIG=/absolute/path/to/.c64mcp.json`
- Repo-local (dev): `.c64mcp.json` at the project root


   If the file is missing, the server first looks for the bundled [`.c64mcp.json`](.c64mcp.json) in the project root, and finally falls back to `http://c64u`.



## Build & Test 🧪

- `npm run build` — type-check the TypeScript sources, normalize the dist layout for packaging, and regenerate the MCP API tables in `README.md`.
- `npm test` — run the integration tests against an in-process mock that emulates the c64 REST API.
- `npm test -- --real` — exercise the same tests against a real c64 device. The runner reuses your MCP config (`~/.c64mcp.json` or `C64MCP_CONFIG`) to determine the REST endpoint, and falls back to `http://c64u`. You can also override explicitly with `--base-url=http://<host>`.
- `npm run check` — convenience command that runs both the type-check and the mock-backed test suite.

The test runner accepts the following options:

- `--mock` (default): use the bundled mock hardware emulator.
- `--real`: talk to physical hardware (requires reachable C64 device).
- `--base-url=http://host[:port]`: override the REST endpoint when running with `--real`.

## MCP API Reference

<!-- AUTO-GENERATED:MCP-DOCS-START -->

### Tools

#### Programs
> Program uploaders, runners, and compilation workflows for BASIC, assembly, and PRG files.

**Workflow hints:**
- Choose BASIC or assembly uploaders based on the language you just generated for the user.
- Prefer PRG or CRT runners when the user supplies an Ultimate filesystem path instead of source text.

**Default tags:** `programs`, `execution`

| Name | Description | Tags |
| --- | --- | --- |
| `load_prg_file` | Load a PRG into C64 memory without executing it. | `programs`, `execution`, `file` |
| `run_crt_file` | Run a cartridge image stored on the Ultimate filesystem. | `programs`, `execution`, `cartridge` |
| `run_prg_file` | Run a PRG located on the Ultimate filesystem without uploading source. | `programs`, `execution`, `file` |
| `upload_and_run_asm` | Assemble 6502/6510 source code, upload the PRG, and run it immediately. See c64://specs/assembly. | `programs`, `execution`, `assembly` |
| `upload_and_run_basic` | Upload a BASIC program to the C64 and execute it immediately. Refer to c64://specs/basic for syntax and device I/O. | `programs`, `execution`, `basic` |

#### Memory
> Screen, main memory, and low-level inspection utilities.

**Workflow hints:**
- Pair memory operations with documentation snippets so addresses and symbols stay meaningful to the user.
- Confirm intent before mutating RAM and explain how the change affects the running program.

**Default tags:** `memory`, `debug`

| Name | Description | Tags |
| --- | --- | --- |
| `read_memory` | Read a range of bytes from main memory and return the data as hexadecimal. Consult c64://specs/assembly and docs index. | `memory`, `debug`, `hex` |
| `read_screen` | Read the current text screen (40x25) and return its ASCII representation. For PETSCII details, see c64://specs/basic. | `memory`, `debug`, `screen` |
| `write_memory` | Write a hexadecimal byte sequence into main memory at the specified address. See c64://context/bootstrap for safety rules. | `memory`, `debug`, `hex`, `write` |

#### Audio
> SID composition, playback, and audio analysis workflows.

**Workflow hints:**
- Reach for SID helpers when the user talks about sound design, playback quality, or stuck notes.
- After changing playback state, suggest verify-by-ear steps such as analyze_audio so the user gets concrete feedback.

**Default tags:** `sid`, `audio`

| Name | Description | Tags |
| --- | --- | --- |
| `analyze_audio` | Automatically analyze SID playback when the user requests verification feedback. | `sid`, `audio`, `analysis` |
| `modplay_file` | Play a MOD tracker module stored on the Ultimate filesystem. | `sid`, `audio`, `playback` |
| `music_compile_and_play` | Compile a SIDWAVE composition to PRG or SID and optionally play it immediately. | `sid`, `audio`, `music`, `compiler` |
| `music_generate` | Generate a lightweight arpeggio and schedule playback on SID voice 1. | `sid`, `audio`, `music`, `generator` |
| `record_and_analyze_audio` | Record audio from the default input device and analyze SID playback characteristics. | `sid`, `audio`, `analysis` |
| `sid_note_off` | Release a SID voice by clearing its GATE bit. | `sid`, `audio`, `control`, `music` |
| `sid_note_on` | Trigger a SID voice with configurable waveform, pulse width, and ADSR envelope. See c64://specs/sid. | `sid`, `audio`, `control`, `music` |
| `sid_reset` | Reset the SID chip either softly (silence) or with a full register scrub. | `sid`, `audio`, `control` |
| `sid_silence_all` | Silence all SID voices by clearing control and envelope registers. | `sid`, `audio`, `control` |
| `sid_volume` | Set the SID master volume register at $D418. See c64://specs/sid. | `sid`, `audio`, `control` |
| `sidplay_file` | Play a SID file stored on the Ultimate filesystem via the firmware player. | `sid`, `audio`, `playback` |

#### Machine
> Power, reset, pause/resume, and diagnostic controls for the C64 and Ultimate hardware.

**Workflow hints:**
- Reach for machine controls when the user mentions resets, power states, or DMA pause/resume.
- Explain the operational impact (e.g. soft reset vs firmware reboot) so the user knows what changed.

**Default tags:** `machine`, `control`

| Name | Description | Tags |
| --- | --- | --- |
| `menu_button` | Toggle the Ultimate 64 menu button. | `machine`, `control`, `menu` |
| `pause` | Pause the machine using DMA halt. See memory safety checklist in c64://context/bootstrap. | `machine`, `control`, `pause` |
| `poweroff` | Power off the machine via Ultimate firmware. See safety notes in c64://context/bootstrap. | `machine`, `control`, `power` |
| `reboot_c64` | Reboot the Ultimate firmware and C64. See c64://context/bootstrap. | `machine`, `control`, `reboot` |
| `reset_c64` | Reset the C64 via Ultimate firmware. Review c64://context/bootstrap safety rules. | `machine`, `control`, `reset` |
| `resume` | Resume the machine after a DMA pause. | `machine`, `control`, `resume` |

#### Storage
> Drive management, disk image creation, and file inspection utilities.

**Workflow hints:**
- Reach for storage tools when the user mentions drives, disk images, or Ultimate slots.
- Spell out which slot or path you touched so the user can replicate actions on hardware.

**Default tags:** `drive`, `storage`

| Name | Description | Tags |
| --- | --- | --- |
| `create_d64` | Create a blank D64 disk image on the Ultimate filesystem. | `drive`, `storage`, `disk`, `create` |
| `create_d71` | Create a blank D71 disk image on the Ultimate filesystem. | `drive`, `storage`, `disk`, `create` |
| `create_d81` | Create a blank D81 disk image on the Ultimate filesystem. | `drive`, `storage`, `disk`, `create` |
| `create_dnp` | Create a blank DNP disk image on the Ultimate filesystem. | `drive`, `storage`, `disk`, `create` |
| `drive_load_rom` | Temporarily load a custom ROM into an Ultimate drive slot. | `drive`, `storage`, `rom` |
| `drive_mode` | Set the emulation mode for an Ultimate drive slot (1541/1571/1581). | `drive`, `storage`, `mode` |
| `drive_mount` | Mount a disk image onto a specific Ultimate drive slot. | `drive`, `storage`, `mount` |
| `drive_off` | Power off a specific Ultimate drive slot. | `drive`, `storage`, `power` |
| `drive_on` | Power on a specific Ultimate drive slot. | `drive`, `storage`, `power` |
| `drive_remove` | Remove the currently mounted disk image from an Ultimate drive slot. | `drive`, `storage`, `unmount` |
| `drive_reset` | Reset the selected Ultimate drive slot. | `drive`, `storage`, `reset` |
| `drives_list` | List Ultimate drive slots and their currently mounted images. Read c64://context/bootstrap for drive safety. | `drive`, `storage`, `status` |
| `file_info` | Inspect metadata for a file on the Ultimate filesystem. | `drive`, `storage`, `info` |

#### Graphics
> PETSCII art, sprite workflows, and VIC-II graphics helpers.

**Workflow hints:**
- Suggest graphics helpers when the user asks for sprites, PETSCII art, or screen layout tweaks.
- Mention how VIC-II state changes (colours, sprite positions) affect follow-up memory operations.

**Default tags:** `graphics`, `vic`

| Name | Description | Tags |
| --- | --- | --- |
| `create_petscii_image` | Create PETSCII art from prompts or text, optionally run it on the C64, and return metadata. See c64://specs/basic and c64://specs/vic. | `graphics`, `vic`, `petscii`, `basic` |
| `generate_sprite_prg` | Generate and execute a PRG that displays a sprite from raw 63-byte data. See c64://specs/vic for registers. | `graphics`, `vic`, `sprite`, `assembly` |
| `render_petscii_screen` | Render PETSCII text to the screen with optional border/background colours. See c64://specs/basic. | `graphics`, `vic`, `basic`, `screen` |

#### Printer
> Printer workflow helpers for Commodore MPS and Epson FX devices, including prompt templates.

**Workflow hints:**
- Reach for printer tools when the user references device 4, hardcopy output, or specific printer models.
- Clarify which workflow (Commodore vs Epson) you chose so the user can prepare matching paper or ribbons.

**Default tags:** `printer`

| Name | Description | Tags |
| --- | --- | --- |
| `define_printer_chars` | Define custom characters on Commodore MPS printers using DLL mode. | `printer`, `dll`, `commodore` |
| `print_bitmap_commodore` | Print a Commodore MPS bit-image row using BIM BASIC helpers. | `printer`, `bitmap`, `commodore` |
| `print_bitmap_epson` | Print an Epson FX bit-image row using ESC/P commands. | `printer`, `bitmap`, `epson` |
| `print_text` | Print text on device 4 using Commodore or Epson workflows. See c64://docs/printer/guide. | `printer`, `text` |

#### Rag
> Retrieval-augmented generation helpers for BASIC and assembly examples.

**Workflow hints:**
- Call RAG tools when the user needs references or examples before generating new code.
- Summarise the number of refs returned and suggest follow-up actions like reading specific docs.

**Default tags:** `rag`, `search`

| Name | Description | Tags |
| --- | --- | --- |
| `rag_retrieve_asm` | Retrieve 6502/6510 assembly references from local knowledge. See c64://specs/assembly. | `rag`, `search`, `asm` |
| `rag_retrieve_basic` | Retrieve BASIC references from local knowledge. See c64://specs/basic before coding. | `rag`, `search`, `basic` |

#### Developer
> Configuration management, diagnostics, and helper utilities for advanced workflows.

**Workflow hints:**
- Use developer tools for firmware configuration, diagnostics, or advanced register tweaks.
- Call out any risky operations (like flash writes) so the user understands the impact.

**Default tags:** `developer`, `config`, `debug`

| Name | Description | Tags |
| --- | --- | --- |
| `config_batch_update` | Apply multiple configuration changes in a single request. | `developer`, `config`, `debug`, `write` |
| `config_get` | Read a configuration category or specific item. | `developer`, `config`, `debug`, `read` |
| `config_list` | List configuration categories available on the Ultimate firmware. | `developer`, `config`, `debug`, `list` |
| `config_load_from_flash` | Load configuration settings from flash storage. | `developer`, `config`, `debug`, `flash` |
| `config_reset_to_default` | Reset configuration categories to their factory defaults. | `developer`, `config`, `debug`, `reset` |
| `config_save_to_flash` | Persist current configuration settings to flash storage. | `developer`, `config`, `debug`, `flash` |
| `config_set` | Set a configuration value within a category. | `developer`, `config`, `debug`, `write` |
| `debugreg_read` | Read the Ultimate debug register ($D7FF). | `developer`, `config`, `debug` |
| `debugreg_write` | Write a value into the Ultimate debug register ($D7FF). | `developer`, `config`, `debug` |
| `info` | Retrieve Ultimate hardware information and status. | `developer`, `config`, `debug`, `diagnostics`, `info` |
| `version` | Retrieve Ultimate firmware and API version information. | `developer`, `config`, `debug`, `diagnostics`, `version` |

#### Streaming
> Long-running or streaming workflows such as audio capture or SID playback monitoring.

**Workflow hints:**
- Use streaming tools for long-running capture or monitoring workflows such as audio verification.
- Clarify that streams keep running until stopped so the user can manage resources.

**Default tags:** `stream`, `monitoring`

| Name | Description | Tags |
| --- | --- | --- |
| `stream_start` | Start an Ultimate streaming session (video/audio/debug) targeting a host:port destination. See c64://docs/index for usage notes. | `stream`, `monitoring`, `start` |
| `stream_stop` | Stop an Ultimate streaming session (video/audio/debug). | `stream`, `monitoring`, `stop` |

### Resources

| Name | Summary |
| --- | --- |
| `c64://docs/index` | Explains how to approach each knowledge bundle and when to consult it. |
| `c64://context/bootstrap` | Step-by-step rules for safe automation, verification, and rollback on the Ultimate hardware. |
| `c64://specs/basic` | Token definitions, syntax rules, and device I/O guidance for BASIC v2. |
| `c64://specs/assembly` | Official opcode matrix, addressing modes, and zero-page strategy for the 6510 CPU. |
| `c64://specs/sid` | Register map, waveform behaviour, and ADSR envelopes for expressive SID playback. |
| `c64://specs/sidwave` | Defines the SIDWAVE interchange format used by the SID composer workflow. |
| `c64://docs/sid/file-structure` | Explains PSID/RSID headers, metadata blocks, and compatibility notes for imported music. |
| `c64://specs/vic` | Covers raster timing, sprite control, colour RAM, and bitmap modes on the VIC-II. |
| `c64://specs/printer` | Covers device setup, control codes, and Ultimate 64 integration for printers. |
| `c64://docs/printer/guide` | Quick-look workflow covering setup, troubleshooting, and sample jobs for both printer families. |
| `c64://docs/printer/commodore-text` | Character sets, control codes, and formatting for Commodore MPS text output. |
| `c64://docs/printer/commodore-bitmap` | Details bitmap modes, graphics commands, and data layout for MPS bitmap printing. |
| `c64://docs/printer/epson-text` | Lists ESC/P control codes and formatting advice for Epson FX text output. |
| `c64://docs/printer/epson-bitmap` | Explains bit-image modes, density options, and data packing for Epson bitmap jobs. |
| `c64://docs/printer/prompts` | Reusable prompt templates that drive complex printer jobs through the MCP server. |

### Prompts

| Name | Description |
| --- | --- |
| `assembly-program` | Author 6502/6510 assembly routines with precise hardware guidance. |
| `basic-program` | Plan, implement, and verify Commodore BASIC v2 programs safely. |
| `drive-manager` | Mount, create, or power drives while preserving running workloads. |
| `graphics-demo` | Create VIC-II graphics demos with safe setup and validation steps. |
| `memory-debug` | Inspect or patch memory ranges with reversible steps and logging. |
| `printer-job` | Send formatted output to Commodore or Epson printers with safe teardown steps. |
| `sid-music` | Compose SID music with expressive phrasing and iterative audio verification. |

<!-- AUTO-GENERATED:MCP-DOCS-END -->

## Using with GitHub Copilot in VS Code 💻

GitHub Copilot Chat (version 1.214+) includes native MCP support. To enable C64 MCP integration:

### Step 1: Enable MCP in Copilot Chat

- Open VS Code and ensure GitHub Copilot Chat extension is installed and signed in.
- Open **Settings** → **Extensions** → **GitHub Copilot** → **Chat: Experimental: MCP**.
- Enable the **MCP** checkbox.
- Restart VS Code.

### Step 2: Configure the C64 MCP Server

Add this configuration to your workspace `.vscode/settings.json` (stdio transport):

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

MCP clients discover tools dynamically at runtime; no manifest file is required.

### Step 3: Start the MCP Server

```bash
npm start
```

Keep this running—it will log successful connectivity to your C64 device.

### Step 4: Use MCP Tools in Copilot Chat

More system, drive, file, streaming, and SID tools are available. For the full list and parameters, ask the MCP client to list tools.

## Optional HTTP compatibility

An HTTP server remains available for manual testing and scripting. It exposes endpoints under `/tools/*`. To enable it locally, export a `PORT` (e.g. 8000) before start:

```bash
PORT=8000 npm start
```

Example curl call (when HTTP server is enabled):

```bash
curl -s http://localhost:8000/tools/info | jq
```

When using the optional HTTP server, endpoints live under `/tools/*`.

## Local RAG 🕸️

This server includes a local RAG ([Retrieval-Augmented Generation](https://en.wikipedia.org/wiki/Retrieval-augmented_generation)) subsystem that indexes sample Commodore 64 source code and hardware information from the `data` folder on startup.

It maintains several compact JSON indices at `data/embeddings_*.json` which are generated using a deterministic, offline embedding model.

Override the output directory by setting `RAG_EMBEDDINGS_DIR` (defaults to `data/`). The index auto-rebuilds when files under `data` change (polling every `RAG_REINDEX_INTERVAL_MS`, default 15000 ms).

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

You can add your data (source code, hardware information, Markdown notes, etc.) anywhere under the `data` folder. The indexer scans subdirectories recursively and picks up changes automatically.

A small curated set of documentation from `doc/` is also indexed; by default this includes [`data/assembly/assembly-spec.md`](data/assembly/assembly-spec.md).

To include additional documentation without moving files, set `RAG_DOC_FILES` to a comma-separated list of paths before running `npm run rag:rebuild` or starting the server with `RAG_BUILD_ON_START=1`.

### RAG Rebuild Policy

- Default behaviour (from this PR onward): no background reindex and no build-on-start to avoid churn and merge conflicts.The test runner forces `RAG_EMBEDDINGS_DIR=artifacts/test-embeddings` so CI and local builds never touch the tracked JSON files unless you opt in.
  - Set `RAG_REINDEX_INTERVAL_MS=0` (default) to disable periodic reindex.
  - Omit `RAG_BUILD_ON_START`; the server will load existing indices if present and otherwise operate with empty indexes.
- Opt-in rebuilds:
  - Trigger a one-time on-start rebuild by exporting `RAG_BUILD_ON_START=1`.
  - Or run `npm run rag:rebuild` explicitly to rebuild indices.
- CI recommended settings: `RAG_REINDEX_INTERVAL_MS=0` and do not set `RAG_BUILD_ON_START`.

To minimize diffs, the indexer writes files only when contents change and keeps a stable, sorted record order.

### External Sources

Extending the RAG from external sources is a three-step process: discover sources, fetch content from them, and add the content to the index.

#### Discover

> [!NOTE]
> This feature is experimental.

To discover new C64 sources on GitHub, first create a `.env` file with GitHub credentials with these contents:

```env
GITHUB_TOKEN=<personalAccessToken>
```

The `<personalAccessToken>` can be issued at [GitHub Personal Access Tokens](https://github.com/settings/personal-access-tokens) with these values:

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

#### Fetch

To download sources available at locations defined in `src/rag/sources.csv`:

1. (Optional) Extend `src/rag/sources.csv` (columns: `type,description,link,depth`) with new sources.
1. Fetch sources (opt-in, no network on builds/tests):

   ```bash
   npm run rag:fetch
   ```

#### Rebuild

1. Rebuild the RAG index to incorporate new or changed sources:

   ```bash
   # either rely on the running server's auto-reindexer (default ~15s), or
   npm run rag:rebuild
   ```

#### Notes

- Downloads are stored under `external/` (gitignored) and included in the index alongside `data/*`.
- If you delete files from `external/` and rebuild, their content will be removed from the RAG. To “freeze” current embeddings, avoid rebuilding (e.g., set `RAG_REINDEX_INTERVAL_MS=0`) until you want to refresh.

For advanced options (depth semantics, throttling/limits, adaptive rate limiting, retries, logs, and environment overrides), see the dedicated section in `doc/developer.md`.

## Utility Scripts 🛠️

- `npm run c64:tool` — interactive helper that can:
  - convert a BASIC file to a PRG and store it under `artifacts/` (or a path you choose),
  - convert and immediately run the generated PRG on the configured c64 device,
  - upload an existing PRG and run it on the c64 device.
- `npm run api:generate` — regenerate the typed REST client under `generated/c64/` from [`doc/rest/c64-openapi.yaml`](doc/rest/c64-openapi.yaml).
- Advanced users can call the underlying CLI directly:

  ```bash
  node --import ./scripts/register-ts-node.mjs scripts/c64-cli.mjs convert-basic --input path/to/program.bas
  node --import ./scripts/register-ts-node.mjs scripts/c64-cli.mjs run-basic --input path/to/program.bas
  node --import ./scripts/register-ts-node.mjs scripts/c64-cli.mjs run-prg --input artifacts/program.prg
  ```

Generated binaries are written to the `artifacts/` directory by default (ignored by git) so you can transfer them to real hardware or flash media. Make sure your `~/.c64mcp.json` (or `C64MCP_CONFIG`) points at your c64 device before using the run options.

## Troubleshooting 🛟

If the MCP server is not reachable or VS Code integration isn't working, see the comprehensive troubleshooting guide:

**📋 [MCP Troubleshooting Guide](doc/troubleshooting-mcp.md)**

Quick diagnosis commands:

```bash
# Start stdio server
npm start

# If using optional HTTP server: quick connectivity test
curl -s http://localhost:8000/tools/info
```

## Developer Docs 📖

- REST API docs: [Ultimate 64 REST API](https://1541u-documentation.readthedocs.io/en/latest/api/api_calls.html)
- Extend this project: see the [Developer Guide](doc/developer.md).
- Local references: see the [Documentation](#documentation-) section above.
