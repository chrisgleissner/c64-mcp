/*
 * Unified C64 abstraction and backend selection
 */

import axios from "axios";
import { Buffer } from "node:buffer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Api } from "../generated/c64/index.js";
import { createLoggingHttpClient } from "./loggingHttpClient.js";
import { ViceClient } from "./vice/viceClient.js";
import { waitForBasicReady } from "./vice/readiness.js";
import { startViceProcess, type ViceProcessHandle } from "./vice/process.js";

export type DeviceType = "c64u" | "vice";

export interface RunResult {
  success: boolean;
  details?: unknown;
}

export interface C64Facade {
  readonly type: DeviceType;
  ping(): Promise<boolean>;
  // Program runners
  runPrg(prg: Uint8Array | Buffer): Promise<RunResult>;
  loadPrgFile(path: string): Promise<RunResult>;
  runPrgFile(path: string): Promise<RunResult>;
  runCrtFile(path: string): Promise<RunResult>;
  sidplayFile(path: string, songnr?: number): Promise<RunResult>;
  sidplayAttachment(sid: Uint8Array | Buffer, options?: { songnr?: number; songlengths?: Uint8Array | Buffer }): Promise<RunResult>;
  // Memory/register access
  readMemory(address: number, length: number): Promise<Uint8Array>;
  writeMemory(address: number, bytes: Uint8Array): Promise<void>;
  // System control
  reset(): Promise<RunResult>;
  reboot(): Promise<RunResult>;
  pause(): Promise<RunResult>;
  resume(): Promise<RunResult>;
  poweroff(): Promise<RunResult>;
  menuButton(): Promise<RunResult>;
  debugregRead(): Promise<{ success: boolean; value?: string; details?: unknown }>;
  debugregWrite(value: string): Promise<{ success: boolean; value?: string; details?: unknown }>;
  version(): Promise<unknown>;
  info(): Promise<unknown>;
  // Drives & files
  drivesList(): Promise<unknown>;
  driveMount(drive: string, imagePath: string, options?: { type?: "d64" | "g64" | "d71" | "g71" | "d81"; mode?: "readwrite" | "readonly" | "unlinked" }): Promise<RunResult>;
  driveRemove(drive: string): Promise<RunResult>;
  driveReset(drive: string): Promise<RunResult>;
  driveOn(drive: string): Promise<RunResult>;
  driveOff(drive: string): Promise<RunResult>;
  driveSetMode(drive: string, mode: "1541" | "1571" | "1581"): Promise<RunResult>;
  driveLoadRom(drive: string, romPath: string): Promise<RunResult>;
  streamStart(stream: "video" | "audio" | "debug", ip: string): Promise<RunResult>;
  streamStop(stream: "video" | "audio" | "debug"): Promise<RunResult>;
  configsList(): Promise<unknown>;
  configGet(category: string, item?: string): Promise<unknown>;
  configSet(category: string, item: string, value: string): Promise<RunResult>;
  configBatchUpdate(payload: Record<string, object>): Promise<RunResult>;
  configLoadFromFlash(): Promise<RunResult>;
  configSaveToFlash(): Promise<RunResult>;
  configResetToDefault(): Promise<RunResult>;
  filesInfo(path: string): Promise<unknown>;
  filesCreateD64(path: string, options?: { tracks?: 35 | 40; diskname?: string }): Promise<RunResult>;
  filesCreateD71(path: string, options?: { diskname?: string }): Promise<RunResult>;
  filesCreateD81(path: string, options?: { diskname?: string }): Promise<RunResult>;
  filesCreateDnp(path: string, tracks: number, options?: { diskname?: string }): Promise<RunResult>;
  modplayFile?(path: string): Promise<RunResult>;
}

export interface C64uConfig {
  host?: string;
  hostname?: string;
  baseUrl?: string;
  port?: number | string;
}
export interface ViceConfig {
  exe?: string;
  host?: string;
  port?: number | string;
}
export interface C64BridgeConfigFile { c64u?: C64uConfig; vice?: ViceConfig }

const DEFAULT_C64U_HOST = "c64u";
const DEFAULT_C64U_PORT = 80;
const DEFAULT_VICE_HOST = "127.0.0.1";
const DEFAULT_VICE_PORT = 6502;

