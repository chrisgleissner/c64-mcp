# Bun Migration Checklist

> Track the incremental migration from Node.js/npm tooling to Bun.  
> Update each item as it is completed and keep a short note/date beside the checkbox.

## Foundations

- [ ] Capture baseline metrics (install/build/test timings, coverage reports) for comparison.
- [ ] Introduce Bun toolchain alongside existing Node workflow (lockfile, `packageManager`, basic `bun install` smoke test).

## Package & Tooling

- [ ] Update `package.json` scripts to use Bun equivalents while keeping Node fallbacks where required.
- [ ] Ensure `bun run build` reproduces the existing `dist/` layout (compare key artifacts).
- [ ] Add an automated check that validates the published package still runs under `npm install` + `node`.

## Test Suite

- [ ] Migrate test runner to `bun test`, converting assertion helpers and harness utilities.
- [ ] Ensure `bun test` runs the full suite with the same semantics (mock servers, fixtures, CLI tools).
- [ ] Provide an explicit npm/node compatibility test (e.g., `npm test` wrapper or integration smoke test).

## Coverage & Reporting

- [ ] Replace `c8` with Bun’s coverage tooling and export lcov output.
- [ ] Verify Codecov integration with the new coverage artifacts.

## Scripts & Utilities

- [ ] Port repository scripts (`scripts/*.mjs`) from Node-specific loaders/`ts-node` to Bun-native execution.
- [ ] Replace `register-ts-node` usage with Bun-compatible module loading.
- [ ] Update shell helpers (e.g., `run-mcp-check.sh`, `c64-tool.sh`) to call Bun commands by default.

## Automation & CI

- [ ] Update GitHub Actions to install Bun (`oven-sh/setup-bun`) and run build/test/coverage using Bun.
- [ ] Ensure Docker-based checks (if any) consume the new Bun workflow without regressions.

## Docker & Runtime

- [ ] Rebuild the Dockerfile using an official Bun base image; retain runtime parity and entrypoints.
- [ ] Confirm resulting image passes existing smoke tests and compatibility checks.

## Documentation

- [ ] Refresh README, developer docs, and setup guides to reference Bun (with a note about Node compatibility).
- [ ] Document the npm/node compatibility verification process for external consumers.

## Final Verification

- [ ] Run full validation suite: `bun install`, `bun run build`, `bun test --coverage`, npm compatibility smoke test.
- [ ] Compare final artifacts and confirm no API/package layout changes.
- [ ] Remove obsolete Node-only tooling and close out migration notes.

