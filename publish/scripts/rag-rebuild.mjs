#!/usr/bin/env node
import { LocalMiniHashEmbedding } from "../src/rag/embeddings.ts";
import { buildAllIndexes } from "../src/rag/indexer.ts";

async function main() {
  const dim = Number(process.env.RAG_EMBED_DIM ?? 384);
  const model = new LocalMiniHashEmbedding(dim);
  await buildAllIndexes({ model });
  process.stdout.write("Rebuilt RAG embeddings.\n");
}

main().catch((error) => {
  console.error("Failed to rebuild embeddings", error);
  process.exit(1);
});
