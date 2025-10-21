// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalMiniHashEmbedding } from '../src/rag/embeddings.ts';
import { buildAllIndexes, loadIndexes } from '../src/rag/indexer.ts';
import { LocalRagRetriever } from '../src/rag/retriever.ts';

const TEST_TMP_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tmp');

async function makeTempDir(prefix) {
  await fs.mkdir(TEST_TMP_ROOT, { recursive: true });
  return fs.mkdtemp(path.join(TEST_TMP_ROOT, `${prefix}-`));
}

function restoreEnv(key, originalValue) {
  if (originalValue === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = originalValue;
  }
}

test('RAG indexing scenarios', { concurrency: false }, async (t) => {
  const embeddingsDir = await makeTempDir('embeddings');
  const originalEmbeddingsDir = process.env.RAG_EMBEDDINGS_DIR;
  process.env.RAG_EMBEDDINGS_DIR = embeddingsDir;

  const model = new LocalMiniHashEmbedding(96);

  try {
    await buildAllIndexes({ model, embeddingsDir });
    let indexes = await loadIndexes({ embeddingsDir });
    let rag = new LocalRagRetriever(model, indexes);

    await t.test('retrieves BASIC refs', async () => {
      const refs = await rag.retrieve('draw a sine wave', 3, 'basic');
      assert.ok(Array.isArray(refs) && refs.length > 0);
      assert.ok(refs.some((text) => /POKE|PRINT|SIN|TAB|GOTO/i.test(text)));
    });

    await t.test('retrieves ASM refs for raster/border', async () => {
      const refs = await rag.retrieve('cycle border colors', 5, 'asm');
      assert.ok(refs.length > 0);
      const hasBorderColour = refs.some((text) => /\$d020|\$D020|border colour|border color/i.test(text));
      const hasAsmOps = refs.some((text) => /\b(JMP|LDA|STA|ADC|AND)\b/.test(text));
      assert.ok(hasBorderColour || hasAsmOps, 'expected at least one reference touching border colour logic');
    });

    await t.test('classification identifies mixed, hardware, and other sources', async () => {
      const externalTestDir = path.resolve('external', `__rag_test_${Date.now()}`);
      await fs.rm(externalTestDir, { recursive: true, force: true });
      await fs.mkdir(externalTestDir, { recursive: true });
      const mixedFile = path.join(externalTestDir, 'combo.txt');
      const hardwareFile = path.join(externalTestDir, 'sid_notes.txt');
      const otherFile = path.join(externalTestDir, 'notes.md');

      try {
        await fs.writeFile(mixedFile, '10 PRINT "HELLO"\nJSR $FFD2\nLDA #$41\nSTA $0400\n', 'utf8');
        await fs.writeFile(hardwareFile, 'The SID chip at $D400 controls voices, and register 53280 alters the border colour.', 'utf8');
        await fs.writeFile(otherFile, 'This text documents planning notes unrelated to code or hardware.', 'utf8');

        await buildAllIndexes({ model, embeddingsDir });
        indexes = await loadIndexes({ embeddingsDir });

        assert.ok(indexes.mixed && indexes.mixed.records.some((r) => r.sourcePath.endsWith('combo.txt')));
        assert.ok(indexes.hardware && indexes.hardware.records.some((r) => r.sourcePath.endsWith('sid_notes.txt')));
        assert.ok(indexes.other && indexes.other.records.some((r) => r.sourcePath.endsWith('notes.md')));
      } finally {
        await fs.rm(externalTestDir, { recursive: true, force: true });
        await buildAllIndexes({ model, embeddingsDir });
        indexes = await loadIndexes({ embeddingsDir });
        rag = new LocalRagRetriever(model, indexes);
      }
    });
  } finally {
    restoreEnv('RAG_EMBEDDINGS_DIR', originalEmbeddingsDir);
    await fs.rm(embeddingsDir, { recursive: true, force: true });
  }
});
