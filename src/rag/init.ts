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
const BASIC_DATA_DIR = path.resolve("data/basic_examples");
const ASM_DATA_DIR = path.resolve("data/assembly_examples");
const DOC_DIR = path.resolve("doc");
const BOOTSTRAP_PATH = path.resolve("doc/bootstrap.md");
const AGENTS_PATH_PRIMARY = path.resolve("AGENTS.md");
const AGENTS_PATH_FALLBACK = path.resolve("agents.md");
const PROMPTS_DIR = path.resolve(".github/prompts");
const CHAT_PATH = path.resolve("doc/chat.md");

function resolveEmbeddingsDir(): string {
  return path.resolve(process.env.RAG_EMBEDDINGS_DIR ?? "data");
}

function embeddingIndexPaths() {
  const dir = resolveEmbeddingsDir();
  return {
    dir,
    basic: path.join(dir, "embeddings_basic.json"),
    asm: path.join(dir, "embeddings_asm.json"),
    mixed: path.join(dir, "embeddings_mixed.json"),
    hardware: path.join(dir, "embeddings_hardware.json"),
    other: path.join(dir, "embeddings_other.json"),
  };
}

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

  const embeddingsDir = resolveEmbeddingsDir();
  const { basic, asm, mixed, hardware, other } = await loadIndexes({ embeddingsDir });
  const retriever = new LocalRagRetriever(model, { basic, asm, mixed, hardware, other });

  // Background watcher: reindex if source files change (checks mtimes periodically)
  // Default disabled to avoid churn/conflicts unless explicitly enabled
  const intervalMs = Number(process.env.RAG_REINDEX_INTERVAL_MS ?? 0);
  if (intervalMs > 0) {
    setInterval(async () => {
      try {
        if (await needsRebuild()) {
          await buildAllIndexes({ model });
          const updated = await loadIndexes({ embeddingsDir: resolveEmbeddingsDir() });
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
  const paths = embeddingIndexPaths();
  const indexFiles = [paths.basic, paths.asm, paths.mixed, paths.hardware, paths.other];
  const indexTimes = await Promise.all(indexFiles.map((file) => fileMtime(file)));
  if (indexTimes.some((time) => time === null)) {
    return true;
  }
  const oldestIndex = Math.min(...(indexTimes as number[]));
  const [basicDataM, asmDataM, externalM, docsM, bootstrapM, agentsM, promptsM, chatM] = await Promise.all([
    dirMtimeRecursive(BASIC_DATA_DIR),
    dirMtimeRecursive(ASM_DATA_DIR),
    dirMtimeRecursive(EXTERNAL_DIR),
    dirMtimeRecursive(DOC_DIR).catch(() => 0),
    fileMtime(BOOTSTRAP_PATH).then((v) => v ?? 0),
    (async () => {
      const p = (await fileMtime(AGENTS_PATH_PRIMARY)) ?? (await fileMtime(AGENTS_PATH_FALLBACK)) ?? 0;
      return p;
    })(),
    dirMtimeRecursive(PROMPTS_DIR).catch(() => 0),
    fileMtime(CHAT_PATH).then((v) => v ?? 0),
  ]);
  const newestSource = Math.max(basicDataM, asmDataM, externalM, docsM, bootstrapM, agentsM, promptsM, chatM);
  return newestSource > oldestIndex;
}
