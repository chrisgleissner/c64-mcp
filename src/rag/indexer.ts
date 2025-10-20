/*
C64 MCP - Local RAG Indexer
GPL-2.0-only
*/

import fs from "node:fs/promises";
import path from "node:path";
import { EmbeddingIndexFile, EmbeddingRecord, RagLanguage } from "./types.js";
import { EmbeddingModel } from "./embeddings.js";

const BASIC_DIR = path.resolve("data/basic_examples");
const ASM_DIR = path.resolve("data/assembly_examples");
const BASIC_INDEX = path.resolve("data/embeddings_basic.json");
const ASM_INDEX = path.resolve("data/embeddings_asm.json");

export interface BuildIndexOptions {
  model: EmbeddingModel;
}

export async function ensureSeedDirs(): Promise<void> {
  await fs.mkdir(BASIC_DIR, { recursive: true });
  await fs.mkdir(ASM_DIR, { recursive: true });
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

function nameRelativeTo(root: string, file: string): string {
  return path.relative(root, file).split("\\").join("/");
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
      sourcePath: file,
      sourceMtimeMs: stat.mtimeMs,
    });
  }
  return { dim: model.dim, model: model.constructor.name, records };
}

async function writeIndex(filePath: string, index: EmbeddingIndexFile): Promise<void> {
  const json = JSON.stringify(index);
  await fs.writeFile(filePath, json, "utf8");
}

export async function buildAllIndexes({ model }: BuildIndexOptions): Promise<void> {
  await ensureSeedDirs();

  const [basicFiles, asmFiles] = await Promise.all([
    collectFiles(BASIC_DIR, [".bas"]),
    collectFiles(ASM_DIR, [".asm", ".s"]),
  ]);

  const [basicIndex, asmIndex] = await Promise.all([
    buildIndexForDir(BASIC_DIR, basicFiles, model),
    buildIndexForDir(ASM_DIR, asmFiles, model),
  ]);

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
