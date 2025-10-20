/*
C64 MCP - Local RAG bootstrap
GPL-2.0-only
*/

import fs from "node:fs/promises";
import path from "node:path";
import { LocalMiniHashEmbedding } from "./embeddings.js";
import { buildAllIndexes, loadIndexes } from "./indexer.js";
import { LocalRagRetriever } from "./retriever.js";
import type { RagRetriever } from "./types.js";
const EXTERNAL_DIR = path.resolve("external");

const BASIC_INDEX = path.resolve("data/embeddings_basic.json");
const ASM_INDEX = path.resolve("data/embeddings_asm.json");

export async function initRag(): Promise<RagRetriever> {
  const model = new LocalMiniHashEmbedding(384);
  // Build on start only when explicitly requested
  const buildOnStart = String(process.env.RAG_BUILD_ON_START ?? "").trim().toLowerCase();
  if (buildOnStart === "1" || buildOnStart === "true" || buildOnStart === "yes") {
    const needBuild = await needsRebuild();
    if (needBuild) {
      await buildAllIndexes({ model });
    }
  }

  const { basic, asm } = await loadIndexes();
  const retriever = new LocalRagRetriever(model, { basic, asm });

  // Background watcher: reindex if source files change (checks mtimes periodically)
  // Default disabled to avoid churn/conflicts unless explicitly enabled
  const intervalMs = Number(process.env.RAG_REINDEX_INTERVAL_MS ?? 0);
  if (intervalMs > 0) {
    setInterval(async () => {
      try {
        if (await needsRebuild()) {
          await buildAllIndexes({ model });
          const updated = await loadIndexes();
          retriever.updateIndexes(updated);
        }
      } catch (err) {
        // swallow in background to avoid crashing server
        // eslint-disable-next-line no-console
        console.warn("RAG reindex error", err);
      }
    }, intervalMs).unref();
  }

  return retriever;
}

async function fileMtime(file: string): Promise<number | null> {
  try {
    const stat = await fs.stat(file);
    return stat.mtimeMs;
  } catch {
    return null;
  }
}

async function dirMtimeRecursive(root: string): Promise<number> {
  let newest = 0;
  async function walk(dir: string) {
    let entries: any[] = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        const stat = await fs.stat(full);
        if (stat.mtimeMs > newest) newest = stat.mtimeMs;
      }
    }
  }
  await walk(root);
  return newest;
}

async function needsRebuild(): Promise<boolean> {
  const basicIdx = await fileMtime(BASIC_INDEX);
  const asmIdx = await fileMtime(ASM_INDEX);
  const basicDataM = await dirMtimeRecursive(path.resolve("data/basic_examples"));
  const asmDataM = await dirMtimeRecursive(path.resolve("data/assembly_examples"));
  const externalM = await dirMtimeRecursive(EXTERNAL_DIR);

  if (basicIdx === null || asmIdx === null) return true;
  return basicDataM > basicIdx || asmDataM > asmIdx || externalM > Math.min(basicIdx, asmIdx);
}
