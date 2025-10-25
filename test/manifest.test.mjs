import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

async function readJson(p) {
  const text = await fs.readFile(p, 'utf8');
  return JSON.parse(text);
}

test('manifest.json removed: tools are discovered dynamically at runtime', async () => {
  const manifestPath = path.join(repoRoot, 'mcp-manifest.json');
  let exists = false;
  try {
    await fs.stat(manifestPath);
    exists = true;
  } catch {}
  assert.equal(exists, false, 'legacy mcp-manifest.json should not exist');
});
