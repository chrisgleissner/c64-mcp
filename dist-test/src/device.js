/*
 * Unified C64 abstraction and backend selection
 */
import axios from "axios";
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Api } from "../generated/c64/index.js";
import { createLoggingHttpClient } from "./loggingHttpClient.js";
const DEFAULT_C64U_HOST = "c64u";
const DEFAULT_C64U_PORT = 80;
function readConfigFile() {
    const envPath = process.env.C64BRIDGE_CONFIG;
    const candidates = [];
    if (envPath)
        candidates.push(envPath);
    // Repo root
    try {
        const here = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", ".c64bridge.json");
        candidates.push(here);
    }
    catch { }
    const home = process.env.HOME || os.homedir();
    if (home)
        candidates.push(path.join(home, ".c64bridge.json"));
    for (const p of candidates) {
        try {
            if (fs.existsSync(p)) {
                const text = fs.readFileSync(p, "utf8");
                const json = JSON.parse(text);
                return json ?? null;
            }
        }
        catch { }
    }
    return null;
}
class C64uBackend {
    constructor(config) {
        this.type = "c64u";
        const baseUrl = resolveBaseUrl(config);
        this.baseUrl = baseUrl;
        const http = createLoggingHttpClient({ baseURL: baseUrl, timeout: 10000 });
        this.api = new Api(http);
    }
    getBaseUrl() { return this.baseUrl; }
    async ping() {
        try {
            const res = await axios.get(this.baseUrl, { timeout: 2000 });
            return res.status >= 200 && res.status < 500;
        }
        catch {
            return false;
        }
    }
    async runPrg(prg) {
        const payload = Buffer.isBuffer(prg) ? prg : Buffer.from(prg);
        const res = await this.api.v1.runnersRunPrgCreate(":run_prg", payload, { headers: { "Content-Type": "application/octet-stream" } });
        return { success: true, details: res.data };
    }
    async loadPrgFile(pathStr) {
        const res = await this.api.v1.runnersLoadPrgUpdate(":load_prg", { file: pathStr });
        return { success: true, details: res.data };
    }
    async runPrgFile(pathStr) {
        const res = await this.api.v1.runnersRunPrgUpdate(":run_prg", { file: pathStr });
        return { success: true, details: res.data };
    }
    async runCrtFile(pathStr) {
        const res = await this.api.v1.runnersRunCrtUpdate(":run_crt", { file: pathStr });
        return { success: true, details: res.data };
    }
    async sidplayFile(pathStr, songnr) {
        const res = await this.api.v1.runnersSidplayUpdate(":sidplay", { file: pathStr, songnr });
        return { success: true, details: res.data };
    }
    async sidplayAttachment(sid, options) {
        const form = { sid: Buffer.isBuffer(sid) ? sid : Buffer.from(sid) };
        if (options?.songlengths)
            form.songlengths = Buffer.isBuffer(options.songlengths) ? options.songlengths : Buffer.from(options.songlengths);
        const res = await this.api.v1.runnersSidplayCreate(":sidplay", form, options?.songnr !== undefined ? { songnr: options.songnr } : undefined);
        return { success: true, details: res.data };
    }
    async readMemory(address, length) {
        const addrStr = address.toString(16).toUpperCase().padStart(4, "0");
        const response = await this.api.v1.machineReadmemList(":readmem", { address: addrStr, length }, { format: "arraybuffer", headers: { Accept: "application/octet-stream, application/json" } });
        const contentType = (response.headers?.["content-type"] ?? "").toString().toLowerCase();
        const body = response.data;
        if (contentType.includes("application/json")) {
            const text = Buffer.from(body).toString("utf8");
            try {
                const parsed = JSON.parse(text);
                return extractBytes(parsed?.data ?? parsed);
            }
            catch {
                return extractBytes(text);
            }
        }
        if (body instanceof ArrayBuffer)
            return new Uint8Array(body);
        return extractBytes(body);
    }
    async writeMemory(address, bytes) {
        const addrStr = address.toString(16).toUpperCase().padStart(4, "0");
        if (bytes.length <= 128) {
            await this.api.v1.machineWritememUpdate(":writemem", { address: addrStr, data: Buffer.from(bytes).toString("hex").toUpperCase() });
        }
        else {
            await this.api.v1.machineWritememCreate(":writemem", { address: addrStr }, Buffer.from(bytes), { headers: { "Content-Type": "application/octet-stream" } });
        }
    }
    async reset() { const res = await this.api.v1.machineResetUpdate(":reset"); return { success: true, details: res.data }; }
    async reboot() { const res = await this.api.v1.machineRebootUpdate(":reboot"); return { success: true, details: res.data }; }
    async pause() { const res = await this.api.v1.machinePauseUpdate(":pause"); return { success: true, details: res.data }; }
    async resume() { const res = await this.api.v1.machineResumeUpdate(":resume"); return { success: true, details: res.data }; }
    async poweroff() { const res = await this.api.v1.machinePoweroffUpdate(":poweroff"); return { success: true, details: res.data }; }
    async menuButton() { const res = await this.api.v1.machineMenuButtonUpdate(":menu_button"); return { success: true, details: res.data }; }
    async debugregRead() { const res = await this.api.v1.machineDebugregList(":debugreg"); return { success: true, value: res.data.value, details: res.data }; }
    async debugregWrite(value) { const res = await this.api.v1.machineDebugregUpdate(":debugreg", { value }); return { success: true, value: res.data.value, details: res.data }; }
    async version() { const res = await this.api.v1.versionList(); return res.data; }
    async info() { const res = await this.api.v1.infoList(); return res.data; }
    async drivesList() { const res = await this.api.v1.drivesList(); return res.data; }
    async driveMount(d, img, options) { const res = await this.api.v1.drivesMountUpdate(d, ":mount", { image: img, type: options?.type, mode: options?.mode }); return { success: true, details: res.data }; }
    async driveRemove(d) { const res = await this.api.v1.drivesRemoveUpdate(d, ":remove"); return { success: true, details: res.data }; }
    async driveReset(d) { const res = await this.api.v1.drivesResetUpdate(d, ":reset"); return { success: true, details: res.data }; }
    async driveOn(d) { const res = await this.api.v1.drivesOnUpdate(d, ":on"); return { success: true, details: res.data }; }
    async driveOff(d) { const res = await this.api.v1.drivesOffUpdate(d, ":off"); return { success: true, details: res.data }; }
    async driveSetMode(d, mode) { const res = await this.api.v1.drivesSetModeUpdate(d, ":set_mode", { mode }); return { success: true, details: res.data }; }
    async driveLoadRom(d, romPath) { const res = await this.api.v1.drivesLoadRomUpdate(d, ":load_rom", { file: romPath }); return { success: true, details: res.data }; }
    async streamStart(s, ip) { const res = await this.api.v1.streamsStartUpdate(s, ":start", { ip }); return { success: true, details: res.data }; }
    async streamStop(s) { const res = await this.api.v1.streamsStopUpdate(s, ":stop"); return { success: true, details: res.data }; }
    async configsList() { const res = await this.api.v1.configsList(); return res.data; }
    async configGet(cat, item) { const res = item ? await this.api.v1.configsDetail2(cat, item) : await this.api.v1.configsDetail(cat); return res.data; }
    async configSet(cat, item, value) { const res = await this.api.v1.configsUpdate(cat, item, { value }); return { success: true, details: res.data }; }
    async configBatchUpdate(payload) { const res = await this.api.v1.configsCreate(payload); return { success: true, details: res.data }; }
    async configLoadFromFlash() { const res = await this.api.v1.configsLoadFromFlashUpdate(":load_from_flash"); return { success: true, details: res.data }; }
    async configSaveToFlash() { const res = await this.api.v1.configsSaveToFlashUpdate(":save_to_flash"); return { success: true, details: res.data }; }
    async configResetToDefault() { const res = await this.api.v1.configsResetToDefaultUpdate(":reset_to_default"); return { success: true, details: res.data }; }
    async filesInfo(p) { const res = await this.api.v1.filesInfoDetail(encodeURIComponent(p), ":info"); return res.data; }
    async filesCreateD64(p, options) { const res = await this.api.v1.filesCreateD64Update(encodeURIComponent(p), ":create_d64", { tracks: options?.tracks, diskname: options?.diskname }); return { success: true, details: res.data }; }
    async filesCreateD71(p, options) { const res = await this.api.v1.filesCreateD71Update(encodeURIComponent(p), ":create_d71", { diskname: options?.diskname }); return { success: true, details: res.data }; }
    async filesCreateD81(p, options) { const res = await this.api.v1.filesCreateD81Update(encodeURIComponent(p), ":create_d81", { diskname: options?.diskname }); return { success: true, details: res.data }; }
    async filesCreateDnp(p, tracks, options) { const res = await this.api.v1.filesCreateDnpUpdate(encodeURIComponent(p), ":create_dnp", { tracks, diskname: options?.diskname }); return { success: true, details: res.data }; }
    async modplayFile(pathStr) { const res = await this.api.v1.runnersModplayUpdate(":modplay", { file: pathStr }); return { success: true, details: res.data }; }
}
class ViceBackend {
    constructor(config) {
        this.type = "vice";
        this.exe = config.exe || which("x64sc") || which("x64") || "x64sc";
    }
    async ping() { return Boolean(which(this.exe)); }
    async runPrg(prg) {
        const tmp = writeTempPrg(prg);
        try {
            const args = ["-silent", "-warp", "-autostart", tmp];
            const exitCode = await spawnWithTimeout(this.exe, args, resolveTimeout());
            return { success: exitCode === 0, details: { command: [this.exe, ...args].join(" "), exitCode } };
        }
        finally {
            try {
                fs.unlinkSync(tmp);
            }
            catch { }
        }
    }
    async loadPrgFile(_path) { throw unsupported("loadPrgFile"); }
    async runPrgFile(prgPath) {
        const args = ["-silent", "-warp", "-autostart", prgPath];
        const exitCode = await spawnWithTimeout(this.exe, args, resolveTimeout());
        return { success: exitCode === 0, details: { command: [this.exe, ...args].join(" "), exitCode } };
    }
    async runCrtFile(_path) { throw unsupported("runCrtFile"); }
    async sidplayFile(_p) { throw unsupported("sidplayFile"); }
    async sidplayAttachment(_sid) { throw unsupported("sidplayAttachment"); }
    async readMemory(_a) { throw unsupported("readMemory"); }
    async writeMemory(_a, _b) { throw unsupported("writeMemory"); }
    async reset() { throw unsupported("reset"); }
    async reboot() { throw unsupported("reboot"); }
    async pause() { throw unsupported("pause"); }
    async resume() { throw unsupported("resume"); }
    async poweroff() { throw unsupported("poweroff"); }
    async menuButton() { throw unsupported("menuButton"); }
    async debugregRead() { throw unsupported("debugregRead"); }
    async debugregWrite(_v) { throw unsupported("debugregWrite"); }
    async version() { return { emulator: "vice" }; }
    async info() { return { emulator: "vice", phase: 1 }; }
    async drivesList() { throw unsupported("drivesList"); }
    async driveMount() { throw unsupported("driveMount"); }
    async driveRemove() { throw unsupported("driveRemove"); }
    async driveReset() { throw unsupported("driveReset"); }
    async driveOn() { throw unsupported("driveOn"); }
    async driveOff() { throw unsupported("driveOff"); }
    async driveSetMode() { throw unsupported("driveSetMode"); }
    async driveLoadRom() { throw unsupported("driveLoadRom"); }
    async streamStart() { throw unsupported("streamStart"); }
    async streamStop() { throw unsupported("streamStop"); }
    async configsList() { throw unsupported("configsList"); }
    async configGet() { throw unsupported("configGet"); }
    async configSet() { throw unsupported("configSet"); }
    async configBatchUpdate() { throw unsupported("configBatchUpdate"); }
    async configLoadFromFlash() { throw unsupported("configLoadFromFlash"); }
    async configSaveToFlash() { throw unsupported("configSaveToFlash"); }
    async configResetToDefault() { throw unsupported("configResetToDefault"); }
    async filesInfo() { throw unsupported("filesInfo"); }
    async filesCreateD64() { throw unsupported("filesCreateD64"); }
    async filesCreateD71() { throw unsupported("filesCreateD71"); }
    async filesCreateD81() { throw unsupported("filesCreateD81"); }
    async filesCreateDnp() { throw unsupported("filesCreateDnp"); }
}
function unsupported(name) { const err = new Error(`Operation '${name}' is not supported by the VICE backend in phase one`); err.code = "UNSUPPORTED"; return err; }
function extractBytes(data) {
    if (!data)
        return new Uint8Array();
    if (data instanceof ArrayBuffer)
        return new Uint8Array(data);
    if (Buffer.isBuffer(data))
        return new Uint8Array(data);
    if (data instanceof Uint8Array)
        return data;
    if (typeof data === "string") {
        try {
            return Uint8Array.from(Buffer.from(data, "base64"));
        }
        catch {
            return Uint8Array.from(Buffer.from(data, "hex"));
        }
    }
    if (Array.isArray(data?.data))
        return Uint8Array.from((data.data) ?? []);
    if (Array.isArray(data))
        return Uint8Array.from(data);
    if (typeof data === "object" && data !== null) {
        const maybe = data.data;
        if (typeof maybe === "string")
            return Uint8Array.from(Buffer.from(maybe, "base64"));
        if (Array.isArray(maybe))
            return Uint8Array.from(maybe);
    }
    return new Uint8Array();
}
function which(binary) {
    const hasSep = binary.includes("/") || binary.includes("\\");
    if (hasSep) {
        try {
            if (fs.existsSync(binary))
                return binary;
        }
        catch { }
        return null;
    }
    const envPath = process.env.PATH || "";
    for (const dir of envPath.split(path.delimiter)) {
        if (!dir)
            continue;
        const candidate = path.join(dir, binary);
        try {
            if (fs.existsSync(candidate))
                return candidate;
        }
        catch { }
    }
    return null;
}
function writeTempPrg(prg) {
    const dir = process.env.TMPDIR || process.env.TEMP || "/tmp";
    const file = path.join(dir, `c64bridge-${Date.now()}-${Math.random().toString(16).slice(2)}.prg`);
    const buf = Buffer.isBuffer(prg) ? prg : Buffer.from(prg);
    fs.writeFileSync(file, buf);
    return file;
}
function resolveTimeout() { const n = Number(process.env.VICE_RUN_TIMEOUT_MS); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10000; }
async function spawnWithTimeout(file, args, timeoutMs) {
    return await new Promise((resolve) => {
        const child = spawn(file, args, { stdio: ["ignore", "ignore", "pipe"] });
        const timer = setTimeout(() => { try {
            child.kill("SIGKILL");
        }
        catch { } }, Math.max(1000, timeoutMs));
        child.on("close", (code) => { clearTimeout(timer); resolve(code ?? 0); });
        child.on("error", () => { clearTimeout(timer); resolve(127); });
    });
}
export async function createFacade(logger, options) {
    // Caller-forced preference: use c64u with provided base URL (used by tests and server wiring)
    if (options?.preferredC64uBaseUrl) {
        const backend = new C64uBackend({ baseUrl: options.preferredC64uBaseUrl });
        logger?.info?.("Active backend: c64u (forced by caller)");
        return { facade: backend, selected: "c64u", reason: "forced by caller", details: { baseUrl: options.preferredC64uBaseUrl } };
    }
    const cfg = readConfigFile();
    const envMode = (process.env.C64_MODE || "").toLowerCase().trim();
    const hasC64u = Boolean(cfg?.c64u);
    const hasVice = Boolean(cfg?.vice);
    if (envMode === "c64u") {
        const backend = new C64uBackend(cfg?.c64u ?? {});
        logger?.info?.("Active backend: c64u (from env override)");
        return { facade: backend, selected: "c64u", reason: "env override", details: { baseUrl: backend.getBaseUrl?.() } };
    }
    if (envMode === "vice") {
        const backend = new ViceBackend(cfg?.vice ?? {});
        logger?.info?.("Active backend: vice (from env override)");
        return { facade: backend, selected: "vice", reason: "env override", details: { exe: (cfg?.vice?.exe || which("x64sc") || "x64sc") } };
    }
    if (hasC64u && !hasVice) {
        const backend = new C64uBackend(cfg.c64u);
        logger?.info?.("Active backend: c64u (from config)");
        return { facade: backend, selected: "c64u", reason: "config only", details: { baseUrl: backend.getBaseUrl?.() } };
    }
    if (!hasC64u && hasVice) {
        const backend = new ViceBackend(cfg.vice);
        logger?.info?.("Active backend: vice (from config)");
        return { facade: backend, selected: "vice", reason: "config only", details: { exe: (cfg.vice.exe || which("x64sc") || "x64sc") } };
    }
    if (hasC64u && hasVice) {
        const backend = new C64uBackend(cfg.c64u);
        logger?.info?.("Active backend: c64u (both defined; default preference)");
        return { facade: backend, selected: "c64u", reason: "both defined (prefer c64u)", details: { baseUrl: backend.getBaseUrl?.() } };
    }
    // No configuration
    const probeBase = resolveBaseUrl({});
    try {
        const res = await axios.get(probeBase, { timeout: 1500 });
        if (res.status >= 200 && res.status < 500) {
            const backend = new C64uBackend({ baseUrl: probeBase });
            logger?.info?.("Active backend: c64u (fallback – hardware reachable)");
            return { facade: backend, selected: "c64u", reason: "fallback (reachable)", details: { baseUrl: probeBase } };
        }
    }
    catch { }
    const backend = new ViceBackend(cfg?.vice ?? {});
    logger?.info?.("Active backend: vice (fallback – hardware unavailable)");
    return { facade: backend, selected: "vice", reason: "fallback (hardware unavailable)", details: { exe: (cfg?.vice?.exe || which("x64sc") || "x64sc") } };
}
function resolveBaseUrl(config) {
    const explicit = normaliseBaseUrl(config.baseUrl);
    if (explicit)
        return explicit;
    const hostEntries = [configuredString(config.host), configuredString(config.hostname)];
    for (const entry of hostEntries) {
        if (!entry)
            continue;
        const parsed = parseEndpoint(entry);
        if (parsed.hostname) {
            const port = firstDefined(configuredPort(config.port), parsed.port) ?? DEFAULT_C64U_PORT;
            return buildBaseUrl(parsed.hostname, port);
        }
    }
    return buildBaseUrl(DEFAULT_C64U_HOST, DEFAULT_C64U_PORT);
}
function configuredString(value) {
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed ? trimmed : undefined;
    }
    return undefined;
}
function configuredPort(value) {
    if (typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 65535) {
        return value;
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed)
            return undefined;
        const parsed = Number(trimmed);
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
    try {
        const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
        const url = new URL(hasScheme ? value : `http://${value}`);
        const hostname = url.hostname || undefined;
        const port = url.port ? configuredPort(url.port) : undefined;
        return { hostname, port };
    }
    catch {
        return {};
    }
}
function buildBaseUrl(host, port) {
    const normalizedPort = Number.isInteger(port) && port > 0 ? port : DEFAULT_C64U_PORT;
    const hostPart = formatHost(host);
    const suffix = normalizedPort === DEFAULT_C64U_PORT ? "" : `:${normalizedPort}`;
    return `http://${hostPart}${suffix}`;
}
function formatHost(host) {
    return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
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
