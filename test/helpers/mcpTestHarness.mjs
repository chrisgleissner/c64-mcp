import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
const registerAfterAll = typeof globalThis.Bun !== "undefined"
  ? (await import("bun:test")).afterAll
  : (await import("node:test")).after;
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ListToolsResultSchema, ReadResourceResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { startMockC64Server } from "../../scripts/mockC64Server.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const PLATFORM_RESOURCE_URI = "c64://platform/status";

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

  if (typeof globalThis.Bun !== "undefined") {
    try {
      const which = globalThis.Bun.which?.("node");
      if (which) {
        return which;
      }
    } catch {
      // ignore lookup errors; fall back to plain "node"
    }
    return "node";
  }

  return process.execPath;
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
      "[mcpTestHarness] dist/mcp-server.js missing. Build the project before running Node compatibility tests.",
    );
  }
}

let sharedSetupPromise;
let executionQueue = Promise.resolve();
let cleanupRegistered = false;
let pendingUsers = 0;
let activeSuites = 0;
let shutdownInFlight;

async function setupSharedServer() {
  const mockServer = await startMockC64Server();

  const useBunRunner = typeof globalThis.Bun !== "undefined";
  const serverEntrypointTs = path.join(repoRoot, "src", "mcp-server.ts");
  const serverEntrypointDist = path.join(repoRoot, "dist", "mcp-server.js");
  const nodeExecutable = resolveNodeExecutable();
  const bunExecutable = resolveBunExecutable();

  const configPath = path.join(
    os.tmpdir(),
    `c64bridge-test-config-${process.pid}-${Date.now()}.json`,
  );
  const mockUrl = new URL(mockServer.baseUrl);
  const configPayload = {
    c64u: {
      host: mockUrl.hostname,
      port: mockUrl.port ? Number(mockUrl.port) : 80,
    },
  };
  fs.writeFileSync(configPath, JSON.stringify(configPayload), "utf8");

  const transport = new StdioClientTransport({
    command: useBunRunner ? bunExecutable : nodeExecutable,
    args: useBunRunner
      ? [serverEntrypointTs]
      : [ensureDistEntrypoint(serverEntrypointDist)],
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_ENV: "test",
      C64BRIDGE_CONFIG: configPath,
      C64_TEST_TARGET: "mock",
    },
    stderr: "pipe",
  });

  const client = new Client(
    { name: "c64bridge-tests", version: "0.0.0" },
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

  let resolveClose;
  const closePromise = new Promise((resolve) => {
    resolveClose = resolve;
  });

  const previousOnClose = client.onclose;
  client.onclose = () => {
    previousOnClose?.();
    resolveClose?.();
  };

  await client.connect(transport);

  const toolSupport = new Map();
  let activePlatform = (process.env.C64_MODE ?? "").toLowerCase() === "vice" ? "vice" : "c64u";

  try {
    const toolList = await client.request({ method: "tools/list", params: {} }, ListToolsResultSchema);
    for (const descriptor of toolList.tools ?? []) {
      const rawPlatforms = Array.isArray(descriptor.metadata?.platforms) && descriptor.metadata.platforms.length > 0
        ? descriptor.metadata.platforms
        : ["c64u"];
      const unique = Array.from(new Set(rawPlatforms.map((value) => String(value).toLowerCase())));
      toolSupport.set(descriptor.name, Object.freeze(unique));
    }
  } catch {
    // Ignore discovery errors; default behaviour assumes c64u-only tools when metadata is unavailable.
  }

  try {
    const resource = await client.request(
      { method: "resources/read", params: { uri: PLATFORM_RESOURCE_URI } },
      ReadResourceResultSchema,
    );
    const text = resource.contents?.[0]?.text ?? "";
    const match = text.match(/Current platform:\s*`([^`]+)`/i);
    if (match) {
      const candidate = match[1].trim().toLowerCase();
      if (candidate === "vice" || candidate === "c64u") {
        activePlatform = candidate;
      }
    }
  } catch {
    // Resource fetch is best-effort; fall back to environment when unavailable.
  }

  let shutdownStarted = false;
  async function shutdown({ force = false } = {}) {
    if (shutdownStarted) {
      return;
    }
    shutdownStarted = true;
    try {
      await client.close();
      await closePromise;
    } catch (error) {
      if (force && transport.pid) {
        try {
          process.kill(transport.pid, "SIGKILL");
        } catch {
          // ignore kill failures
        }
      }
    } finally {
      fs.rmSync(configPath, { force: true });
      await mockServer.close();
    }
  }

  function stderrOutput() {
    if (stderrChunks.length === 0) {
      return "";
    }
    const output = stderrChunks.join("");
    stderrChunks.length = 0;
    return output;
  }

  return {
    client,
    transport,
    mockServer,
    stderrOutput,
    shutdown,
    platform: activePlatform,
    toolSupport,
    isToolSupported(toolName, targetPlatform = activePlatform) {
      const normalizedPlatform = targetPlatform === "vice" ? "vice" : "c64u";
      const supported = toolSupport.get(toolName);
      if (!supported || supported.length === 0) {
        return normalizedPlatform === "c64u";
      }
      return supported.includes(normalizedPlatform);
    },
  };
}

function isConnected(harness) {
  return Boolean(harness?.client?.transport && harness.transport?.pid);
}

function scheduleShutdown() {
  if (shutdownInFlight || pendingUsers > 0 || activeSuites > 0 || !sharedSetupPromise) {
    return;
  }

  shutdownInFlight = sharedSetupPromise
    .then(async (harness) => {
      await harness.shutdown({ force: true });
    })
    .catch(() => {})
    .finally(() => {
      shutdownInFlight = undefined;
      sharedSetupPromise = undefined;
    });
}

async function ensureHarness() {
  if (!sharedSetupPromise) {
    sharedSetupPromise = setupSharedServer();
  }

  let harness = await sharedSetupPromise;
  if (!isConnected(harness)) {
    try {
      await harness.shutdown({ force: true });
    } catch {
      // ignore forced shutdown errors when recovering
    }
    sharedSetupPromise = setupSharedServer();
    harness = await sharedSetupPromise;
  }
  return harness;
}

export function withSharedMcpClient(callback) {
  pendingUsers += 1;

  const current = executionQueue.then(async () => {
    const harness = await ensureHarness();
    harness.mockServer.reset?.();
    try {
      return await callback({
        client: harness.client,
        mockServer: harness.mockServer,
        stderrOutput: harness.stderrOutput,
        platform: harness.platform,
        isToolSupported: harness.isToolSupported,
      });
    } finally {
      const logs = harness.stderrOutput();
      if (logs) {
        process.stderr.write(logs);
      }
      harness.mockServer.reset?.();
    }
  });

  executionQueue = current.catch(() => {});
  return current.finally(() => {
    pendingUsers = Math.max(0, pendingUsers - 1);
    if (pendingUsers === 0 && activeSuites === 0) {
      scheduleShutdown();
    }
  });
}

export function registerHarnessSuite(id = import.meta?.url ?? `suite-${Date.now()}`) {
  activeSuites += 1;

registerAfterAll(() => {
    activeSuites = Math.max(0, activeSuites - 1);
    if (pendingUsers === 0 && activeSuites === 0) {
      scheduleShutdown();
    }
  });

  return id;
}

function registerProcessCleanup() {
  const shutdown = () => {
    if (!sharedSetupPromise) {
      return;
    }
    activeSuites = 0;
    sharedSetupPromise
      .then((harness) => harness.shutdown({ force: true }))
      .catch(() => {
        // ignore cleanup failures to avoid masking test errors
      })
      .finally(() => {
        sharedSetupPromise = undefined;
      });
  };

  process.once("exit", shutdown);
  process.once("SIGINT", () => {
    shutdown();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    shutdown();
    process.exit(143);
  });
}

if (!cleanupRegistered) {
  cleanupRegistered = true;
  registerProcessCleanup();
}