function readConfigFile(): C64BridgeConfigFile | null {
  const envPath = process.env.C64BRIDGE_CONFIG;
  const candidates: string[] = [];
  if (envPath) candidates.push(envPath);
  // Repo root
  try {
    const here = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", ".c64bridge.json");
    candidates.push(here);
  } catch {}
  const home = process.env.HOME || os.homedir();
  if (home) candidates.push(path.join(home, ".c64bridge.json"));
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const text = fs.readFileSync(p, "utf8");
        const json = JSON.parse(text);
        return json ?? null;
      }
    } catch {}
  }
  return null;
}

class C64uBackend implements C64Facade {
  readonly type = "c64u" as const;
  private readonly baseUrl: string;
  private readonly api: Api<unknown>;

  constructor(config: C64uConfig) {
    const baseUrl = resolveBaseUrl(config);
    this.baseUrl = baseUrl;
    const http = createLoggingHttpClient({ baseURL: baseUrl, timeout: 10_000 });
    this.api = new Api(http);
  }

  getBaseUrl(): string { return this.baseUrl; }

  async ping(): Promise<boolean> {
    try {
      const res = await axios.get(this.baseUrl, { timeout: 2000 });
      return res.status >= 200 && res.status < 500;
    } catch { return false; }
  }

  async runPrg(prg: Uint8Array | Buffer): Promise<RunResult> {
    const payload = Buffer.isBuffer(prg) ? prg : Buffer.from(prg);
    const res = await this.api.v1.runnersRunPrgCreate(":run_prg", payload as any, { headers: { "Content-Type": "application/octet-stream" } });
    return { success: true, details: res.data };
  }
  async loadPrgFile(pathStr: string): Promise<RunResult> {
    const res = await this.api.v1.runnersLoadPrgUpdate(":load_prg", { file: pathStr });
    return { success: true, details: res.data };
  }
  async runPrgFile(pathStr: string): Promise<RunResult> {
    const res = await this.api.v1.runnersRunPrgUpdate(":run_prg", { file: pathStr });
    return { success: true, details: res.data };
  }
  async runCrtFile(pathStr: string): Promise<RunResult> {
    const res = await this.api.v1.runnersRunCrtUpdate(":run_crt", { file: pathStr });
    return { success: true, details: res.data };
  }
  async sidplayFile(pathStr: string, songnr?: number): Promise<RunResult> {
    const res = await this.api.v1.runnersSidplayUpdate(":sidplay", { file: pathStr, songnr });
    return { success: true, details: res.data };
  }
  async sidplayAttachment(sid: Uint8Array | Buffer, options?: { songnr?: number; songlengths?: Uint8Array | Buffer }): Promise<RunResult> {
    const form: any = { sid: Buffer.isBuffer(sid) ? sid : Buffer.from(sid) };
    if (options?.songlengths) form.songlengths = Buffer.isBuffer(options.songlengths) ? options.songlengths : Buffer.from(options.songlengths);
    const res = await this.api.v1.runnersSidplayCreate(":sidplay", form as any, options?.songnr !== undefined ? { songnr: options.songnr } : undefined);
    return { success: true, details: res.data };
  }
  async readMemory(address: number, length: number): Promise<Uint8Array> {
    const addrStr = address.toString(16).toUpperCase().padStart(4, "0");
    const response = await this.api.v1.machineReadmemList(
      ":readmem",
      { address: addrStr, length },
      { format: "arraybuffer", headers: { Accept: "application/octet-stream, application/json" } as any },
    );
    const contentType = (response.headers?.["content-type"] ?? "").toString().toLowerCase();
    const body = response.data as unknown;
    if (contentType.includes("application/json")) {
      const text = Buffer.from(body as ArrayBuffer).toString("utf8");
      try { const parsed = JSON.parse(text); return extractBytes(parsed?.data ?? parsed); } catch { return extractBytes(text); }
    }
    if (body instanceof ArrayBuffer) return new Uint8Array(body);
    return extractBytes(body);
  }
  async writeMemory(address: number, bytes: Uint8Array): Promise<void> {
    const addrStr = address.toString(16).toUpperCase().padStart(4, "0");
    if (bytes.length <= 128) {
      await this.api.v1.machineWritememUpdate(":writemem", { address: addrStr, data: Buffer.from(bytes).toString("hex").toUpperCase() });
    } else {
      await this.api.v1.machineWritememCreate(
        ":writemem",
        { address: addrStr },
        Buffer.from(bytes) as unknown as File,
        { headers: { "Content-Type": "application/octet-stream" } },
      );
    }
  }
  async reset(): Promise<RunResult> { const res = await this.api.v1.machineResetUpdate(":reset"); return { success: true, details: res.data }; }
  async reboot(): Promise<RunResult> { const res = await this.api.v1.machineRebootUpdate(":reboot"); return { success: true, details: res.data }; }
  async pause(): Promise<RunResult> { const res = await this.api.v1.machinePauseUpdate(":pause"); return { success: true, details: res.data }; }
  async resume(): Promise<RunResult> { const res = await this.api.v1.machineResumeUpdate(":resume"); return { success: true, details: res.data }; }
  async poweroff(): Promise<RunResult> { const res = await this.api.v1.machinePoweroffUpdate(":poweroff"); return { success: true, details: res.data }; }
  async menuButton(): Promise<RunResult> { const res = await this.api.v1.machineMenuButtonUpdate(":menu_button"); return { success: true, details: res.data }; }
  async debugregRead(): Promise<{ success: boolean; value?: string; details?: unknown }> { const res = await this.api.v1.machineDebugregList(":debugreg"); return { success: true, value: (res.data as any).value, details: res.data }; }
  async debugregWrite(value: string): Promise<{ success: boolean; value?: string; details?: unknown }> { const res = await this.api.v1.machineDebugregUpdate(":debugreg", { value }); return { success: true, value: (res.data as any).value, details: res.data }; }
  async version(): Promise<unknown> { const res = await this.api.v1.versionList(); return res.data; }
  async info(): Promise<unknown> { const res = await this.api.v1.infoList(); return res.data; }
  async drivesList(): Promise<unknown> { const res = await this.api.v1.drivesList(); return res.data; }
  async driveMount(d: string, img: string, options?: { type?: "d64" | "g64" | "d71" | "g71" | "d81"; mode?: "readwrite" | "readonly" | "unlinked" }): Promise<RunResult> { const res = await this.api.v1.drivesMountUpdate(d, ":mount", { image: img, type: options?.type, mode: options?.mode }); return { success: true, details: res.data }; }
  async driveRemove(d: string): Promise<RunResult> { const res = await this.api.v1.drivesRemoveUpdate(d, ":remove"); return { success: true, details: res.data }; }
  async driveReset(d: string): Promise<RunResult> { const res = await this.api.v1.drivesResetUpdate(d, ":reset"); return { success: true, details: res.data }; }
  async driveOn(d: string): Promise<RunResult> { const res = await this.api.v1.drivesOnUpdate(d, ":on"); return { success: true, details: res.data }; }
  async driveOff(d: string): Promise<RunResult> { const res = await this.api.v1.drivesOffUpdate(d, ":off"); return { success: true, details: res.data }; }
  async driveSetMode(d: string, mode: "1541" | "1571" | "1581"): Promise<RunResult> { const res = await this.api.v1.drivesSetModeUpdate(d, ":set_mode", { mode }); return { success: true, details: res.data }; }
  async driveLoadRom(d: string, romPath: string): Promise<RunResult> { const res = await this.api.v1.drivesLoadRomUpdate(d, ":load_rom", { file: romPath }); return { success: true, details: res.data }; }
  async streamStart(s: "video" | "audio" | "debug", ip: string): Promise<RunResult> { const res = await this.api.v1.streamsStartUpdate(s, ":start", { ip }); return { success: true, details: res.data }; }
  async streamStop(s: "video" | "audio" | "debug"): Promise<RunResult> { const res = await this.api.v1.streamsStopUpdate(s, ":stop"); return { success: true, details: res.data }; }
  async configsList(): Promise<unknown> { const res = await this.api.v1.configsList(); return res.data; }
  async configGet(cat: string, item?: string): Promise<unknown> { const res = item ? await this.api.v1.configsDetail2(cat, item) : await this.api.v1.configsDetail(cat); return res.data; }
  async configSet(cat: string, item: string, value: string): Promise<RunResult> { const res = await this.api.v1.configsUpdate(cat, item, { value }); return { success: true, details: res.data }; }
  async configBatchUpdate(payload: Record<string, object>): Promise<RunResult> { const res = await this.api.v1.configsCreate(payload); return { success: true, details: res.data }; }
  async configLoadFromFlash(): Promise<RunResult> { const res = await this.api.v1.configsLoadFromFlashUpdate(":load_from_flash"); return { success: true, details: res.data }; }
  async configSaveToFlash(): Promise<RunResult> { const res = await this.api.v1.configsSaveToFlashUpdate(":save_to_flash"); return { success: true, details: res.data }; }
  async configResetToDefault(): Promise<RunResult> { const res = await this.api.v1.configsResetToDefaultUpdate(":reset_to_default"); return { success: true, details: res.data }; }
  async filesInfo(p: string): Promise<unknown> { const res = await this.api.v1.filesInfoDetail(encodeURIComponent(p), ":info"); return res.data; }
  async filesCreateD64(p: string, options?: { tracks?: 35 | 40; diskname?: string }): Promise<RunResult> { const res = await this.api.v1.filesCreateD64Update(encodeURIComponent(p), ":create_d64", { tracks: options?.tracks, diskname: options?.diskname }); return { success: true, details: res.data }; }
  async filesCreateD71(p: string, options?: { diskname?: string }): Promise<RunResult> { const res = await this.api.v1.filesCreateD71Update(encodeURIComponent(p), ":create_d71", { diskname: options?.diskname }); return { success: true, details: res.data }; }
  async filesCreateD81(p: string, options?: { diskname?: string }): Promise<RunResult> { const res = await this.api.v1.filesCreateD81Update(encodeURIComponent(p), ":create_d81", { diskname: options?.diskname }); return { success: true, details: res.data }; }
  async filesCreateDnp(p: string, tracks: number, options?: { diskname?: string }): Promise<RunResult> { const res = await this.api.v1.filesCreateDnpUpdate(encodeURIComponent(p), ":create_dnp", { tracks, diskname: options?.diskname }); return { success: true, details: res.data }; }
  async modplayFile(pathStr: string): Promise<RunResult> { const res = await (this.api as any).v1.runnersModplayUpdate(":modplay", { file: pathStr }); return { success: true, details: res.data }; }
}

