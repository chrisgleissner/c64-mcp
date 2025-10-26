/*
C64 MCP - An MCP Server for the Commodore 64 Ultimate
Copyright (C) 2025 Christian Gleissner

Licensed under the GNU General Public License v2.0 or later.
See <https://www.gnu.org/licenses/> for details.
*/

import { Buffer } from "node:buffer";
import axios from "axios";
import { basicToPrg } from "./basicConverter.js";
import { assemblyToPrg } from "./assemblyConverter.js";
import { petsciiToAscii } from "./petscii.js";
import { resolveAddressSymbol } from "./knowledge.js";
import { C64Facade, createFacade } from "./device.js";
import { Api, HttpClient } from "../generated/c64/index.js";
import { createLoggingHttpClient } from "./loggingHttpClient.js";

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
  private readonly facadePromise: Promise<C64Facade>;

  constructor(baseUrl: string) {
    this.http = createLoggingHttpClient({ baseURL: baseUrl, timeout: 10_000 });
    this.api = new Api(this.http);
    // Select backend once lazily; keep REST for hardware-specific fallbacks
    this.facadePromise = createFacade(undefined, { preferredC64uBaseUrl: baseUrl }).then((sel) => sel.facade);
  }

  /**
   * Generate a BASIC program that opens the printer (device 4), prints the provided text,
   * and closes the channel. Assumes Commodore MPS (PETSCII) by default.
   */
  async printTextOnPrinterAndRun(options: {
    text: string;
    target?: "commodore" | "epson"; // default: commodore
    secondaryAddress?: 0 | 7; // MPS only; 0 = upper/graphics, 7 = lower/upper
    formFeed?: boolean; // if true, send FF (CHR$(12)) at end
  }): Promise<RunBasicResult> {
    const program = buildPrinterBasicProgram(options);
    return this.uploadAndRunBasic(program);
  }

  /**
   * Generate and run a Commodore MPS Bit Image Mode (BIM) program for one bitmap row,
   * optionally repeated.
   */
  async printBitmapOnCommodoreAndRun(options: {
    columns: number[];
    repeats?: number;
    useSubRepeat?: number; // if provided, uses BIM SUB to repeat next byte
    secondaryAddress?: 0 | 7;
    ensureMsb?: boolean; // default true (set bit7)
  }): Promise<RunBasicResult> {
    const program = buildCommodoreBitmapBasicProgram(options);
    return this.uploadAndRunBasic(program);
  }

  /**
   * Generate and run an Epson FX ESC/P bitmap program for one row (repeated lines).
   */
  async printBitmapOnEpsonAndRun(options: {
    columns: number[];
    mode?: "K" | "L" | "Y" | "Z" | "*";
    density?: number; // used with '*'
    repeats?: number;
    timesPerLine?: number;
  }): Promise<RunBasicResult> {
    const program = buildEpsonBitmapBasicProgram(options);
    return this.uploadAndRunBasic(program);
  }

  /**
   * Generate and run a Commodore MPS DLL (custom characters) program. On emulator this
   * is ignored but we still verify generation and transmission.
   */
  async defineCustomCharsOnCommodoreAndRun(options: {
    firstChar: number; // 33..126
    chars: Array<{ a?: 0 | 1; columns: number[] }>; // 11 columns per char
    secondaryAddress?: 0 | 7;
  }): Promise<RunBasicResult> {
    const program = buildCommodoreDllBasicProgram(options);
    return this.uploadAndRunBasic(program);
  }

  async uploadAndRunBasic(program: string): Promise<RunBasicResult> {
    const prg = basicToPrg(program);
    return this.runPrg(prg);
  }

  /**
   * Build a simple sprite PRG from raw 63-byte sprite data and position/color attributes.
   * Returns the REST result after uploading and running the generated PRG.
   */
  async generateAndRunSpritePrg(options: {
    spriteBytes: Uint8Array | Buffer;
    spriteIndex?: number;
    x?: number;
    y?: number;
    color?: number;
    multicolour?: boolean;
  }): Promise<RunBasicResult> {
    const prg = buildSingleSpriteProgram(options);
    return this.runPrg(prg);
  }

  /**
   * Build a BASIC program that draws a PETSCII screen (optionally set border/bg colours),
   * then upload and run it.
   */
  async renderPetsciiScreenAndRun(options: {
    text: string;
    borderColor?: number;
    backgroundColor?: number;
  }): Promise<RunBasicResult> {
    const program = buildPetsciiScreenBasic(options);
    return this.uploadAndRunBasic(program);
  }

  async uploadAndRunAsm(program: string): Promise<RunBasicResult> {
    const prg = assemblyToPrg(program);
    return this.runPrg(prg);
  }

  async runPrg(prg: Uint8Array | Buffer): Promise<RunBasicResult> {
    try {
      if (process.env.C64_TEST_TARGET === "mock") {
        const payload = Buffer.isBuffer(prg) ? prg : Buffer.from(prg);
        const response = await this.api.v1.runnersRunPrgCreate(":run_prg", payload as any, {
          headers: { "Content-Type": "application/octet-stream" },
        });
        return { success: true, details: response.data };
      }
      const facade = await this.facadePromise;
      const res = await facade.runPrg(prg);
      return { success: res.success, details: res.details };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  /** Upload a SID binary and instruct firmware to play it (attachment mode). */
  async sidplayAttachment(sid: Uint8Array | Buffer, options?: { songnr?: number; songlengths?: Uint8Array | Buffer }): Promise<RunBasicResult> {
    try {
      const facade = await this.facadePromise;
      const res = await facade.sidplayAttachment(sid, options);
      return { success: res.success, details: res.details };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async loadPrgFile(path: string): Promise<RunBasicResult> {
    try {
      const facade = await this.facadePromise;
      const res = await facade.loadPrgFile(path);
      return { success: res.success, details: res.details };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async runPrgFile(path: string): Promise<RunBasicResult> {
    try {
      const facade = await this.facadePromise;
      const res = await facade.runPrgFile(path);
      return { success: res.success, details: res.details };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async runCrtFile(path: string): Promise<RunBasicResult> {
    try {
      const facade = await this.facadePromise;
      const res = await facade.runCrtFile(path);
      return { success: res.success, details: res.details };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async sidplayFile(path: string, songnr?: number): Promise<RunBasicResult> {
    try {
      const facade = await this.facadePromise;
      const res = await facade.sidplayFile(path, songnr);
      return { success: res.success, details: res.details };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async modplayFile(path: string): Promise<RunBasicResult> {
    try {
      const facade = await this.facadePromise;
      if (!facade.modplayFile) throw new Error("modplay not supported by selected backend");
      const res = await facade.modplayFile(path);
      return { success: res.success, details: res.details };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async readScreen(): Promise<string> {
    // Exposed as MCP tool: read_screen
    const bytes = await this.readMemoryRaw(0x0400, 0x1000);
    return petsciiToAscii(bytes);
  }

  async reset(): Promise<{ success: boolean; details?: unknown }> {
    try {
      if (process.env.C64_TEST_TARGET === "mock") {
        const response = await this.api.v1.machineResetUpdate(":reset");
        return { success: true, details: response.data };
      }
      const facade = await this.facadePromise;
      const res = await facade.reset();
      return { success: res.success, details: res.details };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async reboot(): Promise<{ success: boolean; details?: unknown }> {
    try {
      if (process.env.C64_TEST_TARGET === "mock") {
        const response = await this.api.v1.machineRebootUpdate(":reboot");
        return { success: true, details: response.data };
      }
      const facade = await this.facadePromise;
      const res = await facade.reboot();
      return { success: res.success, details: res.details };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
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

      const rawBytes = await this.readMemoryRaw(address, length);
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

      // Prefer PUT with hex data for up to 128 bytes; fall back to POST binary for larger writes
      const addrStr = this.formatAddress(address);
      try {
        const facade = await this.facadePromise;
        await facade.writeMemory(address, dataBuffer);
        return {
          success: true,
          details: {
            address: addrStr,
            bytes: this.bytesToHex(dataBuffer),
          },
        };
      } catch (facadeError) {
        if (!(facadeError instanceof Error) || (facadeError as any).code !== "UNSUPPORTED") {
          throw facadeError;
        }
      }

      let response: unknown;
      if (dataBuffer.length <= 128) {
        const put = await this.api.v1.machineWritememUpdate(":writemem", {
          address: addrStr,
          data: this.bytesToHex(dataBuffer, false),
        });
        response = put.data;
      } else {
        const post = await this.api.v1.machineWritememCreate(
          ":writemem",
          { address: addrStr },
          Buffer.from(dataBuffer) as unknown as File,
          { headers: { "Content-Type": "application/octet-stream" } },
        );
        response = post.data;
      }

      return {
        success: true,
        details: {
          address: addrStr,
          bytes: this.bytesToHex(dataBuffer),
          response,
        },
      };
    } catch (error) {
      return {
        success: false,
        details: this.normaliseError(error),
      };
    }
  }

  // --- SID/Music helpers ---

  async sidSetVolume(volume: number): Promise<RunBasicResult> {
    const clamped = Math.max(0, Math.min(15, Math.floor(volume)));
    const byte = Buffer.from([clamped]);
    return this.writeMemory("$D418", this.bytesToHex(byte));
  }

  async sidReset(hard = false): Promise<RunBasicResult> {
    try {
      const facade = await this.facadePromise;
      if (hard) {
        const span = 0x19;
        const ff = Buffer.alloc(span, 0xff);
        const zz = Buffer.alloc(span, 0x00);
        await facade.writeMemory(0xd400, ff);
        await facade.writeMemory(0xd400, zz);
        return { success: true };
      }
      await facade.writeMemory(0xd404, Buffer.from([0x00]));
      await facade.writeMemory(0xd40b, Buffer.from([0x00]));
      await facade.writeMemory(0xd412, Buffer.from([0x00]));
      await facade.writeMemory(0xd418, Buffer.from([0x00]));
      return { success: true };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async sidNoteOn(options: {
    voice?: 1 | 2 | 3;
    note?: string; // e.g. "A4", "C#5", "Bb3"
    frequencyHz?: number;
    system?: "PAL" | "NTSC";
    waveform?: "pulse" | "saw" | "tri" | "noise";
    pulseWidth?: number; // 0..4095 (12-bit)
    attack?: number; // 0..15
    decay?: number; // 0..15
    sustain?: number; // 0..15
    release?: number; // 0..15
  }): Promise<RunBasicResult> {
    const voice = options.voice ?? 1;
    if (voice < 1 || voice > 3) {
      return { success: false, details: { message: "Voice must be 1..3" } };
    }
    const system = options.system ?? "PAL";
    const hz = options.frequencyHz ?? (options.note ? this.noteNameToHz(options.note) : 440);
    const freq16 = this.hzToSidFrequency(hz, system);
    const freqLo = freq16 & 0xff;
    const freqHi = (freq16 >> 8) & 0xff;

    const pulseWidth = Math.max(0, Math.min(0x0fff, Math.floor(options.pulseWidth ?? 0x0800)));
    const pwLo = pulseWidth & 0xff;
    const pwHi = (pulseWidth >> 8) & 0x0f; // upper 4 bits used

    const waveform = options.waveform ?? "pulse";
    let ctrl = 0x00;
    if (waveform === "tri") ctrl |= 1 << 4;
    else if (waveform === "saw") ctrl |= 1 << 5;
    else if (waveform === "pulse") ctrl |= 1 << 6;
    else if (waveform === "noise") ctrl |= 1 << 7;
    ctrl |= 1 << 0; // GATE on

    const attack = Math.max(0, Math.min(15, Math.floor(options.attack ?? 0x1)));
    const decay = Math.max(0, Math.min(15, Math.floor(options.decay ?? 0x1)));
    const sustain = Math.max(0, Math.min(15, Math.floor(options.sustain ?? 0xf)));
    const release = Math.max(0, Math.min(15, Math.floor(options.release ?? 0x3)));
    const ad = (attack << 4) | decay;
    const sr = (sustain << 4) | release;

    const base = 0xd400 + (voice - 1) * 7;
    const bytes = Buffer.from([freqLo, freqHi, pwLo, pwHi, ctrl, ad, sr]);
    try {
      const facade = await this.facadePromise;
      await facade.writeMemory(base, bytes);
      return { success: true };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async sidNoteOff(voice: 1 | 2 | 3): Promise<RunBasicResult> {
    if (voice < 1 || voice > 3) {
      return { success: false, details: { message: "Voice must be 1..3" } };
    }
    const ctrlAddr = 0xd400 + (voice - 1) * 7 + 4;
    try {
      const facade = await this.facadePromise;
      await facade.writeMemory(ctrlAddr, Buffer.from([0x00]));
      return { success: true };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async sidSilenceAll(): Promise<RunBasicResult> {
    return this.sidReset(false);
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
      if (process.env.C64_TEST_TARGET === "mock") {
        const res = await this.api.v1.machinePauseUpdate(":pause");
        return { success: true, details: res.data };
      }
      const facade = await this.facadePromise;
      return await facade.pause();
    } catch (error) { return { success: false, details: this.normaliseError(error) }; }
  }

  async resume(): Promise<RunBasicResult> {
    try {
      if (process.env.C64_TEST_TARGET === "mock") {
        const res = await this.api.v1.machineResumeUpdate(":resume");
        return { success: true, details: res.data };
      }
      const facade = await this.facadePromise; return await facade.resume();
    } catch (error) { return { success: false, details: this.normaliseError(error) }; }
  }

  async poweroff(): Promise<RunBasicResult> {
    try { const facade = await this.facadePromise; return await facade.poweroff(); } catch (error) { return { success: false, details: this.normaliseError(error) }; }
  }

  async menuButton(): Promise<RunBasicResult> {
    try {
      if (process.env.C64_TEST_TARGET === "mock") {
        const res = await this.api.v1.machineMenuButtonUpdate(":menu_button");
        return { success: true, details: res.data };
      }
      const facade = await this.facadePromise; return await facade.menuButton();
    } catch (error) { return { success: false, details: this.normaliseError(error) }; }
  }

  async debugregRead(): Promise<{ success: boolean; value?: string; details?: unknown }> {
    try {
      if (process.env.C64_TEST_TARGET === "mock") {
        const res = await this.api.v1.machineDebugregList(":debugreg");
        return { success: true, value: (res.data as any).value, details: res.data };
      }
      const facade = await this.facadePromise; return await facade.debugregRead();
    } catch (error) { return { success: false, details: this.normaliseError(error) } as any; }
  }

  async debugregWrite(value: string): Promise<{ success: boolean; value?: string; details?: unknown }> {
    try {
      if (process.env.C64_TEST_TARGET === "mock") {
        const res = await this.api.v1.machineDebugregUpdate(":debugreg", { value });
        return { success: true, value: (res.data as any).value, details: res.data };
      }
      const facade = await this.facadePromise; return await facade.debugregWrite(value);
    } catch (error) { return { success: false, details: this.normaliseError(error) } as any; }
  }

  async drivesList(): Promise<unknown> {
    const facade = await this.facadePromise; return facade.drivesList();
  }

  async driveMount(
    drive: string,
    imagePath: string,
    options?: { type?: "d64" | "g64" | "d71" | "g71" | "d81"; mode?: "readwrite" | "readonly" | "unlinked" },
  ): Promise<RunBasicResult> {
    try { const facade = await this.facadePromise; return await facade.driveMount(drive, imagePath, options); } catch (error) { return { success: false, details: this.normaliseError(error) }; }
  }

  async driveRemove(drive: string): Promise<RunBasicResult> {
    try { const facade = await this.facadePromise; return await facade.driveRemove(drive); } catch (error) { return { success: false, details: this.normaliseError(error) }; }
  }

  async driveReset(drive: string): Promise<RunBasicResult> {
    try { const facade = await this.facadePromise; return await facade.driveReset(drive); } catch (error) { return { success: false, details: this.normaliseError(error) }; }
  }

  async driveOn(drive: string): Promise<RunBasicResult> {
    try { const facade = await this.facadePromise; return await facade.driveOn(drive); } catch (error) { return { success: false, details: this.normaliseError(error) }; }
  }

  async driveOff(drive: string): Promise<RunBasicResult> {
    try { const facade = await this.facadePromise; return await facade.driveOff(drive); } catch (error) { return { success: false, details: this.normaliseError(error) }; }
  }

  async driveLoadRom(drive: string, path: string): Promise<RunBasicResult> {
    try {
      if (!drive || !path) throw new Error("Drive and path are required");
      if (process.env.C64_TEST_TARGET === "mock") {
        const res = await this.api.v1.drivesLoadRomUpdate(drive, ":load_rom", { file: path });
        return { success: true, details: res.data };
      }
      const facade = await this.facadePromise;
      const result = await facade.driveLoadRom(drive, path);
      return { success: result.success, details: result.details };
    } catch (error) {
      return { success: false, details: this.normaliseError(error) };
    }
  }

  async driveSetMode(drive: string, mode: "1541" | "1571" | "1581"): Promise<RunBasicResult> {
    try { const facade = await this.facadePromise; return await facade.driveSetMode(drive, mode); } catch (error) { return { success: false, details: this.normaliseError(error) }; }
  }

  async streamStart(stream: "video" | "audio" | "debug", ip: string): Promise<RunBasicResult> {
    try { const facade = await this.facadePromise; return await facade.streamStart(stream, ip); } catch (error) { return { success: false, details: this.normaliseError(error) }; }
  }

  async streamStop(stream: "video" | "audio" | "debug"): Promise<RunBasicResult> {
    try { const facade = await this.facadePromise; return await facade.streamStop(stream); } catch (error) { return { success: false, details: this.normaliseError(error) }; }
  }

  async configsList(): Promise<unknown> {
    const facade = await this.facadePromise; return facade.configsList();
  }

  async configGet(category: string, item?: string): Promise<unknown> {
    const facade = await this.facadePromise; return facade.configGet(category, item);
  }

  async configSet(category: string, item: string, value: string): Promise<RunBasicResult> {
    try { const facade = await this.facadePromise; return await facade.configSet(category, item, value); } catch (error) { return { success: false, details: this.normaliseError(error) }; }
  }

  async configBatchUpdate(payload: Record<string, object>): Promise<RunBasicResult> {
    try { const facade = await this.facadePromise; return await facade.configBatchUpdate(payload); } catch (error) { return { success: false, details: this.normaliseError(error) }; }
  }

  async configLoadFromFlash(): Promise<RunBasicResult> {
    try { const facade = await this.facadePromise; return await facade.configLoadFromFlash(); } catch (error) { return { success: false, details: this.normaliseError(error) }; }
  }

  async configSaveToFlash(): Promise<RunBasicResult> {
    try { const facade = await this.facadePromise; return await facade.configSaveToFlash(); } catch (error) { return { success: false, details: this.normaliseError(error) }; }
  }

  async configResetToDefault(): Promise<RunBasicResult> {
    try { const facade = await this.facadePromise; return await facade.configResetToDefault(); } catch (error) { return { success: false, details: this.normaliseError(error) }; }
  }

  async filesInfo(path: string): Promise<unknown> {
    const facade = await this.facadePromise; return facade.filesInfo(path);
  }

  async filesCreateD64(path: string, options?: { tracks?: 35 | 40; diskname?: string }): Promise<RunBasicResult> {
    try { const facade = await this.facadePromise; return await facade.filesCreateD64(path, options); } catch (error) { return { success: false, details: this.normaliseError(error) }; }
  }

  async filesCreateD71(path: string, options?: { diskname?: string }): Promise<RunBasicResult> {
    try { const facade = await this.facadePromise; return await facade.filesCreateD71(path, options); } catch (error) { return { success: false, details: this.normaliseError(error) }; }
  }

  async filesCreateD81(path: string, options?: { diskname?: string }): Promise<RunBasicResult> {
    try { const facade = await this.facadePromise; return await facade.filesCreateD81(path, options); } catch (error) { return { success: false, details: this.normaliseError(error) }; }
  }

  async filesCreateDnp(path: string, tracks: number, options?: { diskname?: string }): Promise<RunBasicResult> {
    try { const facade = await this.facadePromise; return await facade.filesCreateDnp(path, tracks, options); } catch (error) { return { success: false, details: this.normaliseError(error) }; }
  }

  private extractBytes(data: unknown): Uint8Array {
    if (!data) {
      return new Uint8Array();
    }

    // Raw binary (ArrayBuffer) response
    if (data instanceof ArrayBuffer) {
      return new Uint8Array(data);
    }

    // Node.js Buffer
    if (Buffer.isBuffer(data)) {
      return new Uint8Array(data);
    }

    // Already a Uint8Array
    if (data instanceof Uint8Array) {
      return data;
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

  /**
   * Low-level memory read that transparently handles devices returning either
   * raw binary bytes or JSON with a base64 payload.
   */
  private async readMemoryRaw(address: number, length: number): Promise<Uint8Array> {
    try {
      const facade = await this.facadePromise;
      return await facade.readMemory(address, length);
    } catch (facadeError) {
      if (!(facadeError instanceof Error) || (facadeError as any).code !== "UNSUPPORTED") {
        throw facadeError;
      }
    }

    const addrStr = this.formatAddress(address);
    const response = await this.api.v1.machineReadmemList(
      ":readmem",
      { address: addrStr, length },
      { format: "arraybuffer", headers: { Accept: "application/octet-stream, application/json" } as any },
    );
    const contentType = (response.headers?.["content-type"] ?? "").toString().toLowerCase();
    const body = response.data as unknown;
    if (contentType.includes("application/json")) {
      const text = Buffer.from(body as ArrayBuffer).toString("utf8");
      try {
        const parsed = JSON.parse(text);
        return this.extractBytes(parsed?.data ?? parsed);
      } catch {
        return this.extractBytes(text);
      }
    }
    return body instanceof ArrayBuffer ? new Uint8Array(body) : this.extractBytes(body);
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

  private hzToSidFrequency(hz: number, system: "PAL" | "NTSC" = "PAL"): number {
    const phi2 = system === "PAL" ? 985_248 : 1_022_727;
    const value = Math.round((hz * 65536) / phi2);
    // Clamp to 16-bit
    return Math.max(0, Math.min(0xffff, value));
  }

  private noteNameToHz(note: string): number {
    // Parse note like C#4, Db3, A4
    const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(note.trim());
    if (!m) return 440; // default A4
    const letter = m[1].toUpperCase();
    const accidental = m[2];
    const octave = Number(m[3]);
    const semitoneMap: Record<string, number> = {
      C: 0,
      D: 2,
      E: 4,
      F: 5,
      G: 7,
      A: 9,
      B: 11,
    };
    let semitone = semitoneMap[letter] ?? 9;
    if (accidental === "#") semitone += 1;
    if (accidental === "b") semitone -= 1;
    const midi = (octave + 1) * 12 + semitone; // MIDI note number (C-1 => 0)
    const hz = 440 * Math.pow(2, (midi - 69) / 12);
    return hz;
  }
}

// --- Helpers to synthesize tiny programs for sprites and PETSCII screens ---

function toByte(value: number | undefined, fallback = 0): number {
  const v = value ?? fallback;
  return Math.max(0, Math.min(255, v)) & 0xff;
}

function buildSingleSpriteProgram(opts: {
  spriteBytes: Uint8Array | Buffer;
  spriteIndex?: number;
  x?: number;
  y?: number;
  color?: number;
  multicolour?: boolean;
}): Buffer {
  const index = Math.max(0, Math.min(7, opts.spriteIndex ?? 0));
  const mx = Math.max(0, Math.min(511, opts.x ?? 100));
  const xLo = mx & 0xff;
  const xMsbBit = (mx & 0x100) ? (1 << index) : 0;
  const y = toByte(opts.y, 100);
  const color = toByte(opts.color, 1);
  const multicolour = !!opts.multicolour;

  const spriteData = Buffer.from(opts.spriteBytes);
  if (spriteData.length !== 63) {
    throw new Error("spriteBytes must be exactly 63 bytes");
  }

  // We'll assemble a tiny machine-code program that:
  // - Copies 63 bytes to a safe sprite data page ($2000 by default)
  // - Sets screen memory base to $0400, sprite pointer to point into $2000
  // - Positions and enables the sprite
  // - Loops forever
  // This avoids relying on KERNAL calls and works from a cold start.

  const SPRITE_BASE = 0x2000; // must be 64-byte aligned
  const POINTER_PAGE = 0x07f8 + index; // sprite pointer table location
  const pointerValue = (SPRITE_BASE >> 6) & 0xff;

  // Place code starting at $0801 so it runs as a program via SYS.
  // We'll create an assembler source and reuse assemblyToPrg.
  const lines: string[] = [];
  lines.push("* = $0801");
  // Tiny BASIC loader header not needed; we will use pure ML and jump via RESET runner which executes by SYS 2061
  // Build code at $0810 to avoid conflicting with potential KERNAL vectors
  lines.push("* = $0810");
  lines.push("\nstart:");
  // Copy 63 bytes from inlined table to SPRITE_BASE
  lines.push("  LDY #$00");
  lines.push("copy_loop:");
  lines.push("  LDA sprite_data,Y");
  lines.push(`  STA $${hex16(SPRITE_BASE)},Y`);
  lines.push("  INY");
  lines.push("  CPY #$3F");
  lines.push("  BNE copy_loop");
  // Set sprite pointer, color, coordinates, enable
  lines.push(`  LDA #$${pointerValue.toString(16).toUpperCase().padStart(2, "0")}`);
  lines.push(`  STA $${(POINTER_PAGE).toString(16).toUpperCase()}`);
  lines.push(`  LDA #$${color.toString(16).toUpperCase().padStart(2, "0")}`);
  lines.push(`  STA $${hex16(0xD027 + index)}`);
  lines.push(`  LDA #$${xLo.toString(16).toUpperCase().padStart(2, "0")}`);
  lines.push(`  STA $${(0xD000 + index * 2).toString(16).toUpperCase()}`);
  lines.push(`  LDA #$${y.toString(16).toUpperCase().padStart(2, "0")}`);
  lines.push(`  STA $${(0xD001 + index * 2).toString(16).toUpperCase()}`);
  // MSB X if needed
  if (xMsbBit) {
    const bit = xMsbBit;
    lines.push(`  LDA $D010`);
    lines.push(`  ORA #$${bit.toString(16).toUpperCase().padStart(2, "0")}`);
    lines.push(`  STA $D010`);
  }
  // Multicolour toggle per-sprite
  if (multicolour) {
    const bit = 1 << index;
    lines.push(`  LDA $D01C`);
    lines.push(`  ORA #$${bit.toString(16).toUpperCase().padStart(2, "0")}`);
    lines.push(`  STA $D01C`);
  }
  // Enable sprite
  {
    const bit = 1 << index;
    lines.push(`  LDA $D015`);
    lines.push(`  ORA #$${bit.toString(16).toUpperCase().padStart(2, "0")}`);
    lines.push(`  STA $D015`);
  }
  // Idle loop
  lines.push("forever: JMP forever");
  // Sprite data table
  lines.push("\nsprite_data:");
  for (let i = 0; i < 63; i += 3) {
    const a = spriteData[i] ?? 0;
    const b = spriteData[i + 1] ?? 0;
    const c = spriteData[i + 2] ?? 0;
    lines.push(`  .byte $${hex2(a)},$${hex2(b)},$${hex2(c)}`);
  }

  const source = lines.join("\n");
  return assemblyToPrg(source, { fileName: "sprite_gen.asm", loadAddress: 0x0801 });
}

function buildPetsciiScreenBasic(opts: { text: string; borderColor?: number; backgroundColor?: number }): string {
  const border = toByte(opts.borderColor ?? 6); // default blue-ish
  const bg = toByte(opts.backgroundColor ?? 0); // default black
  // Clear screen, set colours, print text starting at 1,1
  // Note: CHR$(147) clears the screen.
  const sanitized = opts.text.replace(/\r\n?|\n/g, "\\n");
  const program = [
    `10 POKE 53280,${border}:POKE 53281,${bg}:PRINT CHR$(147)`,
    `20 PRINT "${sanitized}"`,
    `30 GETA$:IFA$<>""THENEND:REM wait for key then end`,
  ].join("\n");
  return program;
}

export function buildPrinterBasicProgram(opts: {
  text: string;
  target?: "commodore" | "epson";
  secondaryAddress?: 0 | 7;
  formFeed?: boolean;
}): string {
  const target = opts.target ?? "commodore";
  const saddr = typeof opts.secondaryAddress === "number" ? opts.secondaryAddress : undefined;
  const lines: string[] = [];

  // OPEN printer device (#1 to device 4 with optional secondary address)
  if (saddr === 0 || saddr === 7) {
    lines.push(`10 OPEN1,4,${saddr}`);
  } else {
    lines.push("10 OPEN1,4");
  }

  // Prepare text: split by CR/LF and emit PRINT# statements.
  // We chunk long logical lines to avoid very long BASIC lines; join chunks with ';' to avoid extra CRs.
  const raw = opts.text ?? "";
  const logicalLines = raw.split(/\r\n|\r|\n/);

  let ln = 20;
  for (const logical of logicalLines) {
    if (logical.length === 0) {
      lines.push(`${ln} PRINT#1`);
      ln += 10;
      continue;
    }
    const chunks = chunkString(logical, 60);
    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = escapeBasicQuotes(chunks[i]);
      const tail = i < chunks.length - 1 ? ";" : ""; // avoid CR between chunks within the same logical line
      lines.push(`${ln} PRINT#1,"${chunk}"${tail}`);
      ln += 10;
    }
  }

  if (opts.formFeed) {
    lines.push(`${ln} PRINT#1,CHR$(12)`);
    ln += 10;
  }

  // Minimal target-specific toggles could be inserted here in future
  // (e.g., ESC/P mode selections for Epson). Default is raw text output.

  lines.push(`${ln} CLOSE1`);
  return lines.join("\n");
}

function chunkString(input: string, maxLen: number): string[] {
  if (input.length <= maxLen) return [input];
  const parts: string[] = [];
  let i = 0;
  while (i < input.length) {
    parts.push(input.slice(i, i + maxLen));
    i += maxLen;
  }
  return parts;
}

function escapeBasicQuotes(input: string): string {
  // In Commodore BASIC, embed a double quote by doubling it
  return input.replace(/"/g, '""');
}

export function buildCommodoreBitmapBasicProgram(opts: {
  columns: number[];
  repeats?: number;
  useSubRepeat?: number;
  secondaryAddress?: 0 | 7;
  ensureMsb?: boolean;
}): string {
  const repeats = Math.max(1, Math.floor(opts.repeats ?? 1));
  const saddr = typeof opts.secondaryAddress === "number" ? opts.secondaryAddress : 7;
  const ensureMsb = opts.ensureMsb !== false;
  const cols = (opts.columns ?? []).map((v) => {
    const n = Math.max(0, Math.min(255, Math.floor(v)));
    return ensureMsb ? (n | 0x80) : n;
  });
  const lines: string[] = [];
  lines.push(`10 OPEN1,4,${saddr}`);
  lines.push(`20 A$=""`);
  lines.push(`30 FOR I=1 TO ${cols.length}`);
  lines.push(`40 READ A:A$=A$+CHR$(A)`);
  lines.push(`50 NEXT I`);
  lines.push(`60 FOR J=1 TO ${repeats}`);
  if (typeof opts.useSubRepeat === "number") {
    const r = Math.max(0, Math.min(255, Math.floor(opts.useSubRepeat)));
    lines.push(`70 PRINT#1,CHR$(8);CHR$(26);CHR$(${r});A$`);
  } else {
    lines.push(`70 PRINT#1,CHR$(8);A$`);
  }
  lines.push(`80 NEXT J`);
  lines.push(`90 CLOSE1`);
  lines.push(`100 END`);
  let ln = 110;
  for (let i = 0; i < cols.length; i += 8) {
    const group = cols.slice(i, i + 8);
    lines.push(`${ln} DATA ${group.join(",")}`);
    ln += 10;
  }
  return lines.join("\n");
}

export function buildEpsonBitmapBasicProgram(opts: {
  columns: number[];
  mode?: "K" | "L" | "Y" | "Z" | "*";
  density?: number;
  repeats?: number;
  timesPerLine?: number;
}): string {
  const cols = (opts.columns ?? []).map((v) => Math.max(0, Math.min(255, Math.floor(v))));
  const len = cols.length;
  const n = len & 0xff;
  const m = (len >> 8) & 0xff;
  const mode = (opts.mode ?? "K").toUpperCase() as "K" | "L" | "Y" | "Z" | "*";
  const repeats = Math.max(1, Math.floor(opts.repeats ?? 1));
  const timesPerLine = Math.max(1, Math.floor(opts.timesPerLine ?? 4));

  function modeCode(mo: string): number | null {
    const map: Record<string, number> = { K: 75, L: 76, Y: 89, Z: 90 };
    return map[mo] ?? null;
  }

  const lines: string[] = [];
  lines.push(`10 OPEN1,4`);
  if (mode === "*") {
    const density = Math.max(0, Math.min(6, Math.floor(opts.density ?? 0)));
    lines.push(`20 A$=CHR$(27)+"*"+CHR$(${density})+CHR$(${n})+CHR$(${m})`);
  } else {
    const mc = modeCode(mode)!;
    lines.push(`20 A$=CHR$(27)+CHR$(${mc})+CHR$(${n})+CHR$(${m})`);
  }
  lines.push(`30 FOR I=1 TO ${cols.length}`);
  lines.push(`40 READ A:A$=A$+CHR$(A)`);
  lines.push(`50 NEXT I`);
  lines.push(`60 PRINT#1,CHR$(27);CHR$(65);CHR$(8);CHR$(10);CHR$(13)`);
  lines.push(`70 FOR J=1 TO ${repeats}`);
  const seg = Array.from({ length: timesPerLine }).map(() => "A$").join(";");
  lines.push(`80 PRINT#1,${seg};CHR$(10);CHR$(13)`);
  lines.push(`90 NEXT J`);
  lines.push(`100 CLOSE1`);
  lines.push(`110 END`);
  let ln = 120;
  for (let i = 0; i < cols.length; i += 8) {
    const group = cols.slice(i, i + 8);
    lines.push(`${ln} DATA ${group.join(",")}`);
    ln += 10;
  }
  return lines.join("\n");
}

export function buildCommodoreDllBasicProgram(opts: {
  firstChar: number;
  chars: Array<{ a?: 0 | 1; columns: number[] }>;
  secondaryAddress?: 0 | 7;
}): string {
  const firstChar = Math.max(33, Math.min(126, Math.floor(opts.firstChar)));
  const numChars = Math.max(1, Math.floor(opts.chars?.length ?? 0));
  const saddr = typeof opts.secondaryAddress === "number" ? opts.secondaryAddress : 0;
  const t = numChars * 13 + 2;
  const n = Math.floor(t / 256);
  const m = t - n * 256;
  const s = 32;
  const a = Math.max(0, Math.min(1, Math.floor(opts.chars?.[0]?.a ?? 0)));
  const lines: string[] = [];
  lines.push(`10 OPEN1,4${saddr === 0 ? "" : "," + saddr}`);
  lines.push(`20 PRINT#1,CHR$(27);"=";CHR$(${m});CHR$(${n});CHR$(${firstChar});CHR$(${s});CHR$(${a})`);
  let ln = 30;
  for (let idx = 0; idx < numChars; idx += 1) {
    const cols = (opts.chars[idx]?.columns ?? []).slice(0, 11).map((v) => Math.max(0, Math.min(255, Math.floor(v))));
    while (cols.length < 11) cols.push(0);
    lines.push(`${ln} PRINT#1${cols.map((v) => `,CHR$(${v})`).join("")}`);
    ln += 10;
  }
  lines.push(`${ln} CLOSE1`);
  return lines.join("\n");
}

function hex2(n: number): string {
  return (n & 0xff).toString(16).toUpperCase().padStart(2, "0");
}

function hex16(n: number): string {
  return (n & 0xffff).toString(16).toUpperCase().padStart(4, "0");
}
