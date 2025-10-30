import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");

export async function createConnectedClient(options = {}) {
  const useBunRunner = typeof globalThis.Bun !== "undefined";
  const serverEntrypointTs = path.join(repoRoot, "src", "mcp-server.ts");
  const serverEntrypointDist = path.join(repoRoot, "dist", "mcp-server.js");
  const command = useBunRunner ? resolveBunExecutable() : resolveNodeExecutable();
  const args = useBunRunner
    ? [serverEntrypointTs]
    : [ensureDistEntrypoint(serverEntrypointDist)];

  const transport = new StdioClientTransport({
    command,
    args,
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_ENV: "test",
      ...options.env,
    },
    stderr: "pipe",
  });

  const client = new Client(
    { name: options.clientName ?? "c64bridge-tests", version: options.clientVersion ?? "0.0.0" },
    {
      capabilities: {
        resources: {},
        tools: {},
        prompts: {},
      },
    },
  );

  const stderrChunks = [];
  const stderr = transport.stderr;
  if (stderr) {
    stderr.setEncoding("utf8");
    stderr.on("data", (chunk) => stderrChunks.push(chunk));
  }

  await client.connect(transport);

  return {
    client,
    stderrOutput: () => stderrChunks.join(""),
    async close() {
      await client.close();
    },
  };
}

function resolveNodeExecutable() {
  const candidates = [
    process.env.C64BRIDGE_TEST_NODE_BIN,
    process.env.C64BRIDGE_NODE_BIN,
    process.env.NODE_BINARY,
    process.env.NODE_EXEC_PATH,
    process.env.npm_node_execpath,
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "node";
}

function resolveBunExecutable() {
  if (typeof globalThis.Bun !== "undefined") {
    return process.execPath;
  }
  const candidates = [
    process.env.C64BRIDGE_TEST_BUN_BIN,
    process.env.C64BRIDGE_BUN_BIN,
  ];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "bun";
}

function ensureDistEntrypoint(entryPath) {
  try {
    fs.accessSync(entryPath, fs.constants.F_OK);
    return entryPath;
  } catch {
    throw new Error(
      "[mcpTestClient] dist/mcp-server.js missing. Build the project before running Node compatibility helpers.",
    );
  }
}