export class ViceBackend implements C64Facade {
  readonly type = "vice" as const;
  private readonly exe: string;
  private readonly host: string;
  private readonly port: number;
  private readonly manageProcess: boolean;
  private readonly mockMode: boolean;
  private readonly warp: boolean;
  private readonly visible: boolean;
  private readonly extraArgs: string[];
  private static readonly supervisors = new Map<string, ViceProcessHandle>();

  constructor(config: ViceConfig) {
    const envBinary = configuredString(process.env.VICE_BINARY);
    this.exe = configuredString(config.exe) ?? envBinary ?? which("x64sc") ?? which("x64") ?? "x64sc";

    const envHost = normaliseViceHost(process.env.VICE_HOST);
    const envPort = normaliseVicePort(process.env.VICE_PORT);
    this.host = firstDefined(envHost, normaliseViceHost(config.host)) ?? DEFAULT_VICE_HOST;
    this.port = firstDefined(envPort, normaliseVicePort(config.port)) ?? DEFAULT_VICE_PORT;

    this.mockMode = (process.env.VICE_TEST_TARGET || "").toLowerCase() === "mock";
    const hostLower = this.host.toLowerCase();
    const isLocal = hostLower === "127.0.0.1" || hostLower === "localhost";
    this.manageProcess = !this.mockMode && isLocal;

    const warpEnv = process.env.VICE_WARP;
    const visibleEnv = process.env.VICE_VISIBLE;
    this.visible = visibleEnv === "1";
    if (warpEnv === "0") this.warp = false;
    else if (warpEnv === "1") this.warp = true;
    else this.warp = !this.visible;

    const argsEnv = configuredString(process.env.VICE_ARGS);
    this.extraArgs = argsEnv ? parseArgsList(argsEnv) : [];
  }

