import { Buffer } from "node:buffer";
import axios from "axios";
import { basicToPrg } from "./basicConverter.js";
import { petsciiToAscii } from "./petscii.js";
import { resolveAddressSymbol } from "./knowledge.js";
import { Api, HttpClient } from "../generated/ultimate64/index.js";

export interface RunBasicResult {
  success: boolean;
  details?: unknown;
}

export interface MemoryReadResult {
  success: boolean;
  data?: string;
  details?: unknown;
}

export class C64Client {
  private readonly http: HttpClient<unknown>;
  private readonly api: Api<unknown>;

  constructor(baseUrl: string) {
    this.http = new HttpClient({
      baseURL: baseUrl,
      timeout: 10_000,
    });
    this.api = new Api(this.http);
  }

  async uploadAndRunBasic(program: string): Promise<RunBasicResult> {
    const prg = basicToPrg(program);
    return this.runPrg(prg);
  }

  async runPrg(prg: Uint8Array | Buffer): Promise<RunBasicResult> {
    try {
      const payload = Buffer.isBuffer(prg) ? prg : Buffer.from(prg);
      const response = await this.api.v1.runnersRunPrgCreate(":run_prg", payload as any, {
        headers: {
          "Content-Type": "application/octet-stream",
        },
      });

      return {
        success: true,
        details: response.data,
      };
    } catch (error) {
      return {
        success: false,
        details: this.normaliseError(error),
      };
    }
  }

