# Agent Integration Guide

LLM-facing reference for using this MCP server. Keep it simple: start the server, discover tools, call them safely.

## Quick Start

1) Install and run

```bash
npm install
npm start
```

On startup the server probes connectivity (REST + zero-page read) and announces it is running on stdio.

2) Configure target (optional)

The server resolves config in this order: `C64BRIDGE_CONFIG` → `~/.c64bridge.json` → `./c64bridge.json` → defaults (`host=c64u`, `port=80`).

Example:

```json
{ "c64u": { "host": "c64u", "port": 80 } }
```

3) VS Code Copilot Chat (MCP)

Add to Settings (JSON):

```json
{
  "github.copilot.chat.experimental.mcp": {
    "servers": [
      { "name": "c64bridge", "command": "node", "args": ["./node_modules/c64bridge/dist/index.js"], "type": "stdio" }
    ]
  }
}
```

Keep the server running; tools are discovered automatically in the chat session.

## MCP Discovery & Calling

- Discover tools: use the client’s ListTools. You will see domains like `c64.program`, `c64.memory`, `c64.system`, etc., each with an `op` multiplexing parameter.
- Discover resources/prompts: use ListResources and ListPrompts for knowledge and reusable patterns.
- Call pattern (all tools): pass a JSON object with `op` plus operation‑specific inputs shown by ListTools.

Examples (MCP tool calls; HTTP only for illustration):

```json
// c64.program — upload and run BASIC
{
  "op": "upload_run_basic",
  "program": "10 PRINT \"HELLO\"\n20 GOTO 10"
}
```

```json
// c64.memory — wait for output on the screen (ASCII)
{
  "op": "wait_for_text",
  "pattern": "HELLO"
}
```

```json
// c64.rag — retrieve BASIC or ASM references from local knowledge
{
  "op": "basic",
  "q": "draw a bouncing sprite"
}
```

## Capabilities

- Program runners: `c64.program` (`upload_run_basic`, `upload_run_asm`, `run_prg`, `run_crt`, `bundle_run`, `batch_run`)
- Screen & memory: `c64.memory` (`read`, `write`, `read_screen`, `wait_for_text`)
- System control: `c64.system` (`pause`, `resume`, `reset`, `reboot`, `poweroff`, `menu`, tasks)
- Configuration: `c64.config` (get/set, `batch_update`, `snapshot`, `restore`, `diff`, `shuffle`)
- Drives & files: `c64.disk`, `c64.drive`
- SID / music: `c64.sound` (playback, generate, analyze)
- Graphics: `c64.graphics` (PETSCII, sprites)
- Knowledge & RAG: `c64.rag` (BASIC and ASM lookups)

Tools and parameters are listed dynamically via ListTools.

## Expert Workflow (recommended)

- Plan → Run → Verify: generate code, run via `c64.program`, then verify with `c64.memory.read_screen`/`wait_for_text` and optional RAM checks.
- Prefer stdio transport; only use the HTTP bridge for manual inspection.
- Use `c64.rag` to fetch relevant BASIC/ASM snippets and specs before coding.
- BASIC tips: tokenised keywords, short variable names, careful quoting; keep lines ≤ 2 screen rows; prefer `PRINT` with explicit spacing.
- ASM tips: avoid unstable rasters; use zero page consciously; confirm register maps via `c64://specs/assembly`, `c64://specs/memory-map`, `c64://specs/vic` resources.
- Safety: only call reset/power/drive operations intentionally; confirm preconditions for mounts/writes; log reversible steps in chat.

## HTTP Examples (optional)

The stdio transport is preferred. The legacy HTTP bridge is deprecated and disabled by default; enable manually before using curl.

```bash
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"op":"upload_run_basic","program":"10 PRINT \"HELLO\"\n20 GOTO 10"}' \
  http://localhost:8000/tools/c64.program | jq

curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"op":"read_screen"}' \
  http://localhost:8000/tools/c64.memory | jq
```

## Safety Notes

- Some tools affect device state (power, reboot, drive ops). Use deliberately.
- Logs emit to stderr; stdout is reserved for the MCP protocol.

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