  private async tryPingExisting(): Promise<boolean> {
    const client = new ViceClient();
    try {
      await client.connect(this.port, this.host);
      await client.info();
      return true;
    } catch {
      return false;
    } finally {
      client.close();
    }
  }

  private async ensureProcess(): Promise<void> {
    if (!this.manageProcess) return;
    const key = `${this.host}:${this.port}`;
    const existing = ViceBackend.supervisors.get(key);
    if (existing) {
      const running = existing.process.exitCode === null && existing.process.signalCode === null;
      if (running) return;
      try { await existing.stop(); } catch {}
      ViceBackend.supervisors.delete(key);
    }
    if (await this.tryPingExisting()) return;
    const handle = await startViceProcess({
      binary: this.exe,
      host: this.host,
      port: this.port,
      warp: this.warp,
      visible: this.visible,
      extraArgs: this.extraArgs.length > 0 ? this.extraArgs : undefined,
    });
    ViceBackend.supervisors.set(key, handle);
    handle.process.once("exit", () => {
      ViceBackend.supervisors.delete(key);
    });
    process.once("exit", () => {
      handle.stop().catch(() => {});
    });
  }

  private async withClient<T>(fn: (client: ViceClient) => Promise<T>): Promise<T> {
    if (!this.mockMode) await this.ensureProcess();
    const client = new ViceClient();
    await client.connect(this.port, this.host);
    try {
      return await fn(client);
    } finally {
      client.close();
    }
  }

