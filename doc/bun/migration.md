# Bun Migration Strategy

Our goal is to adopt Bun everywhere it improves speed (local dev, CI, container builds) **without sacrificing Node compatibility** for downstream consumers.

---

## Approach Overview

1. **Track incremental work via the checklist** (`doc/bun/migration-checklist.md`).
2. **Introduce Bun tooling in parallel** with Node/npm. Validate parity before turning off Node paths.
3. **Port the build/test pipeline** to Bun (`bun install`, `bun run build`, `bun test --coverage`) and keep comparing against Node outputs (especially `dist/` packaging).
4. **Update automation and docs** once Bun passes all checks.
5. **Retain Node smoke tests** to ensure published artifacts remain consumable by Node users.

### Current Status (2025-10-29)

- Baseline Node metrics captured (`npm run build` ~10.44 s, `npm test` ~47.61 s) in `doc/bun/baseline-metrics.md`.
- Bun toolchain bootstrapped alongside Node (`bun.lock`, `packageManager`, smoke `bun install`).
- Added `npm run check:node-compat` (packs the module, installs via npm, and imports key ESM modules with Node) to guard compatibility as we iterate.
- `bun run build` verified to produce the same `dist/` output as the Node workflow.

---

## Guardrails

### 1. Build & Runtime Rules

- Sources remain TypeScript, emitting standard ESM/CJS modules compatible with Node.
- Published code may not depend on Bun-only APIs (no `Bun.file`, `Bun.serve`, etc.).
- The compiled `dist/` must execute under both **Bun ≥1.1** and **Node ≥24**.
- `package.json` stays valid for npm clients (no Bun-only metadata).

### 2. CI Strategy (Asymmetric Validation)

- **Primary path (PRs, default CI):**

  ```bash
  bun install
  bun run build
  bun test --coverage
  ```

- **Release/nightly Node validation (reuse `dist/`):**

  ```bash
  npm ci --omit=dev
  node dist/index.js --version
  npm test -- --smoke
  ```

### 3. Docker Strategy

Build with Bun, run with Node:

```dockerfile
FROM oven/bun:latest AS build
WORKDIR /app
COPY . .
RUN bun install && bun run build

FROM node:24-slim
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY package.json .
CMD ["node", "dist/index.js"]
```

### 4. Validation Matrix

- **Bun:** install/build/test/coverage on every PR.
- **Node:** smoke tests on main branch, releases, or nightly jobs.
- **Rule:** only build once; reuse Bun artifacts for Node checks.

### 5. Documentation Messaging
>
> Built and tested with **Bun** ⚡  
> Fully compatible with **Node.js 24+** 🟩

---

## Next Steps

Use this document together with the checklist to plan each migration phase. Update both as milestones are completed and ensure the guardrails stay enforced.
