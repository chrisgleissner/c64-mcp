import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

export interface C64McpConfig {
  c64_host: string;
  baseUrl?: string;
}

const DEFAULT_CONFIG: C64McpConfig = {
  c64_host: "c64u",
  baseUrl: "http://c64u",
};

let cachedConfig: C64McpConfig | null = null;

export function loadConfig(): C64McpConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = process.env.C64MCP_CONFIG ?? `${process.env.HOME}/.c64mcp.json`;
  const repoConfigPath = join(dirname(fileURLToPath(import.meta.url)), "..", ".c64mcp.json");

  let rawConfig: any;
  try {
    rawConfig = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      try {
        rawConfig = JSON.parse(readFileSync(repoConfigPath, "utf-8"));
      } catch (fallbackError) {
        if ((fallbackError as NodeJS.ErrnoException).code === "ENOENT") {
          rawConfig = {};
        }
        else throw fallbackError;
      }
    } else {
      throw error;
    }
  }

  // New schema: prefer c64u.{baseUrl|hostname}; keep legacy fields as fallback
  const c64u = rawConfig?.c64u as { baseUrl?: string; hostname?: string } | undefined;
  const baseUrl = c64u?.baseUrl ?? (c64u?.hostname ? `http://${c64u.hostname}` : undefined) ?? rawConfig?.baseUrl;
  const legacyHost = typeof rawConfig?.c64_ip === "string" ? rawConfig.c64_ip : undefined;
  const configuredHost = typeof rawConfig?.c64_host === "string" ? rawConfig.c64_host : undefined;
  const inferredHostFromBase = (() => { try { return baseUrl ? new URL(baseUrl).hostname : undefined; } catch { return undefined; } })();
  const host = configuredHost ?? legacyHost ?? c64u?.hostname ?? inferredHostFromBase ?? DEFAULT_CONFIG.c64_host;

  const config: C64McpConfig = {
    c64_host: host,
    baseUrl: baseUrl ?? `http://${host}`,
  };

  cachedConfig = config;
  return config;
}