  async withMonitor<T>(fn: (client: ViceClient) => Promise<T>): Promise<T> {
    return this.withClient(fn);
  }

  async ping(): Promise<boolean> {
    try {
      await this.withClient(async (client) => {
        await client.info();
      });
      return true;
    } catch {
      return false;
    }
  }

  private async injectPrg(buffer: Buffer): Promise<void> {
    if (buffer.length < 2) throw new Error("PRG data too short");
    const loadAddress = buffer.readUInt16LE(0);
    const body = buffer.subarray(2);
    await this.withClient(async (client) => {
      await client.reset();
      await waitForBasicReady(client, { timeoutMs: 10_000, ensurePrompt: true });
      if (body.length > 0) await client.memSet(loadAddress, body);
      const programEnd = loadAddress + body.length;
      const ptrs = Buffer.alloc(8);
      ptrs.writeUInt16LE(loadAddress, 0);
      ptrs.writeUInt16LE(programEnd, 2);
      ptrs.writeUInt16LE(programEnd, 4);
      ptrs.writeUInt16LE(programEnd, 6);
      await client.memSet(0x002B, ptrs);
      await client.keyboardFeed("RUN\r");
      await client.exitMonitor();
    });
  }

  async runPrg(prg: Uint8Array | Buffer): Promise<RunResult> {
    const buffer = Buffer.isBuffer(prg) ? prg : Buffer.from(prg);
    await this.injectPrg(buffer);
    return { success: true };
  }

  async loadPrgFile(_path: string): Promise<RunResult> { throw unsupported("loadPrgFile"); }

  async runPrgFile(prgPath: string): Promise<RunResult> {
    const data = fs.readFileSync(prgPath);
    await this.injectPrg(data);
    return { success: true };
  }
  async runCrtFile(_path: string): Promise<RunResult> { throw unsupported("runCrtFile"); }
  async sidplayFile(_p: string): Promise<RunResult> { throw unsupported("sidplayFile"); }
  async sidplayAttachment(_sid: Uint8Array | Buffer): Promise<RunResult> { throw unsupported("sidplayAttachment"); }

  async readMemory(address: number, length: number): Promise<Uint8Array> {
    if (!Number.isInteger(address) || address < 0 || address > 0xffff) {
      throw new Error("Address must be within 0x0000-0xFFFF");
    }
    if (!Number.isInteger(length) || length <= 0) {
      throw new Error("Length must be positive");
    }
    const end = Math.min(0xffff, address + length - 1);
    return await this.withClient(async (client) => {
      const buf = await client.memGet(address, end);
      return buf.subarray(0, Math.min(buf.length, length));
    });
  }

