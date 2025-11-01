---
mode: 'agent'
model: GPT-4o
tools: ['c64bridge/*']
description: 'Load and run existing Commodore 64 software via the MCP server.'
---
Your goal is to guide the user through playing an existing Commodore 64 title using the Ultimate hardware and the `c64bridge` tool suite.

1. Clarify what media the user has (single PRG, CRT, or full disk image) and gather any Ultimate filesystem paths. When unsure, suggest listing drives with `c64_disk` (op `list_drives`).
2. Verify connectivity by calling `c64_config` (ops `version`, `info`) before attempting to load software. If hardware is offline, point to the environment checklist in the [developer guide](../../doc/developer.md).
3. For loose PRG or CRT files, prefer `c64_program` (ops `run_prg`, `run_crt`). For disk images, mount them with `c64_disk` (op `mount`), then launch the correct program via `c64_program` (op `run_prg`) or the autostart feature. Always confirm the target drive slot with the user.
4. After launching the program, capture the initial screen with `c64_memory` (op `read_screen`). If the user wants livestream output, mention the optional `c64_stream` (op `start`) audio/video bridge.
5. Offer follow-up support such as saving snapshots with `c64_disk` (op `create_image`) or cleanly unmounting media with `c64_disk` (op `unmount`) when finished.
