# Agent Integration Guide

This server exposes a Model Context Protocol (MCP) surface for driving a Commodore 64 (Ultimate 64/Commodore 64 Ultimate) over its REST API. It is designed for agent workflows that need to upload and run programs, inspect memory or screen state, control devices, or retrieve C64 knowledge snippets.

## Configuration Artifacts

- `mcp.json` is the human-maintained project configuration. It declares CLI metadata, environment variables, and packaging details for npm distribution.
- MCP clients discover tools dynamically at runtime over stdio; no manifest file is required.
- `doc/MCP_SETUP.md` walks through installation, configuration resolution, and MCP client wiring.

## Quick Start

### Run the Server

- Install dependencies via `npm install`.
- Configure your target endpoint as documented in `doc/MCP_SETUP.md`.
- Start the stdio MCP server locally:

```bash
npm start
```

`npm start` launches the TypeScript entry point (`src/mcp-server.ts`). The command prints connectivity diagnostics (REST probe plus zero-page read) before announcing `c64bridge MCP server running on stdio`.

### Capabilities at a Glance

- **Program runners**: `upload_and_run_basic`, `upload_and_run_asm`, `upload_and_run_program`, `run_prg_file`, `load_prg_file`, `run_crt_file`, `sidplay_file`, `modplay_file`.
- **Screen & memory**: `read_screen`, `read_memory`, `write_memory`.
- **System control**: `reset_c64`, `reboot_c64`, `version`, `info`, `pause`, `resume`, `poweroff`, `menu_button`, `debugreg_read`, `debugreg_write`.
- **Drives & files**: `drives` (list), `drive_mount`, `drive_remove`, `drive_reset`, `drive_on`, `drive_off`, `drive_mode`, `file_info`, `create_d64`, `create_d71`, `create_d81`, `create_dnp`.
- **SID / music**: `sid_volume`, `sid_reset`, `sid_note_on`, `sid_note_off`, `sid_silence_all`, `music_generate`. For a concise SID overview document, call `GET /knowledge/sid_overview`. For practical SID programming with expressive children's songs, see `data/audio/sid-programming-best-practices.md` and the example `data/basic/examples/audio/alle-meine-entchen-expressive.bas`.
- **Audio analysis**: `analyze_audio` records and analyzes audio output to verify generated music, detects pitch, notes, and provides feedback for iterative composition.
- **Knowledge & RAG**: `basic_spec`, `assembly_spec`, `rag_retrieve_basic`, `rag_retrieve_asm`, plus `GET /rag/retrieve` for quick experiments.

Tools and parameters are listed by the server at runtime via ListTools.

### Use with GitHub Copilot Chat (VS Code)

1. Enable MCP support (Copilot Chat v1.214+): Settings → Extensions → GitHub Copilot → Chat: Experimental: MCP → enable, then restart VS Code.
1. Add the server under Settings → GitHub Copilot → Experimental → MCP Servers (see `doc/MCP_SETUP.md` for the exact JSON snippet):

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

1. Keep `npm start` or the packaged CLI running so the stdio transport remains available.
1. In Copilot Chat, invoke tools by natural language (for example, “Upload and run this BASIC program”, “Read the current screen”, “Write $D020=2”).

### Use with Other MCP Clients

- Use stdio configuration as above; if using HTTP, point the client at `http://localhost:8000`.
- Expose the tools you need to the LLM session; call them with JSON bodies as described in the manifest.

### HTTP Examples (Manual Testing)

> [!NOTE]
> The Fastify HTTP bridge is deprecated and disabled by default. Launch it manually (see `doc/troubleshooting-mcp.md`) before running these legacy curl commands.

```bash
# Upload and run BASIC
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"program":"10 PRINT \"HELLO\"\n20 GOTO 10"}' \
  http://localhost:8000/tools/upload_and_run_basic | jq

# Read current screen content (PETSCII→ASCII)
curl -s http://localhost:8000/tools/read_screen | jq

# Reset the machine
curl -s -X POST http://localhost:8000/tools/reset_c64
```

### Notes

