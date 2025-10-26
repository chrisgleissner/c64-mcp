#!/usr/bin/env bash
set -euo pipefail

# Start a mock C64U server, point MCP at it, then launch MCP for a short time.
# Usage: scripts/run-mcp-check.sh [local|npm] [duration_seconds]
# - local: runs the local build (dist/index.js)
# - npm:   runs the published package via npx (c64bridge)

MODE="${1:-local}"
DURATION="${2:-5}"
LOGFILE="${LOGFILE:-mcp-server-$(date +%Y%m%d-%H%M%S).log}"

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
TMPDIR=$(mktemp -d)
MOCK_INFO="$TMPDIR/mock-info.json"
CFG_FILE="$TMPDIR/.c64bridge.json"

cleanup() {
  set +e
  [[ -n "${MCP_PID:-}" ]] && kill -TERM "$MCP_PID" 2>/dev/null || true
  [[ -n "${MOCK_PID:-}" ]] && kill -TERM "$MOCK_PID" 2>/dev/null || true
  wait "$MCP_PID" 2>/dev/null || true
  wait "$MOCK_PID" 2>/dev/null || true
  rm -rf "$TMPDIR" 2>/dev/null || true
}
trap cleanup EXIT

# 1) Start mock server and wait for baseUrl
node "$ROOT_DIR/scripts/start-mock.mjs" "$MOCK_INFO" &
MOCK_PID=$!

for i in {1..50}; do
  [[ -f "$MOCK_INFO" ]] && break
  sleep 0.1
done

if [[ ! -f "$MOCK_INFO" ]]; then
  echo "ERROR: mock info file was not created." >&2
  exit 1
fi

BASE_URL=$(node -e "const fs=require('fs'); const p=process.argv[1]; const j=JSON.parse(fs.readFileSync(p,'utf8')); console.log(j.baseUrl || '');" "$MOCK_INFO")
if [[ -z "$BASE_URL" ]]; then
  echo "ERROR: mock baseUrl not found." >&2
  exit 1
fi

HOST_VALUE=$(node -e "const { URL } = require('url'); const u = new URL(process.argv[1]); console.log(u.hostname);" "$BASE_URL")
PORT_VALUE=$(node -e "const { URL } = require('url'); const u = new URL(process.argv[1]); console.log(u.port ? Number(u.port) : 80);" "$BASE_URL")

# 2) Write MCP config pointing to mock
cat >"$CFG_FILE" <<EOF
{
  "c64u": {
    "host": "$HOST_VALUE",
    "port": $PORT_VALUE
  }
}
EOF
export C64BRIDGE_CONFIG="$CFG_FILE"

# 3) If local mode, verify package contents (spot checks, no duplicates)
if [[ "$MODE" == "local" ]]; then
  (cd "$ROOT_DIR" && node scripts/check-package.mjs)
fi

echo "==> Starting MCP server in '$MODE' mode for $DURATION seconds..."
echo "==> Logs will be written to: $(realpath "$LOGFILE")"

if [[ "$MODE" == "local" ]]; then
  (cd "$ROOT_DIR" && npm run build)
  VERSION=$(node -p "require('$ROOT_DIR/package.json').version")
  echo "==> Running local build version $VERSION"
  (cd "$ROOT_DIR" && node dist/index.js) 2>&1 | tee "$LOGFILE" &
  MCP_PID=$!
elif [[ "$MODE" == "npm" ]]; then
  VERSION=$(npm view c64bridge version --silent || echo "unknown")
  echo "==> Downloading c64bridge@$VERSION from npm registry..."
  C64BRIDGE_CONFIG="$CFG_FILE" npx --yes c64bridge 2>&1 | tee "$LOGFILE" &
  MCP_PID=$!
else
  echo "Usage: $0 [local|npm] [duration_seconds]" >&2
  exit 1
fi

sleep "$DURATION"

# Request graceful shutdown and collect exit
if kill -TERM "$MCP_PID" 2>/dev/null; then
  echo "==> Graceful shutdown requested."
else
  echo "==> Server already stopped."
fi
wait "$MCP_PID" 2>/dev/null || true

# 4) Verify connectivity log
if grep -q "Connectivity check succeeded" "$LOGFILE"; then
  echo "==> Connectivity to mock confirmed: $BASE_URL"
else
  echo "ERROR: Connectivity check did not succeed. See logs: $LOGFILE" >&2
  exit 1
fi

echo "==> Run complete. Logs saved to: $(realpath "$LOGFILE")"