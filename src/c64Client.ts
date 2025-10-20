import { Buffer } from "node:buffer";
import axios, { AxiosInstance } from "axios";
import { basicToPrg } from "./basicConverter.js";
import { petsciiToAscii } from "./petscii.js";

export interface RunBasicResult {
  success: boolean;
  details?: unknown;
}

export class C64Client {
  private readonly http: AxiosInstance;

  constructor(baseUrl: string) {
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: 10_000,
    });
  }

  async uploadAndRunBasic(program: string): Promise<RunBasicResult> {
    try {
      const prg = basicToPrg(program);
      const response = await this.http.post("/v1/runners:run_prg", prg, {
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
    const response = await this.http.get("/v1/machine:readmem", {
      params: {
        address: "0400",
        length: "1000",
      },
    });

    const bytes = this.extractBytes(response.data);
    return petsciiToAscii(bytes);
  }

  async reset(): Promise<{ success: boolean; details?: unknown }> {
    try {
      const response = await this.http.put("/v1/machine:reset");
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
}
