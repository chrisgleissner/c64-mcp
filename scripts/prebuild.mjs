#!/usr/bin/env node
import { access, readdir, rm, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, join, relative } from "node:path";
import process from "node:process";

const distRoot = resolve("dist");
const srcRoot = resolve("src");

async function main() {
  if (!(await dirExists(distRoot))) {
    return;
  }

  const tsFiles = await collectTsFiles(srcRoot);
  if (tsFiles.length === 0) {
    return;
  }

  const staleOutputs = [];
  for (const file of tsFiles) {
    const expected = join(distRoot, file).replace(/\.ts$/, ".js");
    if (!(await fileExists(expected))) {
      staleOutputs.push(expected);
    }
  }

  if (staleOutputs.length === 0) {
    return;
  }

  console.warn(
    `[prebuild] Detected ${staleOutputs.length} missing compiled modules; removing stale dist/ before rebuilding.`
  );
  await rm(distRoot, { recursive: true, force: true });
}

async function collectTsFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectTsFiles(fullPath);
      for (const file of nested) {
        files.push(file);
      }
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (!entry.name.endsWith(".ts") || entry.name.endsWith(".d.ts")) {
      continue;
    }
    files.push(relative(srcRoot, fullPath));
  }

  return files;
}

async function dirExists(path) {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function fileExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

await main().catch((error) => {
  console.error("[prebuild] Failed to verify dist/ state:", error);
  process.exitCode = 1;
});
