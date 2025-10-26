import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");

export async function createConnectedClient(options = {}) {
  const registerLoader = pathToFileURL(
    path.join(repoRoot, "scripts", "register-ts-node.mjs"),
  ).href;
  const serverEntrypoint = path.join(repoRoot, "src", "mcp-server.ts");

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", registerLoader, serverEntrypoint],
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
