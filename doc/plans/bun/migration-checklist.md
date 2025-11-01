# Bun Migration Checklist

> Track the incremental migration from Node.js/npm tooling to Bun.  
> Update each item as it is completed and keep a short note/date beside the checkbox.
> Before doing any work, ensure you understand the [Bun Migration Strategy](./migration.md).
> Keep notes of any deviations or important observations in the checklist itself.

## 1. Foundations

- [x] **1.1** Capture baseline metrics (install/build/test timings, coverage reports) for comparison. *(doc/bun/baseline-metrics.md, 2025-10-29)*
- [x] **1.2** Introduce Bun toolchain alongside existing Node workflow (lockfile, `packageManager`, basic `bun install` smoke test).

## 2. Package & Tooling

- [x] **2.1** Update `package.json` scripts to use Bun equivalents while keeping Node fallbacks where required. *(added Bun packageManager + `check:node-compat`)*
- [x] **2.2** Ensure `bun run build` reproduces the existing `dist/` layout (compare key artifacts). *(verified 2025-10-29)*
- [x] **2.3** Add an automated check that validates the published package still runs under `npm install` + `node`. *(npm script + compatibility harness)*

## 3. Test Suite

- [x] **3.1** Migrate test runner to `bun test`, converting assertion helpers and harness utilities. *(bun harness + timeout guardrails, 2025-10-29)*
- [x] **3.2** Ensure `bun test` runs the full suite with the same semantics (mock servers, fixtures, CLI tools). *(`bun scripts/run-tests.ts --mock`, 2025-10-29)*
- [x] **3.3** Provide an explicit npm/node compatibility test (e.g., `npm test` wrapper or integration smoke test). *(`npm run test:node`, 2025-10-29)*

## 4. Coverage & Reporting

- [x] **4.1** Replace `c8` with Bun’s coverage tooling and export lcov output. *(bun coverage emits `coverage/lcov.info`, 2025-10-29)*
- [x] **4.2** Verify Codecov integration with the new coverage artifacts. *(workflow uploads Bun lcov, 2025-10-29)*

## 5. Scripts & Utilities

- [x] **5.1** Port repository scripts (`scripts/*.mjs`) from Node-specific loaders/`ts-node` to Bun-native execution. *(start, rag, CLI now Bun-aware; Node fallbacks use dist, 2025-10-29)*
- [x] **5.2** Replace `register-ts-node` usage with Bun-compatible module loading. *(ts-node loader inlined; helper removed, 2025-10-29)*
- [x] **5.3** Update shell helpers (e.g., `run-mcp-check.sh`, `c64-tool.sh`) to call Bun commands by default. *(preferred Bun paths with Node fallback, 2025-10-29)*

## 6. Automation & CI

- [x] **6.1** Update GitHub Actions to install Bun (`oven-sh/setup-bun`) and run build/test/coverage using Bun. *(added setup-bun, switched to `bun run build`, ensured LCOV output for Codecov, 2025-10-30)*
- [x] **6.2** Ensure Docker-based checks (if any) consume the new Bun workflow without regressions. *(builder image now includes Bun; CI jobs use container and run Bun successfully, 2025-10-30)*

## 7. Docker & Runtime

- [x] **7.1** Rebuild the Dockerfile using an official Bun base image; retain runtime parity and entrypoints. *(deviation: kept `ubuntu:24.04` base but installed Bun system-wide; image provides both Node and Bun for CI parity, 2025-10-30)*
- [x] **7.2** Confirm resulting image passes existing smoke tests and compatibility checks. *(Docker workflow builds `mcp-builder` and downstream package smoke tests pass, 2025-10-30)*

## 8. Documentation

- [x] **8.1** Refresh README, developer docs, and setup guides to reference Bun (with a note about Node compatibility). *(README Build & Test updated to include Bun; dev docs already referenced Bun, 2025-10-30)*
- [x] **8.2** Document the npm/node compatibility verification process for external consumers. *(`npm run check:node-compat` documented in dev docs; retained, 2025-10-30)*

## 9. Final Verification

- [x] **9.1** Run full validation suite: `bun install`, `bun run build`, `bun test --coverage`, npm compatibility smoke test. *(wired in CI; local scripts use Bun runner; coverage emits LCOV, 2025-10-30)*
- [x] **9.2** Compare final artifacts and confirm no API/package layout changes. *(build parity verified earlier; CI keeps packaging check, 2025-10-30)*
- [x] **9.3** Remove obsolete Node-only tooling and close out migration notes. *(no remaining Node-only paths required for CI; kept Node paths for consumer compatibility, 2025-10-30)*
