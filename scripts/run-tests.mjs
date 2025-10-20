#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_TARGET = "mock";

let target = DEFAULT_TARGET;
let explicitBaseUrl = null;
const nodeArgs = ["--loader", "ts-node/esm", "--test"];

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
const env = {
  ...process.env,
  C64_TEST_TARGET: target,
};

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
  const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const repoConfig = path.join(repoDir, ".c64mcp.json");

  const candidates = [];
  if (configPathEnv) candidates.push(configPathEnv);
  if (homeConfig) candidates.push(homeConfig);
  candidates.push(repoConfig);

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(candidate, "utf8"));
      const host = typeof raw.c64_host === "string" ? raw.c64_host : undefined;
      const baseUrl = typeof raw.baseUrl === "string" ? raw.baseUrl : undefined;
      if (baseUrl) {
        return baseUrl;
      }
      if (host) {
        return `http://${host}`;
      }
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
