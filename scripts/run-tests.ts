#!/usr/bin/env bun
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_TARGET = "mock";
const DEFAULT_PLATFORM = "c64u";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultEmbeddingsDir = path.join(repoRoot, "artifacts", "test-embeddings");

let target = DEFAULT_TARGET;
let platform: "c64u" | "vice" = DEFAULT_PLATFORM;
let explicitBaseUrl: string | null = null;
let runCoverage = false;
const passthrough: string[] = [];

const args = process.argv.slice(2);

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--mock") {
    target = "mock";
    continue;
  }
  if (arg === "--real") {
    target = "device";
    continue;
  }
  if (arg === "--platform" && index + 1 < args.length) {
    platform = normalizePlatform(args[index + 1]);
    index += 1;
    continue;
  }
  if (arg.startsWith("--platform=")) {
    platform = normalizePlatform(arg.split("=", 2)[1] ?? DEFAULT_PLATFORM);
    continue;
  }
  if (arg.startsWith("--target=")) {
    target = arg.split("=", 2)[1] ?? DEFAULT_TARGET;
    continue;
  }
  if (arg === "--target" && index + 1 < args.length) {
    target = args[index + 1] ?? DEFAULT_TARGET;
    index += 1;
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
const normalizedTarget = normalizeTarget(target);
env.C64_MODE = platform;
env.C64_TEST_TARGET = normalizedTarget === "device" ? "real" : "mock";
if (platform === "vice") {
  env.VICE_TEST_TARGET = normalizedTarget === "device" ? "vice" : "mock";
} else {
  delete env.VICE_TEST_TARGET;
}
if (!env.RAG_EMBEDDINGS_DIR) {
  env.RAG_EMBEDDINGS_DIR = defaultEmbeddingsDir;
}
if (explicitBaseUrl) {
  env.C64_TEST_BASE_URL = explicitBaseUrl;
}
if (platform === "c64u" && normalizedTarget === "device" && !env.C64_TEST_BASE_URL) {
  env.C64_TEST_BASE_URL = resolveBaseUrlFromConfig() ?? "http://c64u";
}

printMatrixHeading({
  platform,
  target: normalizedTarget,
  coverage: runCoverage,
  baseUrl: env.C64_TEST_BASE_URL ?? null,
  passthrough,
});

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
const bunRuntime = (globalThis as { Bun?: any }).Bun;
if (!bunRuntime || typeof bunRuntime.spawn !== "function") {
  throw new Error("[run-tests] Bun runtime is required to execute tests");
}
const child = bunRuntime.spawn({
  cmd,
  cwd: repoRoot,
  env,
  stdout: "inherit",
  stderr: "inherit",
});

const exitCode = await child.exited;
process.exit(typeof exitCode === "number" ? exitCode : 1);

type MatrixHeadingOptions = {
  platform: "c64u" | "vice";
  target: "mock" | "device";
  coverage: boolean;
  baseUrl: string | null;
  passthrough: string[];
};

function printMatrixHeading(options: MatrixHeadingOptions): void {
  const { platform, target, coverage, baseUrl, passthrough } = options;
  const useColor = Boolean(process.stdout.isTTY) && process.env.NO_COLOR !== "1";
  const color = (code: string): string => (useColor ? `\x1b[${code}m` : "");
  const reset = useColor ? "\x1b[0m" : "";
  const bold = useColor ? "\x1b[1m" : "";

  const platformColor = platform === "vice" ? color("34") : color("36");
  const targetColor = target === "device" ? color("33") : color("32");
  const coverageColor = coverage ? color("31") : color("90");
  const labelColor = color("90");

  const header = `${bold}${color("97")}=== test-matrix run ===${reset}`;
  const platformLine = `${labelColor}platform:${reset} ${platformColor}${platform}${reset}`;
  const targetLine = `${labelColor}target:${reset} ${targetColor}${target}${reset}`;
  const coverageLine = `${labelColor}coverage:${reset} ${coverageColor}${coverage ? "enabled" : "disabled"}${reset}`;

  console.log("\n" + header);
  console.log(`${platformLine}  ${targetLine}  ${coverageLine}`);
  if (baseUrl) {
    console.log(`${labelColor}base-url:${reset} ${baseUrl}`);
  }
  if (passthrough.length > 0) {
    console.log(`${labelColor}extra args:${reset} ${passthrough.join(" ")}`);
  }
  console.log("");
}

function normalizePlatform(value: string): "c64u" | "vice" {
  const lower = (value ?? "").toLowerCase();
  return lower === "vice" ? "vice" : "c64u";
}

function normalizeTarget(value: string): "mock" | "device" {
  const lower = (value ?? "").toLowerCase();
  if (lower === "real" || lower === "device" || lower === "hardware" || lower === "vice") {
    return "device";
  }
  return "mock";
}

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

function parseEndpoint(value: string | null | undefined): { hostname?: string; port?: number } {
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
