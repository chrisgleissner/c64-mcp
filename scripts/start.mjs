#!/usr/bin/env bun
/**
 * Flexible launcher for the MCP server.
 *
 * - Prefer running the TypeScript sources directly when available (Bun supports TS).
 * - Fall back to the compiled JavaScript in dist/ when the package is
 *   consumed from npm, where the sources are omitted.
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

function isModuleNotFound(error) {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const err = error;
  if (err.code === 'ERR_MODULE_NOT_FOUND') {
    return true;
  }
  const message = typeof err.message === 'string' ? err.message : '';
  return message.includes('Cannot find module');
}

async function launch() {
  const srcServer = path.resolve(projectRoot, 'src/mcp-server.ts');
  const srcBootstrap = path.resolve(projectRoot, 'src/bootstrap/stdio-logger.ts');
  const distEntry = path.resolve(projectRoot, 'dist/index.js');

  if (await fileExists(srcServer)) {
    // Ensure stdio logger bootstrap is applied in dev runs
    if (await fileExists(srcBootstrap)) {
      await import(pathToFileURL(srcBootstrap).href);
    }
    await import(pathToFileURL(srcServer).href);
    return;
  }

  if (await fileExists(distEntry)) {
    await import(pathToFileURL(distEntry).href);
    return;
  }

  console.error('[start] Unable to locate server entry point: dist/index.js or src/index.ts.');
  console.error('[start] Build the project with `bun run build`.');
  process.exitCode = 1;
}

await launch();