- Some tools can affect device state (for example, power, reboot, drive operations). Use them deliberately.
- The server includes a local RAG over examples in `data/` and optional fetched sources; see the README for details.
- For optimal SID music results, review `data/audio/sid-programming-best-practices.md`, which documents successful approaches for pleasant, musical sounds.

### Audio Feedback Loop Workflow

The server supports an intelligent audio verification workflow for iterative music composition:

1. **Compose**: Use `music_generate` or `upload_and_run_basic` to create and play SID music.
2. **Verify**: Use natural language like "check the music", "verify the song", or "does it sound right?"
3. **Analyze**: The `analyze_audio` tool automatically detects verification requests and records/analyzes audio.
4. **Feedback**: Get detailed analysis including detected notes, pitch accuracy, and musical feedback.
5. **Iterate**: Use the feedback to refine your composition.

The workflow has been proven successful with real hardware testing. For best results, use the triangle wave approach and ADSR settings documented in `data/audio/sid-programming-best-practices.md`.

Example workflow:

```bash
# Compose a song
curl -X POST -H 'Content-Type: application/json' \
  -d '{"request":"Generate a simple C major scale melody"}' \
  http://localhost:8000/tools/music_generate

# Verify the output
curl -X POST -H 'Content-Type: application/json' \
  -d '{"request":"check if the music sounds correct"}' \
  http://localhost:8000/tools/analyze_audio
```

### Children's Songs and Musical Expression

When creating children's songs or simple melodies, the server has proven approaches for musical expression:

**Key Principles for Engaging Melodies:**

- **Varied timing** – not all notes the same length (avoid mechanical feel).
- **Phrase breathing** – longer pauses between musical phrases (150–200 cycles).
- **Emphasis patterns** – important notes get longer duration (250–400+ cycles).
- **Character variation** – each verse or phrase has its own timing personality.
- **Triangle wave + proper ADSR** – produces warm, pleasant tones.

**Example Request Patterns:**

- "Create a simple children's song with musical expression"
- "Write a melody that tells a story, not just plays notes"
- "Make a song with proper phrasing and breathing"

**Reference Implementation:** `data/basic/examples/audio/alle-meine-entchen-expressive.bas` demonstrates these principles in a complete traditional German children's song with proper musical phrasing.

## Personas

Use these focused personas to seed agent context. Each section aligns with `.github/prompts/*.prompt.md` templates and the primer in `data/context/bootstrap.md`.

### BASIC Agent

- **Focus**: Commodore BASIC v2 programs, PETSCII, simple I/O, printing.
- **Strengths**: Tokenization pitfalls, line management, device I/O (device 4 printers), screen text.
- **Behaviors**: Produces runnable BASIC with proper tokens; uses RAG to recall examples.

### ASM Agent

- **Focus**: 6502/6510 assembly for C64—raster, sprites, IRQs, memory-mapped I/O.
- **Strengths**: Zero-page usage, addressing modes, VIC-II/SID/CIA registers, timing.
- **Behaviors**: Assembles to PRG; uses references for safe raster timing and sprite control.

### SID Composer

- **Focus**: Musical composition for SID—ADSR, waveforms, filters, pattern sequencing.
- **Strengths**: Expressive timing, phrasing, pleasant tone (triangle or pulse), pitch verification.
- **Behaviors**: Leverages the audio analysis feedback loop; references best practices.

### Memory Debugger

- **Focus**: Inspect and modify memory, disassemble ranges, verify screen or colour RAM.
- **Strengths**: Safe PEEK/POKE, address math, hex/decimal conversions, provenance.
- **Behaviors**: Careful with device state; provides reversible steps.

### Drive Manager

- **Focus**: Mount or create disk images, list drives, manage modes.
- **Strengths**: D64/D71/D81/DNP creation; IEC concepts; Ultimate menu usage.
- **Behaviors**: Conservative operations; confirms preconditions.

### VIC Painter

- **Focus**: Drawing with PETSCII and bitmap modes; sprites and raster effects.
- **Strengths**: VIC-II registers ($D000–$D02E), border/background ($D020/$D021), bitmap/charset setup, sprite multiplexing basics.
- **Behaviors**: Composes BASIC or ASM to draw images, set colours, position or move sprites; uses raster IRQ for stable timing when needed.
