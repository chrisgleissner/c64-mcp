/*
C64 MCP - Local RAG Indexer
GPL-2.0-only
*/

import fs from "node:fs/promises";
import path from "node:path";
import { EmbeddingIndexFile, EmbeddingRecord, RagLanguage } from "./types.js";
import fsSync from "node:fs";
import { EmbeddingModel } from "./embeddings.js";

const BASIC_DIR = path.resolve("data/basic_examples");
const ASM_DIR = path.resolve("data/assembly_examples");
const EXTERNAL_DIR = path.resolve("external");
const EMBEDDINGS_DIR = path.resolve(process.env.RAG_EMBEDDINGS_DIR ?? "data");
const BASIC_INDEX = path.join(EMBEDDINGS_DIR, "embeddings_basic.json");
const ASM_INDEX = path.join(EMBEDDINGS_DIR, "embeddings_asm.json");
const DOC_ROOT = path.resolve("doc");
const DEFAULT_DOC_FILES = [path.join(DOC_ROOT, "6502-instructions.md")];
const ENV_DOC_FILES = (process.env.RAG_DOC_FILES ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => path.resolve(entry));
const DOC_INCLUDE_FILES = Array.from(new Set([...DEFAULT_DOC_FILES, ...ENV_DOC_FILES]));
const MIXED_INDEX = path.join(EMBEDDINGS_DIR, "embeddings_mixed.json");
const HARDWARE_INDEX = path.join(EMBEDDINGS_DIR, "embeddings_hardware.json");
const OTHER_INDEX = path.join(EMBEDDINGS_DIR, "embeddings_other.json");
const ALL_INDEX_FILES = [BASIC_INDEX, ASM_INDEX, MIXED_INDEX, HARDWARE_INDEX, OTHER_INDEX];

export interface BuildIndexOptions {
  model: EmbeddingModel;
}

export async function ensureSeedDirs(): Promise<void> {
  await fs.mkdir(BASIC_DIR, { recursive: true });
  await fs.mkdir(ASM_DIR, { recursive: true });
  // External dir is created by the fetch CLI; ensure it exists for indexing if present
  if (!fsSync.existsSync(EXTERNAL_DIR)) {
    try { await fs.mkdir(EXTERNAL_DIR, { recursive: true }); } catch {}
  }
}

async function collectFiles(root: string, exts: string[]): Promise<string[]> {
  const results: string[] = [];
  async function walk(dir: string) {
    let entries: any[] = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (exts.includes(ext)) results.push(full);
      }
    }
  }
  await walk(root);
  return results.sort();
}

async function loadText(file: string): Promise<string> {
  return fs.readFile(file, "utf8");
}

