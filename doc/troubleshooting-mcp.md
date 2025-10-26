# MCP Troubleshooting Guide

Field notes for the stdio-based Model Context Protocol server. Use these checks when the C64 MCP surface does not respond or CI fails the connectivity probe.

## Quick Diagnosis Checklist

```bash
# 1. Is the MCP server running?
ps -ef | grep "c64-mcp" | grep -v grep

# 2. Do startup logs show the connectivity probe?
tail -n20 ~/.c64-mcp.log  # or the terminal running npm start

# 3. Can we reach the configured REST endpoint directly?
curl -s http://<your-c64-host>/v1/info | jq .version

# 4. When using the mock server
npm test -- --mock
```

## Common Issues & Fixes

### 1. Server Starts Without Connectivity Logs

**Symptoms:**

- `npm start` prints the banner but omits `Connectivity check succeeded`.
- CI job `Validate MCP server logs` fails.

**Resolution:**

1. Confirm the REST base URL in `.c64mcp.json` or `C64MCP_CONFIG` matches a reachable device.
2. Run `curl -I http://<host>/v1/info` to confirm HTTP reachability.
3. Review `src/mcp-server.ts` connectivity logging; ensure no local edits suppressed `logConnectivity`.
4. If hardware is offline, expect `Skipping direct REST connectivity probe` in the logs—CI treats this as success.

### 2. VS Code (Copilot Chat) Cannot See Tools

**Symptoms:**

- Copilot Chat shows "No MCP server" messages.
- Tool invocations fail silently.

**Resolution:**

1. Restart VS Code after changing MCP settings.
2. Verify the settings JSON matches the snippet in `doc/MCP_SETUP.md` (`command`, `args`, `type: "stdio"`).
3. Keep `npm start` (or `npx c64-mcp`) running; Copilot terminates the stdio process when the chat closes.
4. Inspect the Copilot output channel for connection errors and ensure the stdio server entry is configured and running.

### 3. Tests Fail Because Mock Server Is Missing

**Symptoms:**

- `npm test` exits with ENOENT for `test/mockC64Server.mjs` or cannot bind to port 18064.

**Resolution:**

1. Ensure dev dependencies are installed (`npm install`).
2. Verify nothing else occupies the mock server port: `lsof -i :18064`.
3. Run `npm test -- --verbose` to see which suite fails; the harness spins up the mock server automatically.

### 4. C64 Hardware Connection Issues

**Check C64 Configuration:**

```bash
# Verify config file exists and has correct IP
cat .c64mcp.json
```

Expected structure:

```json
{
  "c64u": {
    "host": "c64u",
    "port": 80
  }
}
```

Example with explicit host:

```json
{
  "c64u": {
    "host": "192.168.1.13",
    "port": 80
  }
}
```

**Test C64 Connectivity:**

Please note that the following IP address is just given as an example.

```bash
# Test Ultimate 64 REST API directly
curl -s http://192.168.1.13/v1/info
curl -s http://c64u/v1/info

# If both fail, check network/Ultimate 64 power
ping 192.168.1.13
```

### 5. Missing Dependencies

**Symptoms:**

- Server fails to start
- TypeScript compilation errors
- Missing modules

**Solutions:**

```bash
# Reinstall dependencies
npm install

# Verify TypeScript can compile (optional check)
npx tsc --noEmit src/index.ts
```

### 6. Transport

Only stdio transport is supported for MCP. HTTP transport is not supported.

## Working Test Sequence

Use these checks to validate the full stack:

1. `npm test` — run the mock suite end-to-end via stdio MCP.
2. `npm test -- --real --base-url=$C64_BASE` — exercise real hardware (override `C64_BASE` to match your device).
3. `curl -s "$C64_BASE"/v1/info | jq .version` — confirm the Ultimate 64 REST endpoint responds (hardware connectivity; unrelated to MCP transport).
4. `npm run start-mock` — optional mock C64 server for local experiments.

## VS Code MCP Setup Checklist

- [ ] GitHub Copilot extension installed and active
- [ ] MCP experimental feature enabled (Copilot Chat ≥ v1.214)
- [ ] Settings JSON matches `doc/MCP_SETUP.md`
- [ ] `npm start` (or packaged CLI) running in a terminal
- [ ] Connectivity logs confirm the REST endpoint is reachable
- [ ] Hardware (or mock server) is online and accessible

## Key Lessons Learned

1. Connectivity logs are the fastest signal—watch the console during startup.
2. Keep configuration files small and explicit; mismatched hosts cause silent timeouts.
3. Automated tests cover most workflows; run `npm test` before suspecting hardware.
4. Copilot Chat terminates the stdio server when the session ends—restart `npm start` as needed.

## Emergency Recovery

If nothing works:

```bash
# Nuclear option: kill everything and restart
pkill -f npm
pkill -f node
pkill -f c64-mcp

# Wait a few seconds
sleep 3

# Clean restart
cd /path/to/c64-mcp
npm start

# If using HTTP mode, test immediately
curl -s http://localhost:8000/tools/info
```

---

*Keep this guide updated whenever new MCP workflows or diagnostics land in the project.*
