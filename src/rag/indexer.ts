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

function languageForExt(file: string): RagLanguage {
  const ext = path.extname(file).toLowerCase();
  return ext === ".bas" ? "basic" : "asm";
}

function toPosixRelative(from: string, to: string): string {
  return path.relative(from, to).split("\\").join("/");
}

function nameRelativeTo(root: string, file: string): string {
  return toPosixRelative(root, file);
}

async function buildIndexForDir(root: string, files: string[], model: EmbeddingModel): Promise<EmbeddingIndexFile> {
  const records: EmbeddingRecord[] = [];
  for (const file of files) {
    const stat = await fs.stat(file);
    const text = await loadText(file);
    const vector = Array.from(await model.embed(text));
    records.push({
      name: nameRelativeTo(root, file),
      language: languageForExt(file),
      vector,
      text,
      sourcePath: toPosixRelative(process.cwd(), file),
      sourceMtimeMs: stat.mtimeMs,
    });
  }
  // Keep deterministic order to reduce diffs
  records.sort((a, b) => a.name.localeCompare(b.name));
  return { dim: model.dim, model: model.constructor.name, records };
}

function mergeIndexes(a: EmbeddingIndexFile, b: EmbeddingIndexFile): EmbeddingIndexFile {
  if (a.dim !== b.dim) throw new Error("Embedding dimension mismatch while merging indexes");
  const model = a.model === b.model ? a.model : a.model;
  return { dim: a.dim, model, records: a.records.concat(b.records) };
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

  const [basicLocal, asmLocal, basicExt, asmExt] = await Promise.all([
    collectFiles(BASIC_DIR, [".bas"]),
    collectFiles(ASM_DIR, [".asm", ".s", ".md", ".a65", ".inc", ".txt"]),
    collectFiles(EXTERNAL_DIR, [".bas"]),
    collectFiles(EXTERNAL_DIR, [".asm", ".s", ".md", ".a65", ".inc", ".txt"]),
  ]);
  const docIncluded = DOC_INCLUDE_FILES.filter((file) => fsSync.existsSync(file));

  const [basicLocalIdx, basicExtIdx, asmLocalIdx, asmExtIdx] = await Promise.all([
    buildIndexForDir(BASIC_DIR, basicLocal, model),
    buildIndexForDir(EXTERNAL_DIR, basicExt, model),
    buildIndexForDir(ASM_DIR, asmLocal, model),
    buildIndexForDir(EXTERNAL_DIR, asmExt, model),
  ]);

  const basicIndex = mergeIndexes(basicLocalIdx, basicExtIdx);
  let asmIndex = mergeIndexes(asmLocalIdx, asmExtIdx);
  if (docIncluded.length > 0) {
    const docIndex = await buildIndexForDir(process.cwd(), docIncluded, model);
    asmIndex = mergeIndexes(asmIndex, docIndex);
  }

  await Promise.all([
    writeIndex(BASIC_INDEX, basicIndex),
    writeIndex(ASM_INDEX, asmIndex),
  ]);
}

export interface LoadedIndexes {
  basic?: EmbeddingIndexFile;
  asm?: EmbeddingIndexFile;
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
  return result;
}