function isWithinExternal(dir: string): boolean {
  const rel = path.relative(EXTERNAL_DIR, path.resolve(dir));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

async function resolveRepoMetadata(file: string): Promise<{ metadata: RepoMetadata | null; repoRoot?: string }> {
  let current = path.dirname(file);
  const visited: string[] = [];
  while (isWithinExternal(current)) {
    const resolved = path.resolve(current);
    if (repoMetadataCache.has(resolved)) {
      const cached = repoMetadataCache.get(resolved)!;
      for (const visit of visited) {
        repoMetadataCache.set(visit, cached);
      }
      return { metadata: cached, repoRoot: cached ? resolved : undefined };
    }
    const metadataPath = path.join(resolved, "_metadata.json");
    try {
      const raw = await fs.readFile(metadataPath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && parsed.type === "github" && typeof parsed.owner === "string" && typeof parsed.repo === "string") {
        const metadata: RepoMetadata = {
          type: "github",
          owner: parsed.owner,
          repo: parsed.repo,
          branch: typeof parsed.branch === "string" ? parsed.branch : undefined,
          repoUrl: typeof parsed.repoUrl === "string" ? parsed.repoUrl : `https://github.com/${parsed.owner}/${parsed.repo}`,
          license: parsed.license
            ? {
                spdxId: parsed.license.spdxId ?? null,
                name: parsed.license.name ?? null,
                url: parsed.license.url ?? null,
                attribution: parsed.license.attribution ?? null,
              }
            : null,
        };
        repoMetadataCache.set(resolved, metadata);
        for (const visit of visited) {
          repoMetadataCache.set(visit, metadata);
        }
        return { metadata, repoRoot: resolved };
      }
      repoMetadataCache.set(resolved, null);
    } catch (err) {
      if (err && typeof err === "object" && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
        // ignore missing metadata file
      } else {
        repoMetadataCache.set(resolved, null);
      }
    }
    visited.push(resolved);
    if (resolved === EXTERNAL_DIR) break;
    const parent = path.dirname(resolved);
    if (parent === resolved) break;
    current = parent;
  }
  for (const visit of visited) {
    if (!repoMetadataCache.has(visit)) {
      repoMetadataCache.set(visit, null);
    }
  }
  return { metadata: null };
}

const BASIC_KEYWORDS = [
  "PRINT",
  "GOTO",
  "GOSUB",
  "FOR",
  "NEXT",
  "IF",
  "THEN",
  "REM",
  "POKE",
  "DATA",
  "READ",
  "INPUT",
  "RUN",
  "SYS",
  "RESTORE",
  "RETURN",
  "END",
  "TAB(",
  "TI$",
  "PEEK",
  "USR",
  "CHR$",
  "LEFT$",
  "RIGHT$",
];

const ASM_OPCODES = new Set([
  "ADC", "AND", "ASL", "BCC", "BCS", "BEQ", "BIT", "BMI", "BNE", "BPL", "BRK", "BVC", "BVS",
  "CLC", "CLD", "CLI", "CLV", "CMP", "CPX", "CPY", "DEC", "DEX", "DEY", "EOR", "INC", "INX",
  "INY", "JMP", "JSR", "LDA", "LDX", "LDY", "LSR", "NOP", "ORA", "PHA", "PHP", "PLA", "PLP",
  "ROL", "ROR", "RTI", "RTS", "SBC", "SEC", "SED", "SEI", "STA", "STX", "STY", "TAX", "TAY",
  "TSX", "TXA", "TXS", "TYA",
]);

const ASM_DIRECTIVE_RE = /^\s*(?:!|\.)(?:byte|word|text|ascii|pet|fill|scr|org|addr|set|equ|macro|endm|include|ifdef|ifndef|endif)/i;
const ASM_OPCODE_RE = /^\s*(?:[A-Z_][\w]*\s*:\s*)?(?:\.\w+\s+)?([A-Z]{2,4})\b/;

const HARDWARE_KEYWORDS = [
  "SID", "VIC", "VIC-II", "VICII", "CIA", "CIA1", "CIA2", "6510", "6502", "6526", "COLOR RAM",
  "SPRITE", "RASTER", "KERNAL", "SCREEN RAM", "BORDER", "JOYSTICK", "SERIAL BUS", "IEC",
  "LORAM", "HIRAM", "CHAREN", "BASIC ROM", "KERNAL ROM", "ULTIMATE 64", "DMA", "NMI", "IRQ",
  "AUDIO FILTER", "VOICE 1", "VOICE 2", "VOICE 3",
];

const HARDWARE_DECIMAL_ADDRS = new Set([
  53248, 53249, 53250, 53251, 53252, 53253, 53254, 53255, 53256, 53257, 53258, 53259, 53260, 53261, 53262, 53263,
  53264, 53265, 53266, 53267, 53268, 53269, 53270, 53271, 53272, 53273, 53274, 53275, 53276, 53277, 53278, 53279,
  53280, 53281, 53282, 53283, 53284, 53285, 53286, 53287, 53288, 53289, 53290, 53291, 53292, 53293, 53294, 53295,
  54272, 54273, 54274, 54275, 54276, 54277, 54278, 54279, 54280, 54281, 54282, 54283, 54284, 54285, 54286, 54287,
  56320, 56321, 56322, 56323, 56324, 56325,
]);

const HARDWARE_HEX_ADDR_RE = /\$[D4F][0-9A-F]{3}\b|\$040[0-9A-F]\b/i;
const BASIC_DECIMAL_ADDR_RE = /\b53(26[0-9]|27[0-9]|28[0-9]|29[0-9])\b/;

const BASIC_EXTS = [".bas", ".txt"];
const ASM_EXTS = [".asm", ".s", ".a65", ".inc", ".mac", ".lst", ".pal", ".src", ".txt", ".md"];
const EXTERNAL_EXTS = Array.from(new Set([...BASIC_EXTS, ...ASM_EXTS, ".seq"]));

interface TextAnalysis {
  basicScore: number;
  asmScore: number;
  hardwareScore: number;
  basicLines: number;
  asmLines: number;
}

interface FileSource {
  file: string;
  root: string;
}

interface RepoLicenseMetadata {
  spdxId?: string | null;
  name?: string | null;
  url?: string | null;
  attribution?: string | null;
}

interface RepoMetadata {
  type: "github";
  owner: string;
  repo: string;
  branch?: string;
  repoUrl: string;
  license?: RepoLicenseMetadata | null;
}

interface PreparedFile {
  file: string;
  root: string;
  text: string;
  mtimeMs: number;
  sourceUrl?: string;
  sourceRepoUrl?: string;
  license?: string;
  licenseSpdxId?: string;
  licenseName?: string;
  licenseUrl?: string;
  attribution?: string;
}

const CATEGORY_LIST: RagLanguage[] = ["basic", "asm", "mixed", "hardware", "other"];
const BASIC_SCORE_THRESHOLD = 4;
const ASM_SCORE_THRESHOLD = 4;
const HARDWARE_SCORE_THRESHOLD = 2;
const repoMetadataCache = new Map<string, RepoMetadata | null>();

function analyzeText(text: string): TextAnalysis {
  const lines = text.split(/\r?\n/);
  let basicScore = 0;
  let asmScore = 0;
  let hardwareScore = 0;
  let basicLines = 0;
  let asmLines = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const upper = trimmed.toUpperCase();

    if (/^\d{1,5}\s/.test(trimmed)) {
      basicScore += 3;
      basicLines++;
    }
    if (BASIC_DECIMAL_ADDR_RE.test(trimmed)) {
      hardwareScore += 1;
    }
    for (const keyword of BASIC_KEYWORDS) {
      if (upper.includes(keyword)) {
        basicScore += 1;
        break;
      }
    }
    if (/\bREM\b/i.test(trimmed) || /\bPRINT\b/i.test(trimmed) || /\bINPUT\b/i.test(trimmed)) {
      basicScore += 1;
    }

    if (ASM_DIRECTIVE_RE.test(trimmed)) {
      asmScore += 2;
      asmLines++;
    } else {
      const match = ASM_OPCODE_RE.exec(upper);
      if (match) {
        const opcode = match[1];
        if (opcode && ASM_OPCODES.has(opcode)) {
          asmScore += 2;
          asmLines++;
        }
      }
    }
    if (/\#?\$[0-9A-F]{2,4}/i.test(trimmed)) {
      asmScore += 1;
      hardwareScore += 0.5;
    }

    if (HARDWARE_HEX_ADDR_RE.test(trimmed)) {
      hardwareScore += 1;
    }
    const decimalMatches = trimmed.match(/\b\d{4,5}\b/g);
    if (decimalMatches) {
      for (const token of decimalMatches) {
        const value = Number(token);
        if (HARDWARE_DECIMAL_ADDRS.has(value)) {
          hardwareScore += 1;
        }
      }
    }
    for (const keyword of HARDWARE_KEYWORDS) {
      if (upper.includes(keyword)) {
        hardwareScore += 1;
        break;
      }
    }
  }
  return { basicScore, asmScore, hardwareScore, basicLines, asmLines };
}

