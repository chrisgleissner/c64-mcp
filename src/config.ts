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

  let rawConfig: unknown;
  try {
    rawConfig = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      try {
        rawConfig = JSON.parse(readFileSync(repoConfigPath, "utf-8"));
      } catch (fallbackError) {
        if ((fallbackError as NodeJS.ErrnoException).code === "ENOENT") {
          cachedConfig = DEFAULT_CONFIG;
          return cachedConfig;
        }
        throw fallbackError;
      }
    } else {
      throw error;
    }
  }

  const legacyHost = typeof (rawConfig as { c64_ip?: unknown }).c64_ip === "string" ? (rawConfig as { c64_ip: string }).c64_ip : undefined;
  const configuredHost = typeof (rawConfig as { c64_host?: unknown }).c64_host === "string" ? (rawConfig as { c64_host: string }).c64_host : undefined;
  const host = configuredHost ?? legacyHost;

  if (!host) {
    throw new Error("Missing c64_host in config");
  }

  const config: C64McpConfig = {
    c64_host: host,
    baseUrl: (rawConfig as { baseUrl?: string }).baseUrl ?? `http://${host}`,
  };

  cachedConfig = config;
  return config;
}
