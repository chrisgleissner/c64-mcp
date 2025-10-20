/*
C64 MCP - An MCP Server for the Commodore 64 Ultimate
Copyright (C) 2025 Christian Gleissner

Licensed under the GNU General Public License v2.0 or later.
See <https://www.gnu.org/licenses/> for details.
*/

export interface MemoryRegion {
  name: string;
  start: number;
  end: number;
  description: string;
}

export const MEMORY_MAP: MemoryRegion[] = [
  { name: "zero_page", start: 0x0000, end: 0x00ff, description: "Zero page (system vectors, pointers, variables)" },
  { name: "stack", start: 0x0100, end: 0x01ff, description: "6502 hardware stack" },
  { name: "basic_input_buffer", start: 0x0200, end: 0x02ff, description: "BASIC input buffer / screen editor workspace" },
  { name: "screen_ram", start: 0x0400, end: 0x07e7, description: "Default text screen RAM (1000 bytes)" },
  { name: "basic_program", start: 0x0801, end: 0x9fff, description: "Default BASIC program area (grows upward)" },
  { name: "vic_ii_registers", start: 0xd000, end: 0xd3ff, description: "VIC-II registers (mirrored)" },
  { name: "sid_registers", start: 0xd400, end: 0xd7ff, description: "SID registers (mirrored)" },
  { name: "color_ram", start: 0xd800, end: 0xdbff, description: "Color RAM (nibbles, 1000 cells + extras)" },
  { name: "cia1_registers", start: 0xdc00, end: 0xdcff, description: "CIA1 (keyboard, joystick, timers)" },
  { name: "cia2_registers", start: 0xdd00, end: 0xddff, description: "CIA2 (serial IEC, timers)" },
  { name: "io_area", start: 0xd000, end: 0xdfff, description: "I/O area (VIC/SID/CIAs/Color RAM / Char ROM when mapped)" },
  { name: "kernal_rom", start: 0xe000, end: 0xffff, description: "KERNAL ROM (may be banked out)" },
];

const SYMBOLS: Record<string, number> = Object.freeze({
  // Common symbols
  screen: 0x0400,
  screen_ram: 0x0400,
  basic: 0x0801,
  basic_start: 0x0801,
  color: 0xd800,
  color_ram: 0xd800,
  vic: 0xd000,
  sid: 0xd400,
  cia1: 0xdc00,
  cia2: 0xdd00,
  kernal: 0xe000,
});

export function formatAddress(address: number): string {
  return address.toString(16).toUpperCase().padStart(4, "0");
}

export function resolveAddressSymbol(input: string): number | undefined {
  const key = input.trim().toLowerCase().replace(/\s+/g, "_");
  return SYMBOLS[key];
}

export function listSymbols(): Array<{ name: string; address: number; hex: string }> {
  return Object.entries(SYMBOLS)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, address]) => ({ name, address, hex: `$${formatAddress(address)}` }));
}

export function listMemoryMap(): MemoryRegion[] {
  return MEMORY_MAP.slice().sort((a, b) => a.start - b.start);
}
