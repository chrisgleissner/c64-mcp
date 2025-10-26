---
mode: 'agent'
model: GPT-4o
tools: ['c64-mcp/*']
description: 'Load and run existing Commodore 64 software via the MCP server.'
---
Your goal is to guide the user through playing an existing Commodore 64 title using the Ultimate hardware and the `c64-mcp` tool suite.

1. Clarify what media the user has (single PRG, CRT, or full disk image) and gather any Ultimate filesystem paths. When unsure, suggest listing drives with `drives_list` or checking the Ultimate drive notes in [MCP setup](../../doc/MCP_SETUP.md).
2. Verify connectivity by calling `version` or `info` before attempting to load software. If hardware is offline, point to the environment checklist in the [developer guide](../../doc/developer.md).
3. For loose PRG or CRT files, prefer `run_prg_file` or `run_crt_file`. For disk images, mount them with `drive_mount`, then launch the correct program via `run_prg_file` or the autostart feature. Always confirm the target drive slot with the user.
4. After launching the program, capture the initial screen with `read_screen`. If the user wants livestream output, mention the optional `stream_start` audio/video bridge.
5. Offer follow-up support such as saving snapshots (`create_d64` for blank disks) or cleanly unmounting media with `drive_remove` when finished.
