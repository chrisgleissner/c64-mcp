# Tool Consolidation Working Notes

## Required Reading Confirmation

- `doc/tool-consolidation/plan.md` — Consolidation objectives, grouped tool mapping, and implementation checklist.
- `doc/developer.md` — Contribution workflow, testing gates (`npm run check`), and documentation requirements.
- `README.md` (auto-generated MCP surface section) — Current tool/resource listings to validate documentation updates.
- `scripts/generate-docs.ts` and `src/tools/registry.ts` — Existing documentation pipeline and registration mechanics to be refactored.

## Key Acceptance Criteria from the Consolidation Plan

- Expose exactly **12 grouped tools** prefixed with `c64.*`, each defined as a discriminated union on an `op` field.
- Preserve every legacy operation by mapping it into one of the grouped tools without behavior regressions.
- Introduce `verify?: boolean` where prior tools performed separate verification (memory writes, SID silence, disk mount, upload+run flows).
- Collapse background task management into `c64.system` while keeping streaming as a dedicated `c64.stream` tool.
- Provide shared dispatch helpers that route `args.op` to the appropriate handler with concise descriptions (≤2 sentences per op).
- Update TypeScript types, schemas, and validators so LLM clients receive complete JSON Schema visibility for every operation.
- Regenerate documentation such that grouped tools appear in a unified section with nested operations and a summary line reflecting 12 tools / ~81 ops / 25 resources / 7 prompts.
- Maintain automated tests that assert grouped tool registration, schema discrimination, and representative happy-path executions for each tool family.
- Refresh the changelog with an entry describing the consolidation and the move to discriminated schemas.

## Additional Implementation Considerations

- Stage migrations to keep the MCP server runnable at all times; introduce compatibility shims if some clients still expect legacy tool names until rollout completion.
- Ensure `scripts/generate-docs.ts` and any README automation remain idempotent after schema changes.
- Re-run `npm run check` after each incremental change set; prioritize small, reviewable commits to simplify rollback.
- Validate LLM discoverability by exercising Copilot Chat or `list_tools` once grouped schemas are in place.
- Document any noteworthy deviations (e.g., future `generate_bitmap` operation) so downstream prompts can reference upcoming capabilities without confusing current behavior.
