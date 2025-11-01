import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
const DEFAULT_HOST = "c64u";
const DEFAULT_PORT = 80;
const DEFAULT_CONFIG = {
    c64_host: DEFAULT_HOST,
    baseUrl: buildBaseUrl(DEFAULT_HOST, DEFAULT_PORT),
    c64_port: DEFAULT_PORT,
};
let cachedConfig = null;
export function loadConfig() {
    if (cachedConfig) {
        return cachedConfig;
    }
    const configPath = process.env.C64BRIDGE_CONFIG ?? `${process.env.HOME}/.c64bridge.json`;
    const repoConfigPath = join(dirname(fileURLToPath(import.meta.url)), "..", ".c64bridge.json");
    let rawConfig;
    try {
        rawConfig = JSON.parse(readFileSync(configPath, "utf-8"));
    }
    catch (error) {
        if (error.code === "ENOENT") {
            try {
                rawConfig = JSON.parse(readFileSync(repoConfigPath, "utf-8"));
            }
            catch (fallbackError) {
                if (fallbackError.code === "ENOENT") {
                    rawConfig = {};
                }
                else
                    throw fallbackError;
            }
        }
        else {
            throw error;
        }
    }
    // New schema: prefer c64u.{host,port,baseUrl}; keep legacy fields as fallback
    const c64u = rawConfig?.c64u;
    const parsedC64uHost = parseEndpoint(configuredString(c64u?.host));
    const parsedC64uHostname = parseEndpoint(configuredString(c64u?.hostname));
    const parsedLegacyHost = parseEndpoint(configuredString(rawConfig?.c64_host));
    const parsedLegacyIp = parseEndpoint(configuredString(rawConfig?.c64_ip));
    const parsedBaseOverrides = [
        parseEndpoint(normaliseBaseUrl(c64u?.baseUrl)),
        parseEndpoint(normaliseBaseUrl(rawConfig?.baseUrl)),
    ];
    const hostCandidates = [
        parsedC64uHost.hostname,
        parsedC64uHostname.hostname,
        parsedLegacyHost.hostname,
        parsedLegacyIp.hostname,
        ...parsedBaseOverrides.map((entry) => entry.hostname),
    ];
    const portCandidates = [
        configuredPort(c64u?.port),
        parsedC64uHost.port,
        parsedC64uHostname.port,
        configuredPort(rawConfig?.c64_port),
        parsedLegacyHost.port,
        parsedLegacyIp.port,
        ...parsedBaseOverrides.map((entry) => entry.port),
    ];
    const host = firstDefined(...hostCandidates) ?? DEFAULT_HOST;
    const port = firstDefined(...portCandidates) ?? DEFAULT_PORT;
    const baseUrl = buildBaseUrl(host, port);
    const hostLabel = formatHost(host);
    const hostWithPort = port === DEFAULT_PORT ? hostLabel : `${hostLabel}:${port}`;
    const config = {
        c64_host: hostWithPort,
        baseUrl,
        c64_port: port,
    };
    cachedConfig = config;
    return config;
}
function configuredString(value) {
    return typeof value === "string" ? value.trim() : undefined;
}
function configuredPort(value) {
    if (typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 65535) {
        return value;
    }
    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value.trim());
        if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
            return parsed;
        }
    }
    return undefined;
}
function normaliseBaseUrl(value) {
    const input = configuredString(value);
    if (!input)
        return undefined;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) {
        return `http://${input}`;
    }
    return stripTrailingSlash(input);
}
function parseEndpoint(value) {
    const input = configuredString(value);
    if (!input)
        return {};
    try {
        const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input);
        const url = new URL(hasScheme ? input : `http://${input}`);
        const hostname = url.hostname || undefined;
        const port = url.port ? configuredPort(url.port) : undefined;
        const baseUrl = stripTrailingSlash(`${url.protocol}//${url.host}`);
        return { hostname, port, baseUrl };
    }
    catch {
        return {};
    }
}
function stripTrailingSlash(input) {
    return input.replace(/\/+$/, "");
}
function firstDefined(...values) {
    for (const value of values) {
        if (value !== undefined && value !== null)
            return value;
    }
    return undefined;
}
function buildBaseUrl(host, port) {
    const normalizedPort = Number.isInteger(port) && port > 0 ? port : DEFAULT_PORT;
    const hostPart = formatHost(host);
    const suffix = normalizedPort === DEFAULT_PORT ? "" : `:${normalizedPort}`;
    return `http://${hostPart}${suffix}`;
}
function formatHost(host) {
    if (host.includes(":") && !host.startsWith("[")) {
        return `[${host}]`;
    }
    return host;
}
export function __resetConfigCacheForTests() {
    cachedConfig = null;
}
