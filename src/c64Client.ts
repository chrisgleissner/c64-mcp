import { Buffer } from "node:buffer";
import axios from "axios";
import { basicToPrg } from "./basicConverter.js";
import { petsciiToAscii } from "./petscii.js";
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
      const address = this.parseNumeric(addressInput);
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
      const address = this.parseNumeric(addressInput);
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
