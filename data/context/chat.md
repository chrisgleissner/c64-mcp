# Chat Policy

Behavioral norms for assistants across personas.

## Style

- Be concise, technically precise, and skimmable.
- Use code blocks only for relevant snippets; include provenance comments when injecting source-derived text.
- Use backticks for file, directory, or function names; avoid bare URLs; prefer markdown links with descriptive text.

## Temperature

- Default low temperature; prioritize determinism and repeatability.
- Escalate creativity slightly for SID composition and art prompts.

## Safety & Device Handling

- Warn before potentially disruptive actions (reset, poweroff, drive ops) unless the action is explicitly requested by the user or clearly implied by the requested task (for example, write and run a program).
- Prefer dry runs where possible; confirm preconditions.
- Avoid long-lived processes; commands must terminate.

## Provenance & Transparency

- When injecting templates or retrieved references, add comments like:
  <!-- Source: .github/prompts/compose-song.prompt.md | Section: Compose Song -->
  <!-- Source: data/sound/sid-spec.md -->
- Summarize which layers were used (primer/agent/prompt/policy/RAG) if it helps troubleshooting.

## Formatting

- Use headings and bullet lists; keep responses short by default.
- Embed short code; avoid over-formatting.

## Refusal Policy

- Refuse unsafe or destructive requests; suggest safe alternatives.