  async loadPrgFile(path: string): Promise<RunBasicResult> {
    try {
      const response = await this.api.v1.runnersLoadPrgUpdate(":load_prg", { file: path });
      return { success: true, details: response.data };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async runPrgFile(path: string): Promise<RunBasicResult> {
    try {
      const response = await this.api.v1.runnersRunPrgUpdate(":run_prg", { file: path });
      return { success: true, details: response.data };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async runCrtFile(path: string): Promise<RunBasicResult> {
    try {
      const response = await this.api.v1.runnersRunCrtUpdate(":run_crt", { file: path });
      return { success: true, details: response.data };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async sidplayFile(path: string, songnr?: number): Promise<RunBasicResult> {
    try {
      const response = await this.api.v1.runnersSidplayUpdate(":sidplay", { file: path, songnr });
      return { success: true, details: response.data };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async modplayFile(path: string): Promise<RunBasicResult> {
    try {
      const response = await this.api.v1.runnersModplayUpdate(":modplay", { file: path });
      return { success: true, details: response.data };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async readScreen(): Promise<string> {
    const response = await this.api.v1.machineReadmemList(":readmem", {
      address: "0400",
      length: 0x1000,
    });

    const bytes = this.extractBytes(response.data?.data ?? response.data);
    return petsciiToAscii(bytes);
  }

  async reset(): Promise<{ success: boolean; details?: unknown }> {
    try {
      const response = await this.api.v1.machineResetUpdate(":reset");
      return {
        success: true,
        details: response.data,
      };
    } catch (error) {
      return {
        success: false,
        details: this.normaliseError(error),
      };
    }
  }

  async reboot(): Promise<{ success: boolean; details?: unknown }> {
    try {
      const response = await this.api.v1.machineRebootUpdate(":reboot");
      return {
        success: true,
        details: response.data,
      };
    } catch (error) {
      return {
        success: false,
        details: this.normaliseError(error),
      };
    }
  }

  async readMemory(addressInput: string, lengthInput: string): Promise<MemoryReadResult> {
    try {
      const resolved = resolveAddressSymbol(addressInput);
      const address = resolved ?? this.parseNumeric(addressInput);
      const length = this.parseNumeric(lengthInput);
      if (length <= 0) {
        throw new Error("Length must be greater than zero");
      }

      const response = await this.api.v1.machineReadmemList(":readmem", {
        address: this.formatAddress(address),
        length,
      });

      const rawBytes = this.extractBytes(response.data?.data ?? response.data);
      const bytes = rawBytes.slice(0, length);

      return {
        success: true,
        data: this.bytesToHex(bytes),
        details: {
          address: this.formatAddress(address),
          length,
        },
      };
    } catch (error) {
      return {
        success: false,
        details: this.normaliseError(error),
      };
    }
  }

  async writeMemory(addressInput: string, bytesInput: string): Promise<RunBasicResult> {
    try {
      const resolved = resolveAddressSymbol(addressInput);
      const address = resolved ?? this.parseNumeric(addressInput);
      const dataBuffer = this.hexStringToBuffer(bytesInput);
      if (dataBuffer.length === 0) {
        throw new Error("No bytes provided");
      }

      const response = await this.api.v1.machineWritememUpdate(":writemem", {
        address: this.formatAddress(address),
        data: this.bytesToHex(dataBuffer, false),
      });

      return {
        success: true,
        details: {
          address: this.formatAddress(address),
          bytes: this.bytesToHex(dataBuffer),
          response: response.data,
        },
      };
    } catch (error) {
      return {
        success: false,
        details: this.normaliseError(error),
      };
    }
  }

  // --- Additional API wrappers to cover full REST surface ---

  async version(): Promise<unknown> {
    const res = await this.api.v1.versionList();
    return res.data;
  }

  async info(): Promise<unknown> {
    const res = await this.api.v1.infoList();
    return res.data;
  }

  async pause(): Promise<RunBasicResult> {
    try {
      const res = await this.api.v1.machinePauseUpdate(":pause");
      return { success: true, details: res.data };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async resume(): Promise<RunBasicResult> {
    try {
      const res = await this.api.v1.machineResumeUpdate(":resume");
      return { success: true, details: res.data };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async poweroff(): Promise<RunBasicResult> {
    try {
      const res = await this.api.v1.machinePoweroffUpdate(":poweroff");
      return { success: true, details: res.data };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async menuButton(): Promise<RunBasicResult> {
    try {
      const res = await this.api.v1.machineMenuButtonUpdate(":menu_button");
      return { success: true, details: res.data };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async debugregRead(): Promise<{ success: boolean; value?: string; details?: unknown }> {
    try {
      const res = await this.api.v1.machineDebugregList(":debugreg");
      return { success: true, value: (res.data as any).value, details: res.data };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async debugregWrite(value: string): Promise<{ success: boolean; value?: string; details?: unknown }> {
    try {
      const res = await this.api.v1.machineDebugregUpdate(":debugreg", { value });
      return { success: true, value: (res.data as any).value, details: res.data };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async drivesList(): Promise<unknown> {
    const res = await this.api.v1.drivesList();
    return res.data;
  }

  async driveMount(
    drive: string,
    imagePath: string,
    options?: { type?: "d64" | "g64" | "d71" | "g71" | "d81"; mode?: "readwrite" | "readonly" | "unlinked" },
  ): Promise<RunBasicResult> {
    try {
      const res = await this.api.v1.drivesMountUpdate(drive, ":mount", { image: imagePath, type: options?.type, mode: options?.mode });
      return { success: true, details: res.data };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async driveRemove(drive: string): Promise<RunBasicResult> {
    try {
      const res = await this.api.v1.drivesRemoveUpdate(drive, ":remove");
      return { success: true, details: res.data };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async driveReset(drive: string): Promise<RunBasicResult> {
    try {
      const res = await this.api.v1.drivesResetUpdate(drive, ":reset");
      return { success: true, details: res.data };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async driveOn(drive: string): Promise<RunBasicResult> {
    try {
      const res = await this.api.v1.drivesOnUpdate(drive, ":on");
      return { success: true, details: res.data };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async driveOff(drive: string): Promise<RunBasicResult> {
    try {
      const res = await this.api.v1.drivesOffUpdate(drive, ":off");
      return { success: true, details: res.data };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async driveSetMode(drive: string, mode: "1541" | "1571" | "1581"): Promise<RunBasicResult> {
    try {
      const res = await this.api.v1.drivesSetModeUpdate(drive, ":set_mode", { mode });
      return { success: true, details: res.data };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async streamStart(stream: "video" | "audio" | "debug", ip: string): Promise<RunBasicResult> {
    try {
      const res = await this.api.v1.streamsStartUpdate(stream, ":start", { ip });
      return { success: true, details: res.data };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async streamStop(stream: "video" | "audio" | "debug"): Promise<RunBasicResult> {
    try {
      const res = await this.api.v1.streamsStopUpdate(stream, ":stop");
      return { success: true, details: res.data };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async configsList(): Promise<unknown> {
    const res = await this.api.v1.configsList();
    return res.data;
  }

  async configGet(category: string, item?: string): Promise<unknown> {
    const res = item ? await this.api.v1.configsDetail2(category, item) : await this.api.v1.configsDetail(category);
    return res.data;
  }

  async configSet(category: string, item: string, value: string): Promise<RunBasicResult> {
    try {
      const res = await this.api.v1.configsUpdate(category, item, { value });
      return { success: true, details: res.data };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async configBatchUpdate(payload: Record<string, object>): Promise<RunBasicResult> {
    try {
      const res = await this.api.v1.configsCreate(payload);
      return { success: true, details: res.data };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async configLoadFromFlash(): Promise<RunBasicResult> {
    try {
      const res = await this.api.v1.configsLoadFromFlashUpdate(":load_from_flash");
      return { success: true, details: res.data };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async configSaveToFlash(): Promise<RunBasicResult> {
    try {
      const res = await this.api.v1.configsSaveToFlashUpdate(":save_to_flash");
      return { success: true, details: res.data };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async configResetToDefault(): Promise<RunBasicResult> {
    try {
      const res = await this.api.v1.configsResetToDefaultUpdate(":reset_to_default");
      return { success: true, details: res.data };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async filesInfo(path: string): Promise<unknown> {
    const res = await this.api.v1.filesInfoDetail(encodeURIComponent(path), ":info");
    return res.data;
  }

  async filesCreateD64(path: string, options?: { tracks?: 35 | 40; diskname?: string }): Promise<RunBasicResult> {
    try {
      const res = await this.api.v1.filesCreateD64Update(encodeURIComponent(path), ":create_d64", { tracks: options?.tracks, diskname: options?.diskname });
      return { success: true, details: res.data };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async filesCreateD71(path: string, options?: { diskname?: string }): Promise<RunBasicResult> {
    try {
      const res = await this.api.v1.filesCreateD71Update(encodeURIComponent(path), ":create_d71", { diskname: options?.diskname });
      return { success: true, details: res.data };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async filesCreateD81(path: string, options?: { diskname?: string }): Promise<RunBasicResult> {
    try {
      const res = await this.api.v1.filesCreateD81Update(encodeURIComponent(path), ":create_d81", { diskname: options?.diskname });
      return { success: true, details: res.data };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async filesCreateDnp(path: string, tracks: number, options?: { diskname?: string }): Promise<RunBasicResult> {
    try {
      const res = await this.api.v1.filesCreateDnpUpdate(encodeURIComponent(path), ":create_dnp", { tracks, diskname: options?.diskname });
      return { success: true, details: res.data };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  private extractBytes(data: unknown): Uint8Array {
    if (!data) {
      return new Uint8Array();
    }

    if (typeof data === "string") {
      try {
        return Uint8Array.from(Buffer.from(data, "base64"));
      } catch {
        return Uint8Array.from(Buffer.from(data, "hex"));
      }
    }

    if (Array.isArray((data as { data?: unknown }).data)) {
      return Uint8Array.from(((data as { data?: number[] }).data) ?? []);
    }

    if (Array.isArray(data)) {
      return Uint8Array.from(data as number[]);
    }

    if (typeof data === "object" && data !== null) {
      const maybe = (data as Record<string, unknown>).data;
      if (typeof maybe === "string") {
        return Uint8Array.from(Buffer.from(maybe, "base64"));
      }
      if (Array.isArray(maybe)) {
        return Uint8Array.from(maybe as number[]);
      }
    }

    return new Uint8Array();
  }

  private normaliseError(error: unknown): unknown {
    if (axios.isAxiosError(error)) {
      return {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      };
    }

    if (error instanceof Error) {
      return { message: error.message };
    }

    return error;
  }

  private parseNumeric(value: string): number {
    if (typeof value !== "string") {
      throw new Error("Expected string input");
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new Error("Empty numeric value");
    }

    const lower = trimmed.toLowerCase();
    let radix = 10;
    let literal = lower;

    if (lower.startsWith("$")) {
      radix = 16;
      literal = lower.slice(1);
    } else if (lower.startsWith("0x")) {
      radix = 16;
      literal = lower.slice(2);
    } else if (lower.startsWith("%")) {
      radix = 2;
      literal = lower.slice(1);
    }

    const parsed = Number.parseInt(literal, radix);
    if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 0) {
      throw new Error(`Unable to parse numeric value "${value}"`);
    }

    return parsed;
  }

  private formatAddress(address: number): string {
    if (!Number.isInteger(address) || address < 0 || address > 0xffff) {
      throw new Error("Address must be within 0x0000 - 0xFFFF");
    }
    return address.toString(16).toUpperCase().padStart(4, "0");
  }

  private bytesToHex(bytes: Uint8Array | Buffer, withPrefix = true): string {
    const hex = Buffer.from(bytes).toString("hex").toUpperCase();
    return withPrefix ? `$${hex}` : hex;
  }

  private hexStringToBuffer(input: string): Buffer {
    if (typeof input !== "string") {
      throw new Error("Expected byte string");
    }
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      throw new Error("Expected non-empty byte string");
    }

    const withoutPrefix = trimmed.startsWith("$") ? trimmed.slice(1) : trimmed;
    const cleaned = withoutPrefix.replace(/[\s_]/g, "").toLowerCase();

    if (cleaned.length === 0) {
      throw new Error("No hexadecimal data provided");
    }
    if (cleaned.length % 2 !== 0) {
      throw new Error("Hex string must contain an even number of characters");
    }

    return Buffer.from(cleaned, "hex");
  }
}
