import { readFileSync } from "fs";

export interface C64McpConfig {
  c64_ip: string;
  baseUrl?: string;
}

let cachedConfig: C64McpConfig | null = null;

export function loadConfig(): C64McpConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = process.env.C64MCP_CONFIG ?? `${process.env.HOME}/.c64mcp.json`;
  const data = JSON.parse(readFileSync(configPath, "utf-8"));

  if (!data.c64_ip) {
    throw new Error("Missing c64_ip in config");
  }

  const config: C64McpConfig = {
    ...data,
    baseUrl: data.baseUrl ?? `http://${data.c64_ip}`,
  };

  cachedConfig = config;
  return config;
}
