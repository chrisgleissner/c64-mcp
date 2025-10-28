#!/usr/bin/env bun
// Local smoke-test helper: writes mock server info JSON for run-mcp-check.sh and keeps it alive.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Reuse the existing mock server implementation from tests
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const { startMockC64Server } = await import(path.join(root, 'test', 'mockC64Server.mjs'));

const outPath = process.argv[2];
if (!outPath) {
  console.error('Usage: start-mock.mjs <out-json-path>');
  process.exit(1);
}

const mock = await startMockC64Server();
await writeFile(outPath, JSON.stringify({ baseUrl: mock.baseUrl }, null, 2) + '\n', 'utf8');

// Keep process alive until terminated; forward signals to close
const onExit = async () => {
  try { await mock.close(); } catch {}
  process.exit(0);
};
process.on('SIGTERM', onExit);
process.on('SIGINT', onExit);

// Idle forever
setInterval(() => {}, 1 << 30).unref();
