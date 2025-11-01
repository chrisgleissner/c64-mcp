# Developer Guide

Focused reference for maintainers and contributors. User-facing setup lives in [README.md](../README.md); persona guidance lives in [AGENTS.md](../AGENTS.md).

## 1. Environment

- **Node.js** ≥ 24 (enforced via [`package.json`](../package.json))
- **Bun** ≥ 1.3 optional but recommended for faster dev loops (repo `packageManager`)
- **Optional**: [`naudiodon`](https://www.npmjs.com/package/naudiodon) when working on SID audio capture

Install once:

```bash
npm install          # reliable everywhere
# or
bun install          # faster workflow (respects package-lock)
```

## 2. Core Workflows

| Task | Command |
| --- | --- |
| Launch MCP server (TS-aware) | `npm start` |
| Run TypeScript entry directly | `npm run mcp` (Bun) · `npm run mcp:node` (dist only) |
| Build + refresh generated docs | `npm run build` |
| Tests (mock backend) | `npm test` |
| Tests against hardware | `npm test -- --real [--base-url=http://host]` |
| Coverage report | `npm run coverage` (emits `coverage/lcov.info`) |
| End-to-end smoke (local/npm) | `npm run check:run-local` · `npm run check:run-npm` |
| Node-only sanity | `npm run check:node-compat` |
| VICE smoke (readiness + HELLO) | `npm run vice:smoke` |

`scripts/invoke-bun.mjs` automatically delegates npm scripts to Bun when available; stay on the npm variants if Bun is not installed.

Subsequent `npm run build` invocations reuse the incremental cache stored in `dist/.tsbuildinfo`; delete that file (or `dist/`) for a fully clean rebuild when needed.

## 3. Repository Layout (Essentials)

| Path | Notes |
| --- | --- |
| [`src/index.ts`](../src/index.ts) | Runtime entrypoint (loaded by [`scripts/start.mjs`](../scripts/start.mjs)) |
| [`src/mcp-server.ts`](../src/mcp-server.ts) | Server wiring using [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) |
| [`src/tools/`](../src/tools/) | Tool implementations; registries under [`src/tools/registry/`](../src/tools/registry/) |
| [`src/prompts/`](../src/prompts/) | Prompt templates mirroring personas in [AGENTS.md](../AGENTS.md) |
| [`src/rag/`](../src/rag/) & [`data/`](../data/) | RAG builder, indices, and corpora |
| [`scripts/`](../scripts/) | Automation (launchers, tests, RAG, release, README refresh) |
| [`test/`](../test/) | Bun test harness, mock Ultimate server, suites |
| [`generated/`](../generated/) | REST client from [`doc/c64u/c64-openapi.yaml`](c64u/c64-openapi.yaml) |
| [`doc/`](../doc/) | Project documentation (setup, troubleshooting, REST references) |

## 4. Extending the Server

- **Tools**: Implement under `src/tools/<domain>/`, export from [`src/tools/registry/index.ts`](../src/tools/registry/index.ts). Share helpers via [`src/tools/registry/utils.ts`](../src/tools/registry/utils.ts). Add coverage in [`test/`](../test/).
- **Prompts**: Author in [`src/prompts/`](../src/prompts/), register via [`src/prompts/registry.ts`](../src/prompts/registry.ts), mirror description updates in [AGENTS.md](../AGENTS.md) and `.github/prompts/`.
- **REST surface**: Keep [`doc/c64u/c64-openapi.yaml`](c64u/c64-openapi.yaml) current. Regenerate the typed client with `npm run api:generate` when endpoints change.
- **Docs**: `npm run build` calls [`scripts/update-readme.ts`](../scripts/update-readme.ts); never hand-edit the `<!-- AUTO-GENERATED:MCP-DOCS-* -->` block in the README.

## 5. Configuration & Backends

Resolution order: `C64BRIDGE_CONFIG` → `~/.c64bridge.json` → `./c64bridge.json` → defaults (`host=c64u`, `port=80`). Supports hardware (`c64u`) and experimental VICE (`vice.exe`).

Key env flags:

- `C64_MODE=c64u|vice` — force backend
- `LOG_LEVEL=debug` — verbose logging (stderr)
- `C64_TEST_TARGET` / `C64_TEST_BASE_URL` — influence test harness
- `VICE_TEST_TARGET=mock|vice` — test selection for VICE (default: auto-detect real VICE; set `mock` to run against the BM stub during tests)

### VICE smoke test (Binary Monitor)

## 6. RAG Maintenance

- Indices live under [`data/embeddings_*.json`](../data/)
- Rebuild: `npm run rag:rebuild`
- Fetch external sources: `npm run rag:fetch` (writes to [`external/`](../external/))
- Discover sources (experimental): `npm run rag:discover` with `GITHUB_TOKEN`

Environment knobs: `RAG_EMBEDDINGS_DIR`, `RAG_BUILD_ON_START`, `RAG_REINDEX_INTERVAL_MS`, `RAG_DOC_FILES`.

## 7. Optional Services

- **HTTP bridge**: Disabled by default; enable with `npm start -- --http [port]` for manual curl experiments. Details in [`doc/troubleshooting-mcp.md`](troubleshooting-mcp.md).
- **Docker image**: [`Dockerfile`](../Dockerfile) builds Ubuntu 24.04 + Node 24 + Bun for reproducible environments.
- **Audio pipeline**: SID analysis uses [`naudiodon`](https://www.npmjs.com/package/naudiodon); see [`src/audio/`](../src/audio/) and tests like [`test/audioAnalysis.test.mjs`](../test/audioAnalysis.test.mjs).

## 8. Release & Packaging

- `npm run check` — build + test in one pass (mock backend)
- `npm run changelog:generate` — update CHANGELOG draft
- `npm run release:prepare -- <version>` — pre-publish sanity checks
- Published package ships [`dist/`](../dist/), [`doc/`](../doc/), [`data/`](../data/), [`scripts/`](../scripts/), [`generated/`](../generated/), and [`mcp.json`](../mcp.json)

## 9. Troubleshooting Cheatsheet

- Missing entrypoint? Ensure dev deps are installed or run `npm run build` so [`dist/index.js`](../dist/index.js) exists.
- Tool not exposed? Confirm registry wiring (`src/tools/registry/index.ts`) and rebuild.
- Real-device tests flaky? Verify `C64_TEST_BASE_URL` reachability; replay curl probes while the HTTP bridge is active.
- Empty RAG answers? Rebuild embeddings (`npm run rag:rebuild`) and confirm `RAG_EMBEDDINGS_DIR` points at committed data.
- Logs quiet? Remember all server logs emit to stderr to keep stdout dedicated to MCP.

Stay in lockstep with the [README](../README.md) and [`AGENTS.md`](../AGENTS.md) when introducing features so external docs remain accurate.
### VICE smoke test (Binary Monitor)

Quick sanity that VICE is reachable and BASIC readiness + simple run works end‑to‑end.

```bash
npm run vice:smoke
```

Env knobs:

- `VICE_BINARY=/path/to/x64sc` — pick emulator binary
- `VICE_VISIBLE=1` — show the VICE window (recommended during dev)
- `VICE_WARP=0` — disable warp so you can observe visible output
- `VICE_KEEP_OPEN=1` — keep window open after success
  (The smoke test registers exit/signal handlers and tears down spawned processes; with `VICE_KEEP_OPEN=1` only your visible VICE is left running.)
- `VICE_TEST_TARGET=mock` — run the smoke test against the BM stub instead of launching VICE (useful on CI or platforms without VICE installed)
- `FORCE_XVFB=1` — run headless via Xvfb even if a display is detected (default on CI)
- `DISABLE_XVFB=1` — skip Xvfb and use the current `$DISPLAY` even in headless environments
- `VICE_XVFB_DISPLAY=:nn` — override the Xvfb display number (defaults to `:99`)

Implementation tip: programmatic shutdown

- The internal `ViceClient` supports a graceful emulator quit via the Binary Monitor `0xBB Quit` command (`await client.quit()`), and a monitor exit (`0xAA`) if needed. Prefer this over sending signals when integrating VICE control into production code; retain a short SIGTERM fallback.

What it does:

- Launches VICE with the Binary Monitor, waits for the port (≤4s), connects.
- Resets the machine and waits until BASIC pointers are initialised at $0801 and READY. is visible.
- Injects a small BASIC program (`PRINT "HELLO"`), RUNs it, and polls the screen for HELLO.
