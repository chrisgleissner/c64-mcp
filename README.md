![Logo](./doc/img/logo.png)

# C64 Bridge

Your AI Command Bridge for the Commodore 64.

[![npm](https://img.shields.io/npm/v/c64bridge.svg)](https://www.npmjs.com/package/c64bridge)
[![Build](https://img.shields.io/github/actions/workflow/status/chrisgleissner/c64bridge/ci.yaml)](https://github.com/chrisgleissner/c64bridge/actions/workflows/ci.yaml)
[![codecov](https://codecov.io/github/chrisgleissner/c64bridge/graph/badge.svg?token=AS9D41Y5EG)](https://codecov.io/github/chrisgleissner/c64bridge)
[![License: GPL v2](https://img.shields.io/badge/License-GPL%20v2-blue.svg)](https://www.gnu.org/licenses/old-licenses/gpl-2.0.en.html)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-forestgreen)](doc/developer.md)

## About

C64 Bridge is a Model Context Protocol ([MCP](https://modelcontextprotocol.io/docs/getting-started/intro)) server for driving a Commodore 64 with AI via the REST API of the [Commodore 64 Ultimate](https://www.commodore.net/) or [Ultimate 64](https://ultimate64.com/). It is built on the official TypeScript `@modelcontextprotocol/sdk` and communicates over the stdio transport.

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

**C64 Bridge** applies this to the **Commodore 64**, serving as an **AI bridge and control deck**.  

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

Requires Node.js 24+ and npm.

- Linux (Ubuntu/Debian)

  ```bash
  sudo apt update
  sudo apt install -y curl ca-certificates
  # Option A: distro packages (may be older)
  sudo apt install -y nodejs npm
  # Option B (recommended): NodeSource LTS (24.x)
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
  sudo apt install -y nodejs
  ```

- macOS

  ```bash
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" # if Homebrew not installed
  brew install node@24
  brew link --overwrite node@24
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
npx -y c64bridge@latest
```

By default, the MCP server looks for `~/.c64bridge.json`. To target your device, create:

```json
{
  "c64u": {
    "host": "<hostname or IP>",
    "port": 80
  }
}
```

#### Persistent install (npm)

This installs the prebuilt `c64bridge` Node package from [npm](https://www.npmjs.com/package/c64bridge) and then runs the server. No build step required.

1. Create a folder (or use an existing project) and install the package:

```bash
mkdir -p ~/c64bridge && cd ~/c64bridge
npm init -y
npm install c64bridge
```

1. Configure your C64 target (optional but recommended):

Create `~/.c64bridge.json` with your device settings:

```json
{ "c64u": { "host": "c64u" } }
```

1. Start the server (stdio MCP):

```bash
node ./node_modules/c64bridge/dist/index.js
```

**Notes**

- Works fully offline. The npm package bundles `doc/`, `data/`, and `mcp.json`.
- All environment flags (e.g., `RAG_BUILD_ON_START=1`) apply the same as in a source checkout.
- Using npx or a local install both place the package contents on the filesystem in expanded form.

#### Install from source (GitHub)

Use this path if you plan to run tests or contribute code; `npm start` automatically prefers the TypeScript sources (via ts-node) when they are available and falls back to the compiled JavaScript otherwise.

1. Clone and install dependencies

```bash
git clone https://github.com/chrisgleissner/c64bridge.git
cd c64bridge
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

By default the server speaks MCP over stdio, which is the recommended mode for local editor integrations such as GitHub Copilot. If you need to expose the server to other machines, you can bridge it over HTTP with:

```bash
npm start -- --http [<port>]
```

Omitting the port uses `8000`. Only switch to HTTP when remote clients require it; stdio remains the preferred option because it avoids extra networking and keeps tool discovery automatic inside your editor.

### Setup GitHub Copilot in VS Code 💻

VS Code (version 1.102+) and GitHub Copilot Chat (version 1.214+) include native MCP support. To enable C64 Bridge integration:

#### Step 1: Enable MCP in Copilot Chat

- Open VS Code and ensure GitHub Copilot Chat extension is installed and signed in.
- Open **Settings** → **Extensions** → **GitHub Copilot** → **Chat: Experimental: MCP**.
- Enable the **MCP** checkbox.
- Restart VS Code.


#### Step 2: Start the MCP Server

Normally it gets started automatically, but if not, you can start it by opening `.vscode/mcp.json` in this repository and clicking on the "Start" icon:

![VS Code MCP start](./doc/img/vscode/vscode-start-mcp-server.png)

It will log some `[warning]` messages which is normal since all logs by the MCP server go to `stderr`.

These are the expected logs in the Output panel of VS Studio when you select `MCP: c64bridge` from its drop-down:

```text
2025-10-27 18:50:01.811 [warning] [server stderr] Starting c64bridge MCP server...
2025-10-27 18:50:02.118 [warning] [server stderr] [tool] list tools count=70 bytes=89244 latencyMs=0
2025-10-27 18:50:02.118 [warning] [server stderr] [prompt] list prompts count=7 bytes=3196 latencyMs=0
2025-10-27 18:50:02.122 [info] Discovered 70 tools
2025-10-27 18:50:02.320 [warning] [server stderr] [c64u] GET http://192.168.1.64 status=200 bytes=41608 latencyMs=172
2025-10-27 18:50:02.320 [warning] [server stderr] Connectivity check succeeded for c64 device at http://192.168.1.64
```

Keep this running.

In case you are having difficulties to start C64 Bridge, please consult the official [VS Code MCP Server](https://code.visualstudio.com/docs/copilot/customization/mcp-servers) instructions.

#### Step 3: Activate the C64 Chat Mode

1. In VS Code, select **Menu → View → Chat** to open the Copilot Chat window.
1. At the bottom of that window, use the drop-down that lists `Agent`, `Ask`, `Edit`, and `C64`. The `C64` option should be auto-discovered from the `.github/chatmodes/c64.chatmode.md` file bundled with this project.
1. Select **C64** to switch into the dedicated chat mode, as shown below.

![VS Code C64 chat mode](./doc/img/vscode/vscode-copilot-c64-chat-mode.png)

#### Step 4: Run Your First C64 AI Prompt

Prompt Copilot with **"Print a greeting on the screen"** to watch the MCP server upload and execute a BASIC greeting on your C64.

After a short while, a friendly AI greeting should appear on your C64 screen:

![VS Code C64 Hello World](./doc/img/vscode/vscode-copilot-hello-world.png)

Well done! You are all set. 

## Documentation 📚

The following files provide further insight into various aspects of C64 Bridge:

- [`AGENTS.md`](AGENTS.md) — Quick-start guidance for automation agents and persona definitions.
- [`doc/MCP_SETUP.md`](doc/MCP_SETUP.md) — More details on MCP setup and integration with Visual Code.
- [`doc/developer.md`](doc/developer.md) — Development environment and workflow details. Also covers how to extend and rebuild the local RAG embeddings.
- [`doc/rest/c64-openapi.yaml`](doc/rest/c64-openapi.yaml) — OpenAPI 3.1 description of the REST surface.
- [`data/context/bootstrap.md`](data/context/bootstrap.md) — Core primer injected ahead of agent prompts.

## Configuration ⚙️

The MCP server reads its configuration from a JSON file called `.c64bridge.json` which is resolved as follows (first match wins):

1. explicit `C64BRIDGE_CONFIG` env var containing the absolute path to the config file
1. `~/.c64bridge.json` (from user home)
1. `./c64bridge.json` (from current working directory)

If no config file is found, it uses defaults: `host=c64u`, `port=80`

The configuration has a dedicated section for each supported platform (i.e. a real or software-emulated C64 device) as described in the chapters below.

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

### VICE (software emulator)

> [!NOTE] This is an experimental feature that is currently very limited.

This backend starts a fresh [VICE](https://vice-emu.sourceforge.io/) process for each PRG run using the emulator binary. In phase one, memory/register operations are not supported; the focus is deterministic PRG execution.

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

### Log Level

By default, the server logs info-level messages and above.

To enable debug logging, set the environment variable `LOG_LEVEL=debug` before starting the server.

In Visual Code, you can achieve this via an entry in your `.env` file at the project root:

```txt
LOG_LEVEL=debug
```

Please note that all logs use `stderr` since `stdout` is reserved for the MCP protocol messages.

## Build & Test 🧪

- `bun install` — install dependencies for development (fast path). Node users can continue to use `npm install`.
- `bun run build` — type-check the TypeScript sources, normalize the dist layout for packaging, and regenerate the MCP API tables in `README.md`.
- `npm test` — run the integration tests against an in-process mock that emulates the c64 REST API.
- `npm test -- --real` — exercise the same tests against a real c64 device. The runner reuses your MCP config (`~/.c64bridge.json` or `C64BRIDGE_CONFIG`) to determine the REST endpoint. You can also override explicitly with `--base-url=http://<host>`.
- `npm run check` — convenience command that runs both the type-check and the mock-backed test suite.
- `npm run coverage` — runs the Bun-powered test harness with coverage enabled and emits `coverage/lcov.info` (CI uploads to Codecov).

**Development Tooling**

This project uses [Bun](https://bun.sh/) for building and testing due to its high performance (significantly faster than npm/node for development workflows). The npm package remains fully compatible with Node.js 18+ and can be installed and run using standard npm commands. For release preparation, npm/node is still used to ensure everything works correctly on the target platform.

The test runner accepts the following options:

- `--mock` (default): use the bundled mock hardware emulator.
- `--real`: talk to physical hardware (requires reachable C64 device).
- `--base-url=http://host[:port]`: override the REST endpoint when running with `--real`.

## MCP API Reference

<!-- AUTO-GENERATED:MCP-DOCS-START -->

This MCP server exposes **12 tools**, **25 resources**, and **7 prompts** for controlling your Commodore 64.

### Tools

#### c64.config

Grouped entry point for configuration reads/writes, diagnostics, and snapshots.

| Operation | Description | Required Inputs | Notes |
| --- | --- | --- | --- |
| `batch_update` | Apply multiple configuration updates in a single request. | — | — |
| `diff` | Compare the current configuration with a snapshot. | `path` | — |
| `get` | Read a configuration category or specific item. | `category` | — |
| `info` | Retrieve Ultimate hardware information and status. | — | — |
| `list` | List configuration categories reported by the firmware. | — | — |
| `load_flash` | Load configuration from flash storage. | — | — |
| `read_debugreg` | Read the Ultimate debug register ($D7FF). | — | — |
| `reset_defaults` | Reset firmware configuration to factory defaults. | — | — |
| `restore` | Restore configuration from a snapshot file. | `path` | — |
| `save_flash` | Persist the current configuration to flash storage. | — | — |
| `set` | Write a configuration value in the selected category. | `category`, `item`, `value` | — |
| `shuffle` | Discover PRG/CRT files and run each with optional screen capture. | — | — |
| `snapshot` | Snapshot configuration to disk for later restore or diff. | `path` | — |
| `version` | Fetch firmware version details. | — | — |
| `write_debugreg` | Write a hex value to the Ultimate debug register ($D7FF). | `value` | — |

#### c64.disk

Grouped entry point for disk mounts, listings, image creation, and program discovery.

| Operation | Description | Required Inputs | Notes |
| --- | --- | --- | --- |
| `create_image` | Create a blank disk image of the specified format. | `format`, `path` | — |
| `file_info` | Inspect metadata for a file on the Ultimate filesystem. | `path` | — |
| `find_and_run` | Search for a PRG/CRT by name substring and run the first match. | `nameContains` | — |
| `list_drives` | List Ultimate drive slots and their mounted images. | — | — |
| `mount` | Mount a disk image with optional verification and retries. | `drive`, `image` | supports verify |
| `unmount` | Remove the mounted image from an Ultimate drive slot. | `drive` | — |

#### c64.drive

Grouped entry point for drive power, mode, reset, and ROM operations.

| Operation | Description | Required Inputs | Notes |
| --- | --- | --- | --- |
| `load_rom` | Temporarily load a custom ROM into an Ultimate drive slot. | `drive`, `path` | — |
| `power_off` | Power off a specific Ultimate drive slot. | `drive` | — |
| `power_on` | Power on a specific Ultimate drive slot. | `drive` | — |
| `reset` | Issue an IEC reset for the selected drive slot. | `drive` | — |
| `set_mode` | Set the emulation mode for a drive slot (1541/1571/1581). | `drive`, `mode` | — |

#### c64.extract

Grouped entry point for sprite/charset extraction, memory dumps, filesystem stats, and firmware health checks.

| Operation | Description | Required Inputs | Notes |
| --- | --- | --- | --- |
| `charset` | Locate and extract 2KB character sets from RAM. | — | — |
| `firmware_health` | Run firmware readiness checks and report status metrics. | — | — |
| `fs_stats` | Walk the filesystem and aggregate counts/bytes by extension. | — | — |
| `memory_dump` | Dump a RAM range to hex or binary files with manifest metadata. | `address`, `length`, `outputPath` | — |
| `sprites` | Scan RAM for sprites and optionally export .spr files. | `address`, `length` | — |

#### c64.graphics

Grouped entry point for PETSCII art, sprite previews, and future bitmap generation.

| Operation | Description | Required Inputs | Notes |
| --- | --- | --- | --- |
| `create_petscii` | Generate PETSCII art from prompts, text, or explicit bitmap data. | — | — |
| `generate_bitmap` | Reserved high-resolution bitmap generator (coming soon). | — | — |
| `generate_sprite` | Build and run a sprite PRG from raw 63-byte sprite data. | `sprite` | — |
| `render_petscii` | Render PETSCII text with optional border/background colours. | `text` | — |

#### c64.memory

Grouped entry point for memory I/O, screen reads, and screen polling.

| Operation | Description | Required Inputs | Notes |
| --- | --- | --- | --- |
| `read` | Read a range of bytes and return a hex dump with address metadata. | `address` | — |
| `read_screen` | Return the current 40x25 text screen converted to ASCII. | — | — |
| `wait_for_text` | Poll the screen until a substring or regex appears, or timeout elapses. | `pattern` | — |
| `write` | Write a hexadecimal byte sequence into RAM. | `address`, `bytes` | supports verify |

#### c64.printer

Grouped entry point for Commodore and Epson printing helpers.

| Operation | Description | Required Inputs | Notes |
| --- | --- | --- | --- |
| `define_chars` | Define custom printer characters (Commodore DLL mode). | `firstChar`, `chars` | — |
| `print_bitmap` | Print a bitmap row via Commodore (BIM) or Epson ESC/P workflows. | `printer`, `columns` | — |
| `print_text` | Generate BASIC that prints text to device 4. | `text` | — |

#### c64.program

Grouped entry point for program upload, execution, and batch workflows.

| Operation | Description | Required Inputs | Notes |
| --- | --- | --- | --- |
| `batch_run` | Run multiple PRG/CRT programs with post-run assertions. | `programs` | — |
| `bundle_run` | Capture screen, memory, and debug registers into an artifact bundle. | `runId`, `outputPath` | — |
| `load_prg` | Load a PRG from Ultimate storage without executing it. | `path` | — |
| `run_crt` | Mount and run a CRT cartridge image. | `path` | — |
| `run_prg` | Load and execute a PRG located on the Ultimate filesystem. | `path` | — |
| `upload_run_asm` | Assemble 6502/6510 source, upload the PRG, and execute it. | `program` | supports verify |
| `upload_run_basic` | Upload Commodore BASIC v2 source and execute it immediately. | `program` | supports verify |

#### c64.rag

Grouped entry point for BASIC and assembly RAG lookups.

| Operation | Description | Required Inputs | Notes |
| --- | --- | --- | --- |
| `asm` | Retrieve 6502/6510 assembly references from the local knowledge base. | `q` | — |
| `basic` | Retrieve BASIC references and snippets from the local knowledge base. | `q` | — |

#### c64.sound

Grouped entry point for SID control, playback, composition, and analysis workflows.

| Operation | Description | Required Inputs | Notes |
| --- | --- | --- | --- |
| `analyze` | Automatically analyze SID playback when verification is requested. | `request` | — |
| `compile_play` | Compile SIDWAVE or CPG source and optionally play it immediately. | — | — |
| `generate` | Generate a lightweight SID arpeggio playback sequence. | — | — |
| `note_off` | Release a SID voice by clearing its gate bit. | `voice` | — |
| `note_on` | Trigger a SID voice with configurable waveform, ADSR, and pitch. | — | — |
| `pipeline` | Compile a SIDWAVE score, play it, and analyze the recording. | — | supports verify |
| `play_mod_file` | Play a MOD tracker module via the Ultimate SID player. | `path` | — |
| `play_sid_file` | Play a SID file stored on the Ultimate filesystem. | `path` | — |
| `record_analyze` | Record audio for a fixed duration and return SID analysis metrics. | `durationSeconds` | — |
| `reset` | Soft or hard reset of SID registers to clear glitches. | — | — |
| `set_volume` | Set the SID master volume register at $D418 (0-15). | `volume` | — |
| `silence_all` | Silence all SID voices with optional audio verification. | — | supports verify |

#### c64.stream

Grouped entry point for starting and stopping Ultimate streaming sessions.

| Operation | Description | Required Inputs | Notes |
| --- | --- | --- | --- |
| `start` | Start an Ultimate streaming session toward a host:port target. | `stream`, `target` | — |
| `stop` | Stop an active Ultimate streaming session. | `stream` | — |

#### c64.system

Grouped entry point for power, reset, menu, and background task control.

| Operation | Description | Required Inputs | Notes |
| --- | --- | --- | --- |
| `list_tasks` | List known background tasks with status metadata. | — | — |
| `menu` | Toggle the Ultimate menu button for navigation. | — | — |
| `pause` | Pause the machine using DMA halt until resumed. | — | — |
| `poweroff` | Request a controlled shutdown via the Ultimate firmware. | — | — |
| `reboot` | Trigger a firmware reboot to recover from faults. | — | — |
| `reset` | Issue a soft reset without cutting power. | — | — |
| `resume` | Resume CPU execution after a DMA pause. | — | — |
| `start_task` | Start a named background task that runs on an interval. | `name`, `operation` | — |
| `stop_all_tasks` | Stop every running background task and persist state. | — | — |
| `stop_task` | Stop a specific background task and clear its timer. | `name` | — |

### Resources

| Name | Summary |
| --- | --- |
| `c64://docs/index` | Explains how to approach each knowledge bundle and when to consult it. |
| `c64://context/bootstrap` | Step-by-step rules for safe automation, verification, and rollback on the C64. |
| `c64://specs/basic` | Token definitions, syntax rules, and device I/O guidance for BASIC v2. |
| `c64://docs/basic/pitfalls` | Quickref covering quotation handling, line length, tokenization, variable names, and other BASIC traps. |
| `c64://specs/assembly` | Official opcode matrix, addressing modes, and zero-page strategy for the 6510 CPU. |
| `c64://specs/sid` | Register map, waveform behaviour, and ADSR envelopes for expressive SID playback. |
| `c64://specs/sidwave` | Defines the SIDWAVE interchange format used by the SID composer workflow. |
| `c64://docs/sid/file-structure` | Explains PSID/RSID headers, metadata blocks, and compatibility notes for imported music. |
| `c64://docs/sid/best-practices` | Captures proven waveforms, ADSR presets, phrasing, and verification workflow for pleasant SID music. |
| `c64://specs/vic` | Covers raster timing, sprite control, colour RAM, and bitmap modes on the VIC-II. |
| `c64://specs/charset` | Character code table mapping PETSCII codes to screen codes, glyphs, and keyboard input. |
| `c64://docs/petscii-style` | Documents colour palette, readability presets, dithering patterns, and best practices for creating artistic and readable PETSCII displays. |
| `c64://docs/sprite-charset-workflows` | Documents sprite and charset workflows, memory layout, VIC-II configuration, common pitfalls, and proven techniques for hardware-accelerated graphics. |
| `c64://specs/memory-map` | Page-by-page breakdown of the 64 KB address space with hardware, ROM, and RAM regions. |
| `c64://specs/memory-low` | Documents zero-page variables, BASIC pointers, and KERNAL workspace addresses. |
| `c64://specs/memory-kernal` | Lists KERNAL ROM vectors and service routines for OS-level functionality. |
| `c64://specs/io` | Covers VIC-II, SID, CIA, and system control registers with address ranges and usage notes. |
| `c64://specs/cia` | Details CIA 1/2 registers, timers, interrupts, and keyboard matrix layout. |
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

## Troubleshooting 🛟

If the MCP server is not reachable or VS Code integration isn't working, see the comprehensive troubleshooting guide:

**📋 [MCP Troubleshooting Guide](doc/troubleshooting-mcp.md)**

Quick diagnosis commands:

```bash
# Start stdio server
npm start
```
