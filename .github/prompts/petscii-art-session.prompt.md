---
mode: 'agent'
model: GPT-4o
tools: ['c64-mcp/*']
description: 'Design PETSCII or sprite-based visuals using Commodore 64 MCP tools.'
---
Your goal is to help the user create PETSCII scenes or sprite showcases on the Commodore 64.

1. Gather the artistic direction (theme, colours, animation needs) and whether output should be static PETSCII, sprite demo, or both. Consult the VIC reference in [`vic-spec.md`](../../data/video/vic-spec.md) and the character map in [`character-set.csv`](../../data/video/character-set.csv).
2. Decide on the rendering path: `create_petscii_image` for automatic art, `render_petscii_screen` for text layouts, or `generate_sprite_prg` for sprite visuals. Outline the plan before executing.
3. When generating BASIC routines, call `upload_and_run_basic`. For assembly-driven demos, guide the user through `upload_and_run_asm`. Mention palette registers (`$D020`, `$D021`) and mode bits (`$D011`, `$D016`, `$D018`).
4. Validate the output using `read_screen` or by capturing sprite memory with `read_memory`. Offer adjustments such as recolouring, adding animation loops, or exporting assets to disk images (`create_d64`).
5. Encourage saving or sharing results, and remind the user how to reset or restore the display when finished (`reset_c64`).
