// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { LocalMiniHashEmbedding } from '../src/rag/embeddings.ts';
import { buildAllIndexes, loadIndexes } from '../src/rag/indexer.ts';
import { LocalRagRetriever } from '../src/rag/retriever.ts';

/**
 * These tests run entirely locally without hardware.
 */

test('RAG builds indexes and retrieves BASIC refs', async () => {
  const model = new LocalMiniHashEmbedding(128);
  await buildAllIndexes({ model });
  const { basic, asm, mixed, hardware, other } = await loadIndexes();
  const rag = new LocalRagRetriever(model, { basic, asm, mixed, hardware, other });

  const refs = await rag.retrieve('draw a sine wave', 3, 'basic');
  assert.ok(Array.isArray(refs) && refs.length > 0);
  const joined = refs.join('\n');
  assert.match(joined, /POKE|PRINT|SIN|TAB|GOTO/i);
});

test('RAG retrieves ASM refs for raster/border', async () => {
  const model = new LocalMiniHashEmbedding(128);
  await buildAllIndexes({ model });
  const { basic, asm, mixed, hardware, other } = await loadIndexes();
  const rag = new LocalRagRetriever(model, { basic, asm, mixed, hardware, other });

  const refs = await rag.retrieve('cycle border colors', 3, 'asm');
  assert.ok(refs.length > 0);
  const joined = refs.join('\n');
  assert.match(joined, /\$D020|JMP|ADC|LDA/);
});

test('RAG classification identifies mixed, hardware, and other sources', async () => {
  const model = new LocalMiniHashEmbedding(96);
  const testDir = path.resolve('external/__rag_test');
  await fs.rm(testDir, { recursive: true, force: true });
  await fs.mkdir(testDir, { recursive: true });
  const mixedFile = path.join(testDir, 'combo.txt');
  const hardwareFile = path.join(testDir, 'sid_notes.txt');
  const otherFile = path.join(testDir, 'notes.md');

  try {
    await fs.writeFile(mixedFile, '10 PRINT "HELLO"\nJSR $FFD2\nLDA #$41\nSTA $0400\n', 'utf8');
    await fs.writeFile(hardwareFile, 'The SID chip at $D400 controls voices, and register 53280 alters the border colour.', 'utf8');
    await fs.writeFile(otherFile, 'This text documents planning notes unrelated to code or hardware.', 'utf8');

    await buildAllIndexes({ model });
    const { mixed, hardware, other } = await loadIndexes();

    assert.ok(mixed && mixed.records.some((r) => r.sourcePath.endsWith('combo.txt')));
    assert.ok(hardware && hardware.records.some((r) => r.sourcePath.endsWith('sid_notes.txt')));
    assert.ok(other && other.records.some((r) => r.sourcePath.endsWith('notes.md')));
  } finally {
    await fs.rm(testDir, { recursive: true, force: true });
    await buildAllIndexes({ model });
  }
});
