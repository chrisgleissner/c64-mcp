# Bun Migration Baseline (Node.js)

Captured before introducing Bun tooling. All commands executed on the `bun-migration` branch using Node.js 18 (system default).

| Command | Notes | Duration |
|---------|-------|----------|
| `npm run build` | TypeScript compile + postbuild + README update | **10.44 s** |
| `npm test` | Full TAP suite via `scripts/run-tests.mjs` | **47.61 s** |

Additional context:

- Dependencies installed with `npm install` (fresh, no cache) before measuring.
- No Bun tooling in use; these timings represent our current Node-only baseline.
- Results recorded on 2025-10-29 to anchor future comparisons.

Next step: use these numbers to evaluate improvements once Bun drives install/build/test tasks.
