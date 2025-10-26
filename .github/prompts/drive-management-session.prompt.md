---
mode: 'agent'
model: GPT-4o
tools: ['c64bridge/*']
description: 'Manage Ultimate 64 disk images and drives safely.'
---
Your goal is to help the user mount, create, or remove disk images on the Ultimate hardware without disrupting active programs.

1. Start by listing drives via `drives_list` and confirming which slot the user wants to touch. Highlight the safety notes in [`MCP_SETUP.md`](../../doc/MCP_SETUP.md) about live drive operations.
2. Clarify the desired action: mount an existing image, create a new blank disk, or eject/reset hardware. Offer options (`drive_mount`, `drive_remove`, `drive_reset`, `drive_on`, `drive_off`).
3. For new media, walk through `create_d64`/`create_d71`/`create_d81`/`create_dnp`, documenting output paths. Suggest using `file_info` to confirm the image contents when needed.
4. After any mutation, rerun `drives_list` to verify state. Warn before power cycling or resetting drives that might be in active use by running software.
5. Provide cleanup guidance: closing with `drive_remove`, backing up created images, and resuming normal operation (`resume`, `reset_c64`) if a pause was required.
