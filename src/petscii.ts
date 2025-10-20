/*
C64 MCP - An MCP Server for the Commodore 64 Ultimate
Copyright (C) 2025 Christian Gleissner

Licensed under the GNU General Public License v2.0 or later.
See <https://www.gnu.org/licenses/> for details.
*/

const PETSCII_TO_ASCII: Record<number, string> = {
  0x00: " ",
  0x07: "\u0007",
  0x0d: "\n",
  0x11: "\n",
  0x8d: "\n",
  0xa0: " ",
};

function petsciiByteToChar(byte: number): string {
  if (PETSCII_TO_ASCII[byte]) {
    return PETSCII_TO_ASCII[byte];
  }

  if (byte >= 0x20 && byte <= 0x7e) {
    return String.fromCharCode(byte);
  }

  if (byte >= 0xc1 && byte <= 0xda) {
    return String.fromCharCode(byte - 0x80);
  }

  if (byte >= 0x41 && byte <= 0x5a) {
    return String.fromCharCode(byte);
  }

  return " ";
}

export function petsciiToAscii(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(petsciiByteToChar)
    .join("");
}