function decideCategory(analysis: TextAnalysis, ext: string, root: string): RagLanguage {
  const lowerExt = ext.toLowerCase();
  const hasBasic = analysis.basicScore >= BASIC_SCORE_THRESHOLD || analysis.basicLines >= 3;
  const hasAsm = analysis.asmScore >= ASM_SCORE_THRESHOLD || analysis.asmLines >= 3;
  const hasHardware = analysis.hardwareScore >= HARDWARE_SCORE_THRESHOLD;

  if (hasBasic && hasAsm) return "mixed";
  if (hasBasic) return "basic";
  if (hasAsm) return "asm";
  if (hasHardware) return "hardware";

  if (lowerExt === ".bas" || root === BASIC_DIR) return "basic";
  if ([".asm", ".s", ".a65", ".inc", ".mac", ".lst", ".pal", ".src"].includes(lowerExt) || root === ASM_DIR) {
    return "asm";
  }
  return "other";
}

function toPosixRelative(from: string, to: string): string {
  return path.relative(from, to).split("\\").join("/");
}

function nameRelativeTo(root: string, file: string): string {
  return toPosixRelative(root, file);
}

async function buildIndexForCategory(
  category: RagLanguage,
  files: PreparedFile[],
  model: EmbeddingModel,
): Promise<EmbeddingIndexFile> {
  const records: EmbeddingRecord[] = [];
  const sorted = [...files].sort((a, b) => nameRelativeTo(a.root, a.file).localeCompare(nameRelativeTo(b.root, b.file)));
  for (const entry of sorted) {
    const vector = Array.from(await model.embed(entry.text));
    records.push({
      name: nameRelativeTo(entry.root, entry.file),
      language: category,
      vector,
      text: entry.text,
      sourcePath: toPosixRelative(process.cwd(), entry.file),
      sourceMtimeMs: entry.mtimeMs,
      sourceUrl: entry.sourceUrl,
      sourceRepoUrl: entry.sourceRepoUrl,
      license: entry.license,
      licenseSpdxId: entry.licenseSpdxId,
      licenseName: entry.licenseName,
      licenseUrl: entry.licenseUrl,
      attribution: entry.attribution,
    });
  }
  return { dim: model.dim, model: model.constructor.name, records };
}

