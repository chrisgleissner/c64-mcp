/*
 * Minimal VICE Binary Monitor client with length-aware framing.
 */
import net from "node:net";

export class ViceClient {
  private socket!: net.Socket;
  private buffer: Buffer = Buffer.alloc(0);
  private nextReqId = 1;
  private pending: Map<number, { cmd: number; resolve: (buf: Buffer) => void; reject: (err: any) => void }> = new Map();

  async connect(port: number, host = "127.0.0.1"): Promise<void> {
    this.socket = net.connect({ host, port });
    this.socket.setNoDelay(true);
    await new Promise<void>((resolve, reject) => {
      this.socket.once("connect", () => resolve());
      this.socket.once("error", reject);
    });
    this.socket.on("data", (chunk) => this.onData(chunk));
    this.socket.on("error", (err) => {
      for (const [, p] of this.pending) p.reject(err);
      this.pending.clear();
    });
  }

  close(): void { try { this.socket?.destroy(); } catch {} }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    // Frame: [0]=0x02, [1]=0x02, [2..5]=len, [6]=respType, [7]=err, [8..11]=reqId, [12..]=body
    while (this.buffer.length >= 12) {
      if (this.buffer[0] !== 0x02 || this.buffer[1] !== 0x02) {
        const idx = this.buffer.indexOf(0x02, 1);
        this.buffer = idx === -1 ? Buffer.alloc(0) : this.buffer.subarray(idx);
        continue;
      }
      const bodyLen = this.buffer.readUInt32LE(2);
      const total = 12 + bodyLen;
      if (this.buffer.length < total) return;
      const frame = this.buffer.subarray(0, total);
      this.buffer = this.buffer.subarray(total);

      const respType = frame[6];
      const err = frame[7];
      const reqId = frame.readUInt32LE(8);
      if (reqId === 0xffffffff) continue; // unsolicited event — ignore
      const pending = this.pending.get(reqId);
      if (!pending) continue;
      if (err !== 0x00) {
        pending.reject(new Error(`BM error 0x${err.toString(16)}`));
        this.pending.delete(reqId);
        continue;
      }
      if (pending.cmd !== respType) {
        pending.reject(new Error(`BM mismatched response: expected 0x${pending.cmd.toString(16)} got 0x${respType.toString(16)}`));
        this.pending.delete(reqId);
        continue;
      }
      pending.resolve(frame);
      this.pending.delete(reqId);
    }
  }

  private send(cmd: number, body?: Buffer): Promise<Buffer> {
    const reqId = this.nextReqId++;
    const b = body ?? Buffer.alloc(0);
    const header = Buffer.alloc(2 + 4 + 4 + 1);
    header[0] = 0x02; // STX
    header[1] = 0x02; // API v2
    header.writeUInt32LE(b.length, 2);
    header.writeUInt32LE(reqId, 6);
    header[10] = cmd;
    const packet = Buffer.concat([header, b]);
    const p = new Promise<Buffer>((resolve, reject) => this.pending.set(reqId, { cmd, resolve, reject }));
    this.socket.write(packet);
    return p;
  }

  async info(): Promise<void> { await this.send(0x85); }
  async resetSoft(): Promise<void> { await this.send(0xCC, Buffer.from([0x00])); }
  async resetHard(): Promise<void> { await this.send(0xCC, Buffer.from([0x01])); }
  async reset(type: 0 | 1 = 0): Promise<void> { await this.send(0xCC, Buffer.from([type])); }
  /**
   * Exit the emulator process (BM 0xBB Quit). The socket will be closed by VICE.
   * Consumers should still call close() to dispose any local resources.
   */
  async quit(): Promise<void> { await this.send(0xBB); }
  /**
   * Exit the monitor and resume emulation (BM 0xAA Exit). Not strictly needed for BM requests
   * but useful when the caller wants to ensure the CPU is running afterwards.
   */
  async exitMonitor(): Promise<void> { await this.send(0xAA); }
  async memGet(start: number, end: number): Promise<Buffer> {
    const body = Buffer.alloc(1 + 2 + 2 + 1 + 2);
    body[0] = 0; // sidefx=0 (peek)
    body.writeUInt16LE(start & 0xffff, 1);
    body.writeUInt16LE(end & 0xffff, 3);
    body[5] = 0; // comp space
    body.writeUInt16LE(0, 6); // bank
    const frame = await this.send(0x01, body);
    const len = frame.readUInt16LE(12);
    return frame.subarray(14, 14 + len);
  }

  async memSet(start: number, payload: Buffer): Promise<void> {
    const end = start + payload.length - 1;
    const header = Buffer.alloc(1 + 2 + 2 + 1 + 2);
    header[0] = 1; // sidefx=1 (write)
    header.writeUInt16LE(start & 0xffff, 1);
    header.writeUInt16LE(end & 0xffff, 3);
    header[5] = 0; // comp space
    header.writeUInt16LE(0, 6); // bank
    await this.send(0x02, Buffer.concat([header, payload]));
  }

  async keyboardFeed(text: string): Promise<void> {
    if (!text) return;
    const bytes = Buffer.from(text, "ascii");
    const body = Buffer.concat([Buffer.from([bytes.length & 0xff]), bytes]);
    await this.send(0x72, body);
  }
}
