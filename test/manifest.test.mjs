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

test('build produced dist/mcp-manifest.json with expected tools', async (t) => {
  const manifestPath = path.join(repoRoot, 'dist', 'mcp-manifest.json');
  let manifest;
  try {
    manifest = await readJson(manifestPath);
  } catch (err) {
    t.skip(`Manifest not found at ${manifestPath}. Run 'npm run build' or use 'npm run check' to build before tests.`);
    return;
  }

  // Basic shape
  assert.equal(typeof manifest?.name, 'string');
  assert.ok(Array.isArray(manifest?.tools), 'tools should be an array');
  assert.ok(manifest.tools.length > 5, 'manifest should list more than 5 tools');

  const toolNames = new Set(manifest.tools.map((t) => t.name));

  // Spot-check a few well-known tools (decorated in code)
  for (const name of [
    'upload_and_run_basic',
    'upload_and_run_asm',
    'read_memory',
    'write_memory',
    'sid_note_on',
  ]) {
    assert.ok(toolNames.has(name), `expected tool '${name}' to be present in manifest`);
  }
});
