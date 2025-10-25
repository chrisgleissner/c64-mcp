#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_TARGET = "mock";

let target = DEFAULT_TARGET;
let explicitBaseUrl = null;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registerSpec = pathToFileURL(path.join(repoRoot, "scripts", "register-ts-node.mjs")).href;
const nodeArgs = ["--import", registerSpec, "--test"];

for (const arg of process.argv.slice(2)) {
  if (arg === "--mock") {
    target = "mock";
    continue;
  }

  if (arg === "--real") {
    target = "real";
    continue;
  }

  if (arg.startsWith("--target=")) {
    target = arg.split("=", 2)[1] ?? DEFAULT_TARGET;
    continue;
  }

  if (arg.startsWith("--base-url=")) {
    explicitBaseUrl = arg.split("=", 2)[1] ?? null;
    continue;
  }

  nodeArgs.push(arg);
}
const defaultEmbeddingsDir = path.join(repoRoot, "artifacts", "test-embeddings");
if (!fs.existsSync(defaultEmbeddingsDir)) {
  fs.mkdirSync(defaultEmbeddingsDir, { recursive: true });
}

const env = {
  ...process.env,
  C64_TEST_TARGET: target,
};

if (!env.RAG_EMBEDDINGS_DIR) {
  env.RAG_EMBEDDINGS_DIR = defaultEmbeddingsDir;
}

if (!env.NODE_TEST_DISABLE_WORKER_THREADS) {
  env.NODE_TEST_DISABLE_WORKER_THREADS = "1";
}

if (explicitBaseUrl) {
  env.C64_TEST_BASE_URL = explicitBaseUrl;
}

if (target === "real" && !env.C64_TEST_BASE_URL) {
  env.C64_TEST_BASE_URL = resolveBaseUrlFromConfig() ?? "http://c64u";
}

const child = spawn(process.execPath, nodeArgs, {
  stdio: "inherit",
  env,
});

child.on("close", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

function resolveBaseUrlFromConfig() {
  const configPathEnv = process.env.C64MCP_CONFIG;
  const homeConfig = os.homedir() ? path.join(os.homedir(), ".c64mcp.json") : null;
  const repoConfig = path.join(repoRoot, ".c64mcp.json");

  const candidates = [];
  if (configPathEnv) candidates.push(configPathEnv);
  if (homeConfig) candidates.push(homeConfig);
  candidates.push(repoConfig);

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(candidate, "utf8"));
      const baseUrl = resolveBaseUrlFromJson(raw);
      if (baseUrl) return baseUrl;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error) {
        if (error.code === "ENOENT") continue;
      }
      // surface malformed JSON to aid debugging
      console.warn(`[run-tests] Failed to read config at ${candidate}:`, error);
    }
  }
  return null;
}

function resolveBaseUrlFromJson(raw) {
  if (!raw || typeof raw !== "object") return null;

  const c64u = raw.c64u && typeof raw.c64u === "object" ? raw.c64u : null;
  if (c64u) {
    const base = normaliseBaseUrlFromString(c64u.baseUrl);
    if (base) return base;

    const hostEntry = firstDefined(
      stringIfSet(c64u.host),
      stringIfSet(c64u.hostname),
    );

    const parsed = parseEndpoint(hostEntry);
    const port = firstDefined(numberIfPort(c64u.port), parsed.port, DEFAULT_PORT);
    if (parsed.hostname) {
      return buildBaseUrl(parsed.hostname, port);
    }
  }

  const legacyBase = normaliseBaseUrlFromString(raw.baseUrl);
  if (legacyBase) return legacyBase;

  const legacyHost = stringIfSet(raw.c64_host) ?? stringIfSet(raw.c64_ip);
  if (legacyHost) {
    const parsed = parseEndpoint(legacyHost);
    const port = firstDefined(parsed.port, DEFAULT_PORT);
    const hostname = parsed.hostname ?? legacyHost;
    return buildBaseUrl(hostname, port);
  }

  return null;
}

function stringIfSet(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberIfPort(value) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 65535) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
      return parsed;
    }
  }
  return null;
}

function normaliseBaseUrlFromString(value) {
  const input = stringIfSet(value);
  if (!input) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) {
    return `http://${input}`;
  }
  return input.replace(/\/+$/, "");
}

function parseEndpoint(value) {
  const input = stringIfSet(value);
  if (!input) return {};
  try {
    const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input);
    const url = new URL(hasScheme ? input : `http://${input}`);
    const hostname = url.hostname || undefined;
    const port = url.port ? numberIfPort(url.port) : undefined;
    return { hostname, port };
  } catch {
    return {};
  }
}

const DEFAULT_PORT = 80;

function buildBaseUrl(host, port) {
  const normalizedPort = Number.isInteger(port) && port > 0 ? port : DEFAULT_PORT;
  const hostPart = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  const suffix = normalizedPort === DEFAULT_PORT ? "" : `:${normalizedPort}`;
  return `http://${hostPart}${suffix}`;
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}
