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
  if (originalValue === undefined) delete process.env[key];
  else process.env[key] = originalValue;
}

test('RAG indexing scenarios', { concurrency: false }, async (t) => {
  const embeddingsDir = await makeTempDir('embeddings');
  const basicDir = await makeTempDir('basic');
  const asmDir = await makeTempDir('asm');
  const externalDir = await makeTempDir('external');
  const originalEmbeddingsDir = process.env.RAG_EMBEDDINGS_DIR;
  process.env.RAG_EMBEDDINGS_DIR = embeddingsDir;

  const model = new LocalMiniHashEmbedding(64);

  const basicSample = `10 PRINT "DRAW A SINE WAVE"
20 FOR A=0 TO 255
30 POKE 53280,(SIN(A/10)+1)*8
40 NEXT A
50 GOTO 20
`;
  const asmSample = `*=$0801
START
        LDA #$00
LOOP    STA $D020
        ADC #$01
        JMP LOOP
`;
  await fs.writeFile(path.join(basicDir, 'sine.bas'), basicSample, 'utf8');
  await fs.writeFile(path.join(asmDir, 'border.asm'), asmSample, 'utf8');

  const buildOptions = {
    model,
    embeddingsDir,
    basicDirs: [basicDir],
    asmDirs: [asmDir],
    externalDirs: [externalDir],
    docFiles: [],
  };

  try {
    await buildAllIndexes(buildOptions);
    let indexes = await loadIndexes({ embeddingsDir });
    let rag = new LocalRagRetriever(model, indexes);

    await t.test('retrieves BASIC refs', async () => {
      const refs = await rag.retrieve('draw a sine wave', 3, 'basic');
      assert.ok(Array.isArray(refs) && refs.length > 0);
      assert.ok(refs.some((text) => /POKE|PRINT|SIN|TAB|GOTO/i.test(text)));
    });

    await t.test('retrieves ASM refs for raster/border', async () => {
      const refs = await rag.retrieve('cycle border colors', 3, 'asm');
      assert.ok(refs.length > 0);
      const hasBorderColour = refs.some((text) => /\$d020|\$D020|border colour|border color/i.test(text));
      const hasAsmOps = refs.some((text) => /\b(JMP|LDA|STA|ADC|AND)\b/.test(text));
      assert.ok(hasBorderColour || hasAsmOps, 'expected at least one reference touching border colour logic');
    });

    await t.test('classification identifies mixed, hardware, and other sources', async () => {
      const mixedFile = path.join(externalDir, 'combo.txt');
      const hardwareFile = path.join(externalDir, 'sid_notes.txt');
      const otherFile = path.join(externalDir, 'notes.md');

      try {
        await fs.writeFile(mixedFile, '10 PRINT "HELLO"\nJSR $FFD2\nLDA #$41\nSTA $0400\n', 'utf8');
        await fs.writeFile(hardwareFile, 'The SID chip at $D400 controls voices, and register 53280 alters the border colour.', 'utf8');
        await fs.writeFile(otherFile, 'This text documents planning notes unrelated to code or hardware.', 'utf8');

        await buildAllIndexes(buildOptions);
        indexes = await loadIndexes({ embeddingsDir });

        assert.ok(indexes.mixed && indexes.mixed.records.some((r) => r.sourcePath.endsWith('combo.txt')));
        assert.ok(indexes.hardware && indexes.hardware.records.some((r) => r.sourcePath.endsWith('sid_notes.txt')));
        assert.ok(indexes.other && indexes.other.records.some((r) => r.sourcePath.endsWith('notes.md')));
      } finally {
        await Promise.all([
          fs.rm(mixedFile, { force: true }),
          fs.rm(hardwareFile, { force: true }),
          fs.rm(otherFile, { force: true }),
        ]);
        await buildAllIndexes(buildOptions);
        indexes = await loadIndexes({ embeddingsDir });
        rag = new LocalRagRetriever(model, indexes);
      }
    });
  } finally {
    restoreEnv('RAG_EMBEDDINGS_DIR', originalEmbeddingsDir);
    await Promise.all([
      fs.rm(embeddingsDir, { recursive: true, force: true }),
      fs.rm(basicDir, { recursive: true, force: true }),
      fs.rm(asmDir, { recursive: true, force: true }),
      fs.rm(externalDir, { recursive: true, force: true }),
    ]);
  }
});
