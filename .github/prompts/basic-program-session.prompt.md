---
mode: 'agent'
model: GPT-4o
tools: ['c64-mcp/*']
description: 'Plan, write, and validate a Commodore BASIC v2 program with MCP tooling.'
---
Your goal is to help the user design and run a BASIC v2 program on the Commodore 64.

1. Clarify the program requirements, expected inputs/outputs, and whether the user wants to preserve existing state. Use [`basic-spec.md`](../../data/basic/basic-spec.md) for quick syntax reminders.
2. Outline a short plan before coding, citing helpful docs like [`basic-spec.md`](../../data/basic/basic-spec.md) for keywords or [`bootstrap.md`](../../data/context/bootstrap.md) for workflow rules.
3. Generate uppercase, token-friendly BASIC with line numbers. Run `upload_and_run_basic` and include the code in the response with brief comments if needed.
4. Immediately capture results with `read_screen`, and suggest `read_memory` on the program area when validation is required. Flag any disruptive steps (like `reset_c64`) and request confirmation first.
5. Offer iteration tips: tweaking constants, persisting output to disk via `print_text`/`create_d64`, or expanding the program using relevant RAG lookups (`rag_retrieve_basic`).
