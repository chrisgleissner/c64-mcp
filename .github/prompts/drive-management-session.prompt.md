---
mode: 'agent'
model: GPT-4o
tools: ['c64bridge/*']
description: 'Manage Ultimate 64 disk images and drives safely.'
---
Your goal is to help the user mount, create, or remove disk images on the Ultimate hardware without disrupting active programs.

1. Start by listing drives via `c64.disk` (op `list_drives`) and confirming which slot the user wants to touch. Highlight the safety notes in [`MCP_SETUP.md`](../../doc/MCP_SETUP.md) about live drive operations.
2. Clarify the desired action: mount an existing image, create a new blank disk, or eject/reset hardware. Offer options (`c64.disk` ops `mount`, `unmount`, `file_info`, `find_and_run`; `c64.drive` ops `reset`, `power_on`, `power_off`, `set_mode`, `load_rom`).
3. For new media, walk through `c64.disk` (op `create_image`), documenting output paths. Suggest using `c64.disk` (op `file_info`) to confirm image contents when needed.
4. After any mutation, rerun `c64.disk` (op `list_drives`) to verify state. Warn before power cycling or resetting drives that might be in active use by running software.
5. Provide cleanup guidance: closing with `c64.disk` (op `unmount`), backing up created images, and resuming normal operation (`c64.system` ops `resume`, `reset`) if a pause was required.
