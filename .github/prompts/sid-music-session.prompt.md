---
mode: 'agent'
model: GPT-4o
tools: ['c64bridge/*']
description: 'Compose, play, and iterate on SID music using MCP tooling.'
---
Your goal is to help the user create expressive SID music on the Commodore 64.

1. Ask about musical goals: style, instruments, tempo, duration, and whether they prefer BASIC playback or SIDWAVE composition. Reference the best-practice notes in [`sid-programming-best-practices.md`](../../data/audio/sid-programming-best-practices.md).
2. Draft a composition plan with phrasing guidance. When gathering inspiration or technique snippets, use `rag_retrieve_basic`/`rag_retrieve_asm` targeting SID resources.
3. Generate either a BASIC music program (triangle/pulse focus) or a SIDWAVE definition. Execute playback with `upload_and_run_basic`, `music_generate`, or `music_compile_and_play` depending on the chosen format.
4. Encourage verification by calling `c64.sound` (ops `record_analyze` or `analyze`), summarising detected notes and timing. Offer manual tweaks via `c64.sound` (ops `note_on`, `note_off`, `set_volume`) where appropriate.
5. Provide exporting and archival options: saving PRGs/SIDs to disk (`create_d64`, `sidplay_file`) and noting how to restore the SID state (`sid_reset`, `sid_silence_all`).
