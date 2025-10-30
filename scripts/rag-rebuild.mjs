#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stat } from 'node:fs/promises';

async function fileExists(p) {
  try {
    const s = await stat(p);
    return s.isFile();
  } catch {
    return false;
  }
}

async function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(here, '..');
  const distEmbeddings = path.join(projectRoot, 'dist', 'rag', 'embeddings.js');
  const distIndexer = path.join(projectRoot, 'dist', 'rag', 'indexer.js');

  let LocalMiniHashEmbedding;
  let buildAllIndexes;

  const isBun = typeof globalThis.Bun !== 'undefined';

  if (!isBun && await fileExists(distEmbeddings) && await fileExists(distIndexer)) {
    const em = await import(pathToFileURL(distEmbeddings).href);
    const ix = await import(pathToFileURL(distIndexer).href);
    LocalMiniHashEmbedding = em.LocalMiniHashEmbedding;
    buildAllIndexes = ix.buildAllIndexes;
  } else if (isBun) {
    const em = await import(pathToFileURL(path.join(projectRoot, 'src', 'rag', 'embeddings.ts')).href);
    const ix = await import(pathToFileURL(path.join(projectRoot, 'src', 'rag', 'indexer.ts')).href);
    LocalMiniHashEmbedding = em.LocalMiniHashEmbedding;
    buildAllIndexes = ix.buildAllIndexes;
  } else {
    console.error('[rag-rebuild] Unable to locate compiled artifacts. Run `bun run build` (or `npm run build`) before invoking this script under Node.');
    process.exit(1);
    return;
  }

  const dim = Number(process.env.RAG_EMBED_DIM ?? 384);
  const model = new LocalMiniHashEmbedding(dim);
  await buildAllIndexes({ model });
  process.stdout.write('Rebuilt RAG embeddings.\n');
}

main().catch((error) => {
  console.error('Failed to rebuild embeddings', error);
  process.exit(1);
});
