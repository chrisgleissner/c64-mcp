#!/usr/bin/env bun
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_TARGET = "mock";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultEmbeddingsDir = path.join(repoRoot, "artifacts", "test-embeddings");

let target = DEFAULT_TARGET;
let explicitBaseUrl: string | null = null;
let runCoverage = false;
const passthrough: string[] = [];

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
  if (arg === "--coverage") {
    runCoverage = true;
    continue;
  }
  passthrough.push(arg);
}

if (!fs.existsSync(defaultEmbeddingsDir)) {
  fs.mkdirSync(defaultEmbeddingsDir, { recursive: true });
}

const env: Record<string, string> = { ...process.env } as Record<string, string>;
env.C64_TEST_TARGET = target;
if (!env.RAG_EMBEDDINGS_DIR) {
  env.RAG_EMBEDDINGS_DIR = defaultEmbeddingsDir;
}
if (explicitBaseUrl) {
  env.C64_TEST_BASE_URL = explicitBaseUrl;
}
if (target === "real" && !env.C64_TEST_BASE_URL) {
  env.C64_TEST_BASE_URL = resolveBaseUrlFromConfig() ?? "http://c64u";
}

const bunExecutable = process.execPath;
const cmd = [
  bunExecutable,
  "test",
  ...(runCoverage
    ? [
        "--coverage",
        // Ensure LCOV is emitted for Codecov
        "--coverage-reporter=lcov",
        // Use supported console reporter in Bun
        "--coverage-reporter=text",
      ]
    : []),
  ...passthrough,
];
const child = Bun.spawn({
  cmd,
  cwd: repoRoot,
  env,
  stdout: "inherit",
  stderr: "inherit",
});

const exitCode = await child.exited;
process.exit(typeof exitCode === "number" ? exitCode : 1);

function resolveBaseUrlFromConfig(): string | null {
  const configPathEnv = env.C64BRIDGE_CONFIG;
  const homeConfig = os.homedir() ? path.join(os.homedir(), ".c64bridge.json") : null;
  const repoConfig = path.join(repoRoot, ".c64bridge.json");
  for (const candidate of [configPathEnv, homeConfig, repoConfig]) {
    if (!candidate) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(candidate, "utf8"));
      const base = resolveBaseUrlFromJson(raw);
      if (base) return base;
    } catch (error) {
      if (isSystemError(error) && error.code === "ENOENT") {
        continue;
      }
      console.warn(`[run-tests] Failed to read config at ${candidate}:`, error);
    }
  }
  return null;
}

function resolveBaseUrlFromJson(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const root = raw as Record<string, unknown>;
  const c64u = root.c64u;
  if (c64u && typeof c64u === "object") {
    const base = stringIfSet((c64u as Record<string, unknown>).baseUrl);
    if (base) return normalizeBase(base);
    const hostEntry = firstDefined(
      stringIfSet((c64u as Record<string, unknown>).host),
      stringIfSet((c64u as Record<string, unknown>).hostname),
    );
    const parsed = parseEndpoint(hostEntry);
    const port = firstDefined(numberIfPort((c64u as Record<string, unknown>).port), parsed.port, DEFAULT_PORT);
    if (parsed.hostname) {
      return buildBaseUrl(parsed.hostname, port);
    }
  }
  const legacyBase = stringIfSet(root.baseUrl);
  if (legacyBase) return normalizeBase(legacyBase);
  const legacyHost = firstDefined(stringIfSet(root.c64_host), stringIfSet(root.c64_ip));
  if (legacyHost) {
    const parsed = parseEndpoint(legacyHost);
    const port = firstDefined(parsed.port, DEFAULT_PORT);
    const hostname = parsed.hostname ?? legacyHost;
    return buildBaseUrl(hostname, port);
  }
  return null;
}

function stringIfSet(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberIfPort(value: unknown): number | null {
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

function normalizeBase(input: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input.replace(/\/+$/, "") : `http://${input}`;
}

function parseEndpoint(value: string | null): { hostname?: string; port?: number } {
  const input = value && value.trim() ? value.trim() : null;
  if (!input) return {};
  try {
    const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input);
    const url = new URL(hasScheme ? input : `http://${input}`);
    const hostname = url.hostname || undefined;
    const port = url.port ? numberIfPort(url.port) ?? undefined : undefined;
    return { hostname, port };
  } catch {
    return {};
  }
}

const DEFAULT_PORT = 80;

function buildBaseUrl(host: string, port: number | undefined): string {
  const normalizedPort = Number.isInteger(port) && (port as number) > 0 ? (port as number) : DEFAULT_PORT;
  const hostPart = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  const suffix = normalizedPort === DEFAULT_PORT ? "" : `:${normalizedPort}`;
  return `http://${hostPart}${suffix}`;
}

function firstDefined<T>(...values: Array<T | undefined | null>): T | undefined {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}

function isSystemError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === "object" && "code" in error);
}
