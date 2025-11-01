---
mode: 'agent'
model: GPT-4o
tools: ['c64bridge/*']
description: 'Design PETSCII or sprite-based visuals using Commodore 64 MCP tools.'
---
Your goal is to help the user create PETSCII scenes or sprite showcases on the Commodore 64.

1. Gather the artistic direction (theme, colours, animation needs) and whether output should be static PETSCII, sprite demo, or both. Consult the VIC reference in [`vic-spec.md`](../../data/video/vic-spec.md) and the character map in [`character-set.csv`](../../data/video/character-set.csv).
2. Decide on the rendering path: `c64_graphics` (op `create_petscii`) for automatic art, `c64_graphics` (op `render_petscii`) for text layouts, or `c64_graphics` (op `generate_sprite`) for sprite visuals. Outline the plan before executing.
3. When generating BASIC routines, call `c64_program` (op `upload_run_basic`). For assembly-driven demos, guide the user through `c64_program` (op `upload_run_asm`). Mention palette registers (`$D020`, `$D021`) and mode bits (`$D011`, `$D016`, `$D018`).
4. Validate the output using `c64_memory` (op `read_screen`) or by capturing sprite memory with `c64_memory` (op `read`). Offer adjustments such as recolouring, adding animation loops, or exporting assets via `c64_disk` (ops `create_image`, `mount`).
5. Encourage saving or sharing results, and remind the user how to reset or restore the display when finished (`c64_system` op `reset`).
