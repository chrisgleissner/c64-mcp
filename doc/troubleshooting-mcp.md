# MCP Troubleshooting Guide

This document captures common issues and solutions when the c64-mcp server is not reachable or not working as expected.

## Quick Diagnosis Commands

```bash
# Check if server is running
lsof -i :8000
ps -ef | grep "src/index.ts" | grep -v grep

# Test basic connectivity
curl -s http://localhost:8000/tools/info

# Check C64 connectivity
ping -c 1 192.168.1.13
curl -s http://192.168.1.13/v1/info
```

## Common Issues & Solutions

### 1. Server Not Responding to HTTP Requests

**Symptoms:**
- `curl: (7) Failed to connect to localhost port 8000`
- `Connection refused` errors
- Server process exists but no response

**Solutions:**
```bash
# Kill any existing processes
pkill -f "npm start" || true
pkill -f "src/index.ts" || true

# Restart server with explicit port
cd /path/to/c64-mcp
PORT=8000 npm start

# Verify server starts and shows logs like:
# "Server listening at http://0.0.0.0:8000"
# "Connectivity check succeeded for c64 device at http://192.168.1.13"
```

### 2. VS Code MCP Configuration Issues

**Symptoms:**
- VS Code Copilot Chat doesn't recognize MCP tools
- Commands don't execute
- No MCP server connection

**HTTP MCP Configuration (Working):**
```json
{
  "github.copilot.chat.experimental.mcp": {
    "servers": [
      {
        "name": "c64-mcp",
        "url": "http://localhost:8000",
        "manifestPath": "/absolute/path/to/c64-mcp/dist/mcp-manifest.json",
        "type": "http"
      }
    ]
  }
}
```

**Key Points:**
- Use **absolute paths** for `manifestPath`
- Ensure the HTTP server is running on port 8000
- HTTP MCP requires **manual approval** for each command
- Add to both workspace `.vscode/settings.json` AND user settings

### 3. stdout MCP Issues

**⚠️ Known Issue:** stdout MCP integration may not work reliably for C64 hardware control.

**Symptoms:**
- Commands appear to execute but no C64 interaction
- No visible output on C64 screen
- Tools run but don't affect hardware

**Recommendation:** Use HTTP MCP for reliable C64 control.

### 4. C64 Hardware Connection Issues

**Check C64 Configuration:**
```bash
# Verify config file exists and has correct IP
cat .c64mcp.json

# Should contain:
{
  "c64_host": "c64u",
  "baseUrl": "http://c64u"
}
# OR
{
  "c64_host": "192.168.1.13",
  "baseUrl": "http://192.168.1.13"
}
```

**Test C64 Connectivity:**
```bash
# Test Ultimate 64 REST API directly
curl -s http://192.168.1.13/v1/info
curl -s http://c64u/v1/info

# If both fail, check network/Ultimate 64 power
ping 192.168.1.13
```

### 5. Port Conflicts

**Symptoms:**
- `EADDRINUSE: address already in use 0.0.0.0:8000`

**Solutions:**
```bash
# Find what's using port 8000
lsof -i :8000

# Kill the process using the port
kill <PID>

# Or use a different port
PORT=8001 npm start
```

### 6. Missing Dependencies

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

## Working Test Sequence

Once the server is running, verify with this sequence:

```bash
# 1. Test basic BASIC program upload
curl -X POST -H 'Content-Type: application/json' \
  -d '{"program":"10 PRINT \"HELLO WORLD\"\n20 END"}' \
  http://localhost:8000/tools/upload_and_run_basic

# 2. Read C64 screen to verify
curl -s http://localhost:8000/tools/read_screen

# 3. Test memory write (change border color to red)
curl -X POST -H 'Content-Type: application/json' \
  -d '{"address":"$D020","bytes":"$02"}' \
  http://localhost:8000/tools/write_memory
```

## VS Code MCP Setup Checklist

- [ ] GitHub Copilot extension installed and active
- [ ] VS Code version supports MCP (Copilot Chat v1.214+)
- [ ] MCP experimental feature enabled in VS Code settings
- [ ] MCP server configuration in user settings.json (not just workspace)
- [ ] HTTP server running on localhost:8000
- [ ] C64 Ultimate 64 powered on and network accessible
- [ ] Test with simple curl command first

## Key Lessons Learned

1. **HTTP MCP is more reliable** than stdout MCP for hardware control
2. **Always test with curl first** before troubleshooting VS Code integration
3. **Check process lists** - servers can appear to start but not actually listen
4. **Use absolute paths** in VS Code MCP configuration
5. **Manual approval is required** for each HTTP MCP command
6. **Server logs are crucial** - watch for connectivity messages and errors

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
PORT=8000 npm start

# Test immediately
curl -s http://localhost:8000/tools/info
```

---

*This guide was created after a challenging debugging session on 2025-10-21. Keep it updated with new findings.*