// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LocalMiniHashEmbedding } from '../src/rag/embeddings.ts';
import { buildAllIndexes, loadIndexes } from '../src/rag/indexer.ts';
import { LocalRagRetriever } from '../src/rag/retriever.ts';

/**
 * These tests run entirely locally without hardware.
 */

test('RAG builds indexes and retrieves BASIC refs', async () => {
  const model = new LocalMiniHashEmbedding(128);
  await buildAllIndexes({ model });
  const { basic, asm } = await loadIndexes();
  const rag = new LocalRagRetriever(model, { basic, asm });

  const refs = await rag.retrieve('draw a sine wave', 3, 'basic');
  assert.ok(Array.isArray(refs) && refs.length > 0);
  const joined = refs.join('\n');
  assert.match(joined, /POKE|PRINT|SIN|TAB|GOTO/i);
});

test('RAG retrieves ASM refs for raster/border', async () => {
  const model = new LocalMiniHashEmbedding(128);
  await buildAllIndexes({ model });
  const { basic, asm } = await loadIndexes();
  const rag = new LocalRagRetriever(model, { basic, asm });

  const refs = await rag.retrieve('cycle border colors', 3, 'asm');
  assert.ok(refs.length > 0);
  const joined = refs.join('\n');
  assert.match(joined, /\$D020|JMP|ADC|LDA/);
});
