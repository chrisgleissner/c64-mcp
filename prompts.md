# Prompt Registry

Canonical templates for common intents. Use these as scaffolds; do not hardcode device-specific assumptions unless necessary. Include provenance comments on injection.

## Compose Song
<!-- Template ID: compose_song -->
Goal: Create a simple, pleasant SID melody with expressive phrasing.
Guidelines:
- Use triangle/pulse wave, reasonable ADSR (A=1–2, D=2–4, S=6–10, R=3–6)
- Vary note lengths; add phrase breathing
- C major patterns are fine for demos

Output:
- Either a BASIC music program or SIDWAVE specification
- Include tempo and approximate bars

## Disassemble Memory Range
<!-- Template ID: disassemble_memory -->
Goal: Inspect memory and decode a range.
Input: start address (hex), length.
Steps:
1) Read memory range
2) Decode to opcodes and annotate known vectors (KERNAL, screen)
3) Provide safety notes and next steps

## Generate PETSCII Art
<!-- Template ID: generate_petscii_art -->
Goal: Produce PETSCII image or text effect.
Input: prompt or explicit text, optional colors.
Steps:
1) Retrieve 1–3 relevant references (RAG)
2) Create BASIC program, run if allowed
3) Return bitmap/program and used references

## Print Text (Commodore/Epson)
<!-- Template ID: print_text -->
Goal: Print strings on device 4.
Steps:
1) Choose target: commodore|epson
2) Generate BASIC with OPEN/PRINT#
3) Optionally add form feed and close channels

## Sprite Demo
<!-- Template ID: sprite_demo -->
Goal: Show a moving sprite with basic controls.
Steps:
1) Retrieve an example (RAG)
2) Assemble PRG to set VIC-II registers and loop
3) Run and verify on screen
