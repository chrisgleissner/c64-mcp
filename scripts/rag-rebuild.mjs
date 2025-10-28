#!/usr/bin/env bun
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

  if (await fileExists(distEmbeddings) && await fileExists(distIndexer)) {
    const em = await import(pathToFileURL(distEmbeddings).href);
    const ix = await import(pathToFileURL(distIndexer).href);
    LocalMiniHashEmbedding = em.LocalMiniHashEmbedding;
    buildAllIndexes = ix.buildAllIndexes;
  } else {
    // Fall back to TypeScript sources directly under Bun
    try {
      const em = await import(pathToFileURL(path.join(projectRoot, 'src', 'rag', 'embeddings.ts')).href);
      const ix = await import(pathToFileURL(path.join(projectRoot, 'src', 'rag', 'indexer.ts')).href);
      LocalMiniHashEmbedding = em.LocalMiniHashEmbedding;
      buildAllIndexes = ix.buildAllIndexes;
    } catch (err) {
      console.error('[rag-rebuild] Unable to load RAG modules from dist or src:', err);
      process.exit(1);
      return;
    }
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
