#!/usr/bin/env node
/**
 * Flexible launcher for the MCP server.
 *
 * - Prefer running the TypeScript sources via ts-node when they are available
 *   (local development workflow).
 * - Fall back to the compiled JavaScript in dist/ when the package is
 *   consumed from npm, where the sources and dev dependencies are omitted.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { stat } from 'node:fs/promises';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');

async function fileExists(filePath) {
  try {
    const stats = await stat(filePath);
    return stats.isFile();
  } catch (error) {
    const err = error;
    if (err && typeof err === 'object' && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) {
      return false;
    }
    throw error;
  }
}

async function launch() {
  const srcEntry = path.resolve(projectRoot, 'src/index.ts');
  const distEntry = path.resolve(projectRoot, 'dist/index.js');

  if (typeof globalThis.Bun !== 'undefined' && await fileExists(srcEntry)) {
    await import(pathToFileURL(srcEntry).href);
    return;
  }

  if (await fileExists(distEntry)) {
    await import(pathToFileURL(distEntry).href);
    return;
  }

  console.error('[start] Unable to locate server entry point: dist/index.js or src/index.ts.');
  console.error('[start] Build the project with `npm run build` or install dev dependencies for ts-node.');
  process.exitCode = 1;
}

await launch();