async function writeIndex(filePath: string, index: EmbeddingIndexFile): Promise<void> {
  const json = JSON.stringify(index);
  try {
    const existing = await fs.readFile(filePath, "utf8");
    if (existing === json) {
      return; // no-op if unchanged
    }
  } catch {
    // file does not exist or unreadable — proceed to write
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, json, "utf8");
}

export async function buildAllIndexes({ model }: BuildIndexOptions): Promise<void> {
  await ensureSeedDirs();
  repoMetadataCache.clear();

  const docIncluded = DOC_INCLUDE_FILES.filter((file) => fsSync.existsSync(file));

  const sourcesConfig: Array<{ root: string; exts: string[] }> = [
    { root: BASIC_DIR, exts: BASIC_EXTS },
    { root: ASM_DIR, exts: ASM_EXTS },
    { root: EXTERNAL_DIR, exts: EXTERNAL_EXTS },
  ];

  const fileSources: FileSource[] = [];
  for (const cfg of sourcesConfig) {
    const files = await collectFiles(cfg.root, cfg.exts);
    for (const file of files) {
      fileSources.push({ file, root: cfg.root });
    }
  }
  for (const docFile of docIncluded) {
    fileSources.push({ file: docFile, root: process.cwd() });
  }

  const seen = new Set<string>();
  const preparedByCategory: Record<RagLanguage, PreparedFile[]> = {
    basic: [],
    asm: [],
    mixed: [],
    hardware: [],
    other: [],
  };

  for (const source of fileSources) {
    if (seen.has(source.file)) continue;
    seen.add(source.file);
    let text: string;
    try {
      text = await loadText(source.file);
    } catch {
      continue;
    }
    const stat = await fs.stat(source.file).catch(() => null);
    if (!stat) continue;

    const analysis = analyzeText(text);
    const category = decideCategory(analysis, path.extname(source.file), source.root);

    let sourceUrl: string | undefined;
    let sourceRepoUrl: string | undefined;
    let licenseSpdxId: string | undefined;
    let licenseName: string | undefined;
    let licenseUrl: string | undefined;
    let attribution: string | undefined;

    const { metadata, repoRoot } = await resolveRepoMetadata(source.file);
    if (metadata?.type === "github" && repoRoot) {
      sourceRepoUrl = metadata.repoUrl;
      const branch = metadata.branch ?? "main";
      const repoRelative = path.relative(repoRoot, source.file);
      if (!repoRelative.startsWith("..")) {
        const encodedPath = repoRelative.split(path.sep).map((segment) => encodeURIComponent(segment)).join("/");
        sourceUrl = `${metadata.repoUrl}/blob/${branch}/${encodedPath}`;
      }
      if (metadata.license) {
        const spdx = metadata.license.spdxId ?? undefined;
        if (spdx && spdx !== "NOASSERTION") {
          licenseSpdxId = spdx;
        }
        const nameValue = metadata.license.name ?? undefined;
        licenseName = nameValue;
        licenseUrl = metadata.license.url ?? undefined;
        attribution = metadata.license.attribution ?? undefined;
      }
    }

    let licenseLabel: string | undefined;
    if (metadata?.type === "github") {
      if (licenseSpdxId) {
        licenseLabel = licenseSpdxId;
      } else if (licenseName) {
        licenseLabel = licenseName;
      } else {
        licenseLabel = "UNKNOWN";
      }
    }

    preparedByCategory[category].push({
      file: source.file,
      root: source.root,
      text,
      mtimeMs: stat.mtimeMs,
      sourceUrl,
      sourceRepoUrl,
      license: licenseLabel,
      licenseSpdxId,
      licenseName,
      licenseUrl,
      attribution,
    });
  }

  const indexesByCategory = new Map<RagLanguage, EmbeddingIndexFile>();
  for (const category of CATEGORY_LIST) {
    const index = await buildIndexForCategory(category, preparedByCategory[category], model);
    indexesByCategory.set(category, index);
  }

  await Promise.all([
    writeIndex(BASIC_INDEX, indexesByCategory.get("basic")!),
    writeIndex(ASM_INDEX, indexesByCategory.get("asm")!),
    writeIndex(MIXED_INDEX, indexesByCategory.get("mixed")!),
    writeIndex(HARDWARE_INDEX, indexesByCategory.get("hardware")!),
    writeIndex(OTHER_INDEX, indexesByCategory.get("other")!),
  ]);
}

