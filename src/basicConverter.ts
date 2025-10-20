import { Buffer } from "node:buffer";

export function basicToPrg(source: string): Buffer {
  const startAddress = Buffer.from([0x01, 0x08]);
  const normalized = source.endsWith("\n") ? source : `${source}\n`;
  const encoded = Buffer.from(normalized, "ascii");
  return Buffer.concat([startAddress, encoded]);
}