  async writeMemory(address: number, bytes: Uint8Array): Promise<void> {
    if (!Number.isInteger(address) || address < 0 || address > 0xffff) {
      throw new Error("Address must be within 0x0000-0xFFFF");
    }
    if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
      throw new Error("Bytes must be a non-empty Uint8Array");
    }
    await this.withClient(async (client) => {
      await client.memSet(address, Buffer.from(bytes));
    });
  }

  async reset(): Promise<RunResult> {
    await this.withClient(async (client) => {
      await client.reset();
    });
    return { success: true };
  }

  async reboot(): Promise<RunResult> { return this.reset(); }

  async pause(): Promise<RunResult> { return { success: true }; }

  async resume(): Promise<RunResult> { return { success: true }; }
  async poweroff(): Promise<RunResult> { throw unsupported("poweroff"); }
  async menuButton(): Promise<RunResult> { throw unsupported("menuButton"); }
  async debugregRead(): Promise<{ success: boolean; value?: string; details?: unknown }> { throw unsupported("debugregRead"); }
  async debugregWrite(_v: string): Promise<{ success: boolean; value?: string; details?: unknown }> { throw unsupported("debugregWrite"); }
  async version(): Promise<unknown> { return { emulator: "vice", host: this.host, port: this.port }; }

  async info(): Promise<unknown> {
    return await this.withClient(async (client) => {
      await client.info();
      return { emulator: "vice", host: this.host, port: this.port };
    });
  }

  getEndpoint(): { host: string; port: number } {
    return { host: this.host, port: this.port };
  }

  async drivesList(): Promise<unknown> { throw unsupported("drivesList"); }
  async driveMount(): Promise<RunResult> { throw unsupported("driveMount"); }
  async driveRemove(): Promise<RunResult> { throw unsupported("driveRemove"); }
  async driveReset(): Promise<RunResult> { throw unsupported("driveReset"); }
  async driveOn(): Promise<RunResult> { throw unsupported("driveOn"); }
  async driveOff(): Promise<RunResult> { throw unsupported("driveOff"); }
  async driveSetMode(): Promise<RunResult> { throw unsupported("driveSetMode"); }
  async driveLoadRom(): Promise<RunResult> { throw unsupported("driveLoadRom"); }
  async streamStart(): Promise<RunResult> { throw unsupported("streamStart"); }
  async streamStop(): Promise<RunResult> { throw unsupported("streamStop"); }
  async configsList(): Promise<unknown> { throw unsupported("configsList"); }
  async configGet(): Promise<unknown> { throw unsupported("configGet"); }
  async configSet(): Promise<RunResult> { throw unsupported("configSet"); }
  async configBatchUpdate(): Promise<RunResult> { throw unsupported("configBatchUpdate"); }
  async configLoadFromFlash(): Promise<RunResult> { throw unsupported("configLoadFromFlash"); }
  async configSaveToFlash(): Promise<RunResult> { throw unsupported("configSaveToFlash"); }
  async configResetToDefault(): Promise<RunResult> { throw unsupported("configResetToDefault"); }
  async filesInfo(): Promise<unknown> { throw unsupported("filesInfo"); }
  async filesCreateD64(): Promise<RunResult> { throw unsupported("filesCreateD64"); }
  async filesCreateD71(): Promise<RunResult> { throw unsupported("filesCreateD71"); }
  async filesCreateD81(): Promise<RunResult> { throw unsupported("filesCreateD81"); }
  async filesCreateDnp(): Promise<RunResult> { throw unsupported("filesCreateDnp"); }
}
function unsupported(name: string): Error { const err = new Error(`Operation '${name}' is not supported by the VICE backend in phase one`); (err as any).code = "UNSUPPORTED"; return err; }

function extractBytes(data: unknown): Uint8Array {
  if (!data) return new Uint8Array();
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (Buffer.isBuffer(data)) return new Uint8Array(data);
  if (data instanceof Uint8Array) return data;
  if (typeof data === "string") { try { return Uint8Array.from(Buffer.from(data, "base64")); } catch { return Uint8Array.from(Buffer.from(data, "hex")); } }
  if (Array.isArray((data as any)?.data)) return Uint8Array.from(((data as any).data) ?? []);
  if (Array.isArray(data)) return Uint8Array.from(data as number[]);
  if (typeof data === "object" && data !== null) {
    const maybe = (data as Record<string, unknown>).data;
    if (typeof maybe === "string") return Uint8Array.from(Buffer.from(maybe, "base64"));
    if (Array.isArray(maybe)) return Uint8Array.from(maybe as number[]);
  }
  return new Uint8Array();
}

