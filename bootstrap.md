# C64 MCP Bootstrap Primer

This primer provides a concise, synthesized overview of the C64 MCP server and the key technical domains it supports. Keep it short, factual, and stable; this content is injected into every assistant session as the global "brain stem".

## System Overview
- The server exposes a Model Context Protocol (MCP) surface to control an Ultimate 64/Commodore 64 Ultimate over its REST API.
- Capabilities: program upload/run (BASIC, 6502/6510 ASM), memory/screen I/O, drive management, SID audio control, audio analysis, and local RAG retrieval over examples and docs.
- Local RAG indexes BASIC/ASM examples and technical docs under `doc/`, enabling semantic retrieval.

## Languages & Tools
- BASIC v2: line-numbered programs, tokenized to PRG. Typical I/O via `PRINT`, `POKE`, `PEEK`, `OPEN`, device 4 for printers.
- 6502/6510 Assembly: machine code for C64; important chips: VIC-II ($D000), SID ($D400), CIA1/2 ($DC00/$DD00). IRQ/NMI timing matters.
- PETSCII: Character set and screen codes; border ($D020) and background ($D021) colors.
- SID Music: 3 voices, waveforms (pulse, saw, triangle, noise), ADSR envelope, filters. For pleasant tones see `doc/sid-programming-best-practices.md`.

## Common Addresses
- Screen RAM: $0400–$07E7, Color RAM: $D800–$DBE7
- VIC-II registers: $D000–$D02E (sprites, raster, scroll), border/background: $D020/$D021
- SID registers: $D400–$D418 (voice freq/gate/adsr), master volume/filter: $D418

## Typical Workflows
- Upload & run BASIC: generate PRG from text; use RAG to enrich prompts (e.g., PETSCII art).
- Upload & run ASM: assemble source to PRG; use RAG for raster/sprite examples.
- SID Composition: generate/compile/play; verify with audio analysis and feedback loop.

## RAG Retrieval
- Indexed categories: `basic`, `asm`, `mixed`, `hardware`, `other`.
- Retrieval returns relevant textual chunks (with provenance comments when available) to scaffold solutions.

## Context Layers
- `bootstrap.md`: global primer (this file). Always injected first.
- `agents.md`: personas/skills (selectable personas for tasks).
- `prompts.md`: canonical prompt templates for common intents.
- `chat.md`: conversational policies (tone, formatting, safety).
- `doc/*.md`: the main technical corpus for RAG.

## Injection Order
1) System Primer → 2) Agent Layer → 3) Prompt Layer → 4) Chat Policy → 5) Dynamic RAG → 6) User Message

## Provenance
When injecting templates or retrieved chunks, include HTML comments such as:
<!-- Source: prompts.md | Section: Compose Song -->

## Notes
- Keep this primer 3–8 KB, stable, and vendor-neutral.
- All other layers remain human-readable single files; avoid fragmentation.