export interface LoadedIndexes {
  basic?: EmbeddingIndexFile;
  asm?: EmbeddingIndexFile;
  mixed?: EmbeddingIndexFile;
  hardware?: EmbeddingIndexFile;
  other?: EmbeddingIndexFile;
}

export async function loadIndexes(): Promise<LoadedIndexes> {
  // Best-effort loading
  const result: LoadedIndexes = {};
  try {
    const basic = JSON.parse(await fs.readFile(BASIC_INDEX, "utf8"));
    result.basic = basic as EmbeddingIndexFile;
  } catch {}
  try {
    const asm = JSON.parse(await fs.readFile(ASM_INDEX, "utf8"));
    result.asm = asm as EmbeddingIndexFile;
  } catch {}
  try {
    const mixed = JSON.parse(await fs.readFile(MIXED_INDEX, "utf8"));
    result.mixed = mixed as EmbeddingIndexFile;
  } catch {}
  try {
    const hardware = JSON.parse(await fs.readFile(HARDWARE_INDEX, "utf8"));
    result.hardware = hardware as EmbeddingIndexFile;
  } catch {}
  try {
    const other = JSON.parse(await fs.readFile(OTHER_INDEX, "utf8"));
    result.other = other as EmbeddingIndexFile;
  } catch {}
  return result;
}
