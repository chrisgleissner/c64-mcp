#!/usr/bin/env node
/**
 * Normalize the compiled output layout after TypeScript build.
 *
 * - Move everything from dist/src/* to dist/*
 * - Remove the now-empty dist/src directory
 *
 * This keeps the published package tree leaner (single index.js location)
 * while still allowing TypeScript to compile with include patterns.
 */
import { readdir, rename, rm, stat, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const distRoot = path.resolve('dist');
const distSrc = path.join(distRoot, 'src');

async function main() {
  try {
    const stats = await stat(distSrc);
    if (!stats.isDirectory()) {
      return;
    }
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return; // nothing to do
    }
    throw err;
  }

  const entries = await readdir(distSrc, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(distSrc, entry.name);
    const to = path.join(distRoot, entry.name);
    // Remove any existing destination to allow rename.
    await rm(to, { recursive: true, force: true });
    await rename(from, to);
  }

  await rm(distSrc, { recursive: true, force: true });

  // Ensure RAG static assets (CSV/JSON) are available under dist/rag for runtime tools
  // Source-of-truth lives under src/rag/*. Copy selected assets if present.
  const projectRoot = path.resolve('.');
  const ragSrcDir = path.join(projectRoot, 'src', 'rag');
  const ragDistDir = path.join(distRoot, 'rag');
  try {
    await mkdir(ragDistDir, { recursive: true });
    const assets = ['sources.csv', 'discover.config.json'];
    for (const file of assets) {
      const srcPath = path.join(ragSrcDir, file);
      const dstPath = path.join(ragDistDir, file);
      try {
        // Best-effort copy; skip if source asset does not exist.
        await copyFile(srcPath, dstPath);
      } catch {}
    }
  } catch {}

  // Ensure compiled generated client is available at runtime import path (../generated/*)
  await syncGeneratedRuntimeArtifacts();
}

main().catch((error) => {
  console.error('[postbuild] Failed to normalize dist layout:', error);
  process.exitCode = 1;
});

async function syncGeneratedRuntimeArtifacts() {
  const distGenerated = path.join(distRoot, 'generated');
  try {
    const stats = await stat(distGenerated);
    if (!stats.isDirectory()) return;
  } catch (err) {
    if (err && err.code === 'ENOENT') return;
    throw err;
  }

  const projectRoot = path.resolve('.');
  const runtimeGenerated = path.join(projectRoot, 'generated');

  await copyGenerated(distGenerated, runtimeGenerated);
  // Remove the dist/generated copy to avoid duplicate payload in packages
  await rm(distGenerated, { recursive: true, force: true });
}

async function copyGenerated(srcDir, dstDir) {
  await mkdir(dstDir, { recursive: true });
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(srcDir, entry.name);
    const to = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      await copyGenerated(from, to);
    } else if (entry.isFile()) {
      // Preserve timestamps to avoid unnecessary rebuild churn; overwrite existing files.
      await mkdir(path.dirname(to), { recursive: true });
      await copyFile(from, to);
    }
  }
}
