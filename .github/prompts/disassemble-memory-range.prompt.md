---
description: Disassemble memory range template
mode: agent
---

<!-- id: disassemble_memory -->
<!-- keywords: disassemble, decode, memory, dump, range -->

Goal: Inspect a memory range and decode it into 6502 opcodes.
Input: start address in hex and byte length.
Steps:
1. Read the memory range using the REST API.
2. Decode bytes into opcodes and annotate known vectors (KERNAL, screen, etc.).
3. Provide safety notes and next steps for the operator.
