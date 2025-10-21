## Agent Integration Guide

This server exposes a Model Context Protocol (MCP) surface for driving a Commodore 64 (Ultimate 64/Commodore 64 Ultimate) over its REST API. It is designed for agent workflows that need to upload/run programs, inspect memory/screen state, control devices, or retrieve C64 knowledge snippets.

### Run the server
- Install and configure per the README (“Install” and “Quick start”).
- Start the server locally:

```bash
npm start
```

The server listens on `http://localhost:8000` (override with `PORT`). The MCP manifest lives in your working copy at `src/mcpManifest.json`.

### Capabilities at a glance
- **Program runners**: `upload_and_run_basic`, `upload_and_run_asm`, `upload_and_run_program`, `run_prg_file`, `load_prg_file`, `run_crt_file`, `sidplay_file`, `modplay_file`.
- **Screen & memory**: `read_screen`, `read_memory`, `write_memory`.
- **System control**: `reset_c64`, `reboot_c64`, `version`, `info`, `pause`, `resume`, `poweroff`, `menu_button`, `debugreg_read`, `debugreg_write`.
- **Drives & files**: `drives` (list), `drive_mount`, `drive_remove`, `drive_reset`, `drive_on`, `drive_off`, `drive_mode`, `file_info`, `create_d64`, `create_d71`, `create_d81`, `create_dnp`.
- **SID / music**: `sid_volume`, `sid_reset`, `sid_note_on`, `sid_note_off`, `sid_silence_all`, `music_generate`. For a concise SID overview document, use `GET /knowledge/sid_overview`. For practical SID programming with pleasant musical results, see `doc/sid-programming-best-practices.md`.
- **Audio analysis**: `analyze_audio` - Records and analyzes audio output to verify generated music, detects pitch, notes, and provides feedback for iterative composition.
- **Knowledge & RAG**: `basic_v2_spec`, `asm_quick_reference`, `rag_retrieve_basic`, `rag_retrieve_asm`, plus `GET /rag/retrieve` for quick experiments.

Refer to `src/mcpManifest.json` for the complete tool list and parameter types.

### Use with GitHub Copilot Chat (VS Code)
1) Enable MCP support (Copilot Chat v1.214+): Settings → Extensions → GitHub Copilot → Chat: Experimental: MCP → enable, then restart VS Code.
2) Add the server under Settings → GitHub Copilot → Experimental → MCP Servers:

```json
{
  "github.copilot.chat.experimental.mcp": {
    "servers": [
      {
        "name": "c64-mcp",
        "url": "http://localhost:8000",
        "manifestPath": "/absolute/path/to/your/checkout/src/mcpManifest.json",
        "type": "http"
      }
    ]
  }
}
```

3) Keep `npm start` running. In Copilot Chat, invoke tools by natural language (e.g. “Upload and run this BASIC program”, “Read the current screen”, “Write $D020=2”).

### Use with other MCP clients
- Point the client at `http://localhost:8000` and load `src/mcpManifest.json`.
- Expose the tools you need to the LLM session; call them with JSON bodies as described in the manifest.

### HTTP examples (manual testing)
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
- Some tools can affect device state (e.g. power, reboot, drive ops). Use them deliberately.
- The server includes a local RAG over examples in `data/` and optional fetched sources; see the README for details.
- For optimal SID music results, see `doc/sid-programming-best-practices.md` which documents successful approaches for pleasant, musical sounds.

### Audio Feedback Loop Workflow

The server supports an intelligent audio verification workflow for iterative music composition:

1. **Compose**: Use `music_generate` or `upload_and_run_basic` to create and play SID music
2. **Verify**: Use natural language like "check the music", "verify the song", or "does it sound right?"
3. **Analyze**: The `analyze_audio` tool automatically detects verification requests and records/analyzes audio
4. **Feedback**: Get detailed analysis including detected notes, pitch accuracy, and musical feedback
5. **Iterate**: Use the feedback to refine your composition

The workflow has been proven successful with real hardware testing. For best results, use the triangle wave approach and ADSR settings documented in `doc/sid-programming-best-practices.md`.

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