function which(binary: string): string | null {
  const hasSep = binary.includes("/") || binary.includes("\\");
  if (hasSep) { try { if (fs.existsSync(binary)) return binary; } catch {} return null; }
  const envPath = process.env.PATH || "";
  for (const dir of envPath.split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, binary);
    try { if (fs.existsSync(candidate)) return candidate; } catch {}
  }
  return null;
}

export interface FacadeSelection { facade: C64Facade; selected: DeviceType; reason: string; details?: Record<string, unknown> }

export interface FacadeOptions { preferredC64uBaseUrl?: string }

export async function createFacade(logger?: { info: (...a: any[]) => void }, options?: FacadeOptions): Promise<FacadeSelection> {
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
    const endpoint = backend.getEndpoint();
    return { facade: backend, selected: "vice", reason: "env override", details: { host: endpoint.host, port: endpoint.port } };
  }

  if (hasC64u && !hasVice) {
    const backend = new C64uBackend(cfg!.c64u!);
    logger?.info?.("Active backend: c64u (from config)");
    return { facade: backend, selected: "c64u", reason: "config only", details: { baseUrl: backend.getBaseUrl?.() } };
  }
  if (!hasC64u && hasVice) {
    const backend = new ViceBackend(cfg!.vice!);
    logger?.info?.("Active backend: vice (from config)");
    const endpoint = backend.getEndpoint();
    return { facade: backend, selected: "vice", reason: "config only", details: { host: endpoint.host, port: endpoint.port } };
  }
  if (hasC64u && hasVice) {
    const backend = new C64uBackend(cfg!.c64u!);
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
  } catch {}
  const backend = new ViceBackend(cfg?.vice ?? {});
  logger?.info?.("Active backend: vice (fallback – hardware unavailable)");
  const endpoint = backend.getEndpoint();
  return { facade: backend, selected: "vice", reason: "fallback (hardware unavailable)", details: { host: endpoint.host, port: endpoint.port } };
}

function resolveBaseUrl(config: C64uConfig): string {
  const explicit = normaliseBaseUrl(config.baseUrl);
  if (explicit) return explicit;

  const hostEntries = [configuredString(config.host), configuredString(config.hostname)];
  for (const entry of hostEntries) {
    if (!entry) continue;
    const parsed = parseEndpoint(entry);
    if (parsed.hostname) {
      const port = firstDefined(configuredPort(config.port), parsed.port) ?? DEFAULT_C64U_PORT;
      return buildBaseUrl(parsed.hostname, port);
    }
  }

  return buildBaseUrl(DEFAULT_C64U_HOST, DEFAULT_C64U_PORT);
}

function configuredString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  return undefined;
}

function configuredPort(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 65535) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
      return parsed;
    }
  }
  return undefined;
}

function normaliseBaseUrl(value?: string): string | undefined {
  const input = configuredString(value);
  if (!input) return undefined;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) {
    return `http://${input}`;
  }
  return stripTrailingSlash(input);
}

function parseEndpoint(value: string): { hostname?: string; port?: number } {
  try {
    const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
    const url = new URL(hasScheme ? value : `http://${value}`);
    const hostname = url.hostname || undefined;
    const port = url.port ? configuredPort(url.port) : undefined;
    return { hostname, port };
  } catch {
    return {};
  }
}

function buildBaseUrl(host: string, port: number): string {
  const normalizedPort = Number.isInteger(port) && port > 0 ? port : DEFAULT_C64U_PORT;
  const hostPart = formatHost(host);
  const suffix = normalizedPort === DEFAULT_C64U_PORT ? "" : `:${normalizedPort}`;
  return `http://${hostPart}${suffix}`;
}

function formatHost(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

function stripTrailingSlash(input: string): string {
  return input.replace(/\/+$/, "");
}

function parseArgsList(input: string): string[] {
  const args: string[] = [];
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    const value = match[1] ?? match[2] ?? match[3] ?? "";
    args.push(value.replace(/\\(["'\\])/g, "$1"));
  }
  return args;
}

function firstDefined<T>(...values: Array<T | undefined>): T | undefined {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function normaliseViceHost(input?: string): string | undefined {
  const trimmed = configuredString(input);
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function normaliseVicePort(value?: string | number): number | undefined {
  return configuredPort(value);
}
