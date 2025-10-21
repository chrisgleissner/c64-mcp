/*
C64 MCP - An MCP Server for the Commodore 64 Ultimate
Copyright (C) 2025 Christian Gleissner

Licensed under the GNU General Public License v2.0 or later.
See <https://www.gnu.org/licenses/> for details.
*/

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface ChargenGlyph {
  petsciiCode: number;
  screenCode: number;
  basic: string | undefined;
  name: string | undefined;
  bitmap: Uint8Array; // 8 bytes, bit 7 = leftmost pixel
}

interface ParsedRow {
  [key: string]: string;
}

const glyphCache: {
  loaded: boolean;
  glyphs: ChargenGlyph[];
  byPetscii: Map<number, ChargenGlyph>;
  byBasic: Map<string, ChargenGlyph>;
} = {
  loaded: false,
  glyphs: [],
  byPetscii: new Map(),
  byBasic: new Map(),
};

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === "\"") {
        if (line[i + 1] === "\"") {
          current += "\"";
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === "\"") {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }

  cells.push(current);
  return cells;
}

function parseCsv(content: string): ParsedRow[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return [];
  }

  const headerCells = parseCsvLine(lines[0]!.trim());
  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const raw = lines[i]!;
    const cells = parseCsvLine(raw.trim());
    const row: ParsedRow = {};
    for (let j = 0; j < headerCells.length; j += 1) {
      const key = headerCells[j]!;
      const value = cells[j] ?? "";
      row[key] = value;
    }
    rows.push(row);
  }
  return rows;
}

function hexByte(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const parsed = Number.parseInt(trimmed, 16);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 0xff) {
    return undefined;
  }
  return parsed;
}

function loadGlyphs(): void {
  if (glyphCache.loaded) {
    return;
  }

  const baseDir = dirname(fileURLToPath(import.meta.url));
  const csvPath = join(baseDir, "..", "data", "chargen.csv");
  const csv = readFileSync(csvPath, "utf8");
  const rows = parseCsv(csv);

  for (const row of rows) {
    const petsciiRaw = row.petscii_code ?? row.petcsii_code;
    const screenRaw = row.screen_code;
    const petsciiCode = Number.parseInt(String(petsciiRaw ?? "").trim(), 10);
    const screenCode = Number.parseInt(String(screenRaw ?? "").trim(), 10);
    if (!Number.isFinite(petsciiCode) || petsciiCode < 0) {
      continue;
    }
    if (!Number.isFinite(screenCode) || screenCode < 0) {
      continue;
    }

    const bytes: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      const key = `byte${i}`;
      const parsed = hexByte(row[key] ?? "");
      bytes.push(parsed ?? 0);
    }

    const name = row.char_name?.trim() || undefined;
    const basicRaw = row.basic_repr?.trim();
    const basic = basicRaw && basicRaw.length > 0 ? basicRaw : undefined;
    const glyph: ChargenGlyph = {
      petsciiCode,
      screenCode,
      basic,
      name,
      bitmap: Uint8Array.from(bytes),
    };

    glyphCache.glyphs.push(glyph);
    glyphCache.byPetscii.set(petsciiCode, glyph);

    if (basic && basic.length === 1) {
      const setIfMissing = (key: string) => {
        if (!glyphCache.byBasic.has(key)) {
          glyphCache.byBasic.set(key, glyph);
        }
      };
      setIfMissing(basic);
      const upper = basic.toUpperCase();
      if (upper !== basic) {
        setIfMissing(upper);
      }
      const lower = basic.toLowerCase();
      if (lower !== basic) {
        setIfMissing(lower);
      }
    }
  }

  glyphCache.loaded = true;
}

export function getChargenGlyphs(): readonly ChargenGlyph[] {
  loadGlyphs();
  return glyphCache.glyphs;
}

export function findGlyphByPetscii(code: number): ChargenGlyph | undefined {
  loadGlyphs();
  return glyphCache.byPetscii.get(code);
}

export function findGlyphByBasicChar(char: string): ChargenGlyph | undefined {
  if (!char) {
    return undefined;
  }
  loadGlyphs();
  return glyphCache.byBasic.get(char);
}
