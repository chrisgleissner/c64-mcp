import net from "node:net";
import { asciiToScreenCodes } from "./readiness.js";

const SCREEN_BASE = 0x0400;
const SCREEN_SIZE = 40 * 25;

export interface ViceMockServerOptions {
  host?: string;
  port?: number;
}

function buildResponse(cmd: number, reqId: number, body: Buffer = Buffer.alloc(0), err = 0): Buffer {
  const header = Buffer.alloc(12 + body.length);
  header[0] = 0x02;
  header[1] = 0x02;
  header.writeUInt32LE(body.length, 2);
  header[6] = cmd;
  header[7] = err;
  header.writeUInt32LE(reqId >>> 0, 8);
  if (body.length > 0) {
    body.copy(header, 12);
  }
  return header;
}

export class ViceMockServer {
  private readonly host: string;
  private readonly requestedPort: number | undefined;
  private server: net.Server | null = null;
  private memory = new Uint8Array(0x10000);
  private helloReady = false;

  constructor(options?: ViceMockServerOptions) {
    this.host = options?.host ?? "127.0.0.1";
    this.requestedPort = options?.port;
    this.resetState();
  }

  async start(): Promise<{ port: number }> {
    if (this.server) throw new Error("ViceMockServer already started");
    await new Promise<void>((resolve, reject) => {
      this.server = net.createServer((socket) => this.handleSocket(socket));
      this.server.on("error", reject);
      this.server.listen(this.requestedPort ?? 0, this.host, () => resolve());
    });
    const address = this.server!.address();
    if (!address || typeof address === "string") throw new Error("Failed to determine mock server port");
    return { port: address.port };
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = null;
  }

  private handleSocket(socket: net.Socket): void {
    let buffer = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      const next = Buffer.alloc(buffer.length + chunk.length);
      buffer.copy(next, 0);
      chunk.copy(next, buffer.length);
      const remainder = this.processBuffer(next, socket);
      buffer = Buffer.alloc(remainder.length);
      remainder.copy(buffer);
    });
  }

  private processBuffer(buffer: Buffer, socket: net.Socket): Buffer {
    while (buffer.length >= 11) {
      if (buffer[0] !== 0x02 || buffer[1] !== 0x02) {
        buffer = buffer.slice(1);
        continue;
      }
      const bodyLen = buffer.readUInt32LE(2);
      const frameLen = 11 + bodyLen;
      if (buffer.length < frameLen) break;

      const reqId = buffer.readUInt32LE(6);
      const cmd = buffer[10];
      const body = buffer.slice(11, frameLen);
      buffer = buffer.slice(frameLen);

      const response = this.handleCommand(cmd, reqId, body, socket);
      if (response) {
        socket.write(response);
      }
    }
    return buffer;
  }

  private handleCommand(cmd: number, reqId: number, body: Buffer, socket: net.Socket): Buffer | null {
    switch (cmd) {
      case 0x85: // info
        return buildResponse(cmd, reqId);
      case 0xCC: // reset
        this.resetState();
        return buildResponse(cmd, reqId);
      case 0x01: { // mem get
        const start = body.readUInt16LE(1);
        const end = body.readUInt16LE(3);
        const length = Math.max(0, end - start + 1);
        const payload = Buffer.alloc(2 + length);
        payload.writeUInt16LE(length, 0);
        for (let i = 0; i < length; i += 1) {
          payload[2 + i] = this.memory[(start + i) & 0xffff];
        }
        return buildResponse(cmd, reqId, payload);
      }
      case 0x02: { // mem set
        const start = body.readUInt16LE(1);
        const end = body.readUInt16LE(3);
        const payload = body.subarray(8);
        for (let i = 0; i < payload.length && start + i <= 0xffff; i += 1) {
          this.memory[start + i] = payload[i];
        }
        if (start <= SCREEN_BASE && end >= SCREEN_BASE) {
          this.helloReady = false;
        }
        return buildResponse(cmd, reqId);
      }
      case 0x72: { // keyboard feed
        const len = body[0] ?? 0;
        const text = body.subarray(1, 1 + len).toString("ascii").toUpperCase();
        if (text.includes("RUN")) {
          this.renderHello();
        }
        return buildResponse(cmd, reqId);
      }
      case 0xAA: // exit monitor
        return buildResponse(cmd, reqId);
      case 0xBB: // quit
        queueMicrotask(() => socket.destroy());
        return buildResponse(cmd, reqId);
      default:
        return buildResponse(cmd, reqId, Buffer.alloc(0), 0x83);
    }
  }

  private resetState(): void {
    this.memory.fill(0);
    // Fill screen with spaces and READY.
    this.memory.fill(0x20, SCREEN_BASE, SCREEN_BASE + SCREEN_SIZE);
    const ready = asciiToScreenCodes("READY.");
    ready.copy(Buffer.from(this.memory.buffer, SCREEN_BASE, ready.length));
    this.helloReady = false;
  }

  private renderHello(): void {
    if (this.helloReady) return;
    const row = 10;
    const offset = SCREEN_BASE + row * 40;
    const hello = asciiToScreenCodes("HELLO");
    hello.copy(Buffer.from(this.memory.buffer, offset, hello.length));
    this.helloReady = true;
  }
}

export async function startViceMockServer(options?: ViceMockServerOptions): Promise<ViceMockServer & { port: number }> {
  const server = new ViceMockServer(options);
  const { port } = await server.start();
  return Object.assign(server, { port });
}
