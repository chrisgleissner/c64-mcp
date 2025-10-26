#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const run = (command, options = {}) => {
  execSync(command, { stdio: 'inherit', ...options });
};

const updateJsonFile = async (relativePath, updater) => {
  const filePath = path.resolve(relativePath);
  const raw = await readFile(filePath, 'utf8');
  const data = JSON.parse(raw);
  const updated = await updater(data);
  await writeFile(filePath, JSON.stringify(updated, null, 2) + '\n');
};

const usage = `Usage: npm run release:prepare -- <new-version|major|minor|patch>

Examples:
  npm run release:prepare -- 0.2.0
  npm run release:prepare -- minor`;

const arg = process.argv[2];
if (!arg) {
  console.error('Error: missing version argument.');
  console.error(usage);
  process.exit(1);
}

try {
  run(`npm version ${arg} --no-git-tag-version`);
} catch (error) {
  console.error('npm version failed.');
  process.exit(error.status || 1);
}

const pkgRaw = await readFile(path.resolve('package.json'), 'utf8');
const pkg = JSON.parse(pkgRaw);
const newVersion = pkg.version;

await updateJsonFile('mcp.json', async (data) => ({
  ...data,
  version: newVersion,
}));

// Manifest generation removed (runtime discovery via MCP stdio)

// Update CHANGELOG.md from commits since last tag using Conventional Commits subjects.
try {
  run(`node scripts/generate-changelog.mjs ${newVersion}`);
} catch (e) {
  console.warn('WARN: Failed to generate CHANGELOG.md. You can run it manually: npm run changelog:generate');
}

console.log(`Release metadata updated to ${newVersion}.`);
console.log('Next steps: commit the changes, open a PR, and tag the merged commit.');
