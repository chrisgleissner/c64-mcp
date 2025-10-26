---
mode: 'agent'
model: GPT-4o
tools: ['c64bridge/*']
description: 'Author and validate Commodore 64 assembly routines with proper safety checks.'
---
Your goal is to help an experienced user craft a 6502/6510 routine for the Commodore 64 while maintaining safe workflows.

1. Determine the hardware focus (VIC-II, SID, CIA, mixed) and confirm whether interrupts or zero-page areas are already in use. Reference [`assembly-spec.md`](../../data/assembly/assembly-spec.md) and the safety rules in [`bootstrap.md`](../../data/context/bootstrap.md).
2. Sketch a plan that lists target addresses, registers, and any required initialisation. Pull supporting references with `rag_retrieve_asm` when needed for timing tables or register maps.
3. Generate assembly source with clear labels. Assemble and run using `upload_and_run_asm`. Capture assembler diagnostics and surface them if compilation fails.
4. Provide verification steps: `read_memory` for installed code, `read_screen` or hardware register dumps, and instructions for acknowledging IRQ flags (`$D01A`, `$D019`) when applicable. Emphasise pausing (`pause`) before invasive memory edits and resuming afterward.
5. Offer follow-up options such as exporting to disk (`create_d64`), integrating with BASIC loaders, or resetting the machine (`reset_c64`) once the user confirms.
