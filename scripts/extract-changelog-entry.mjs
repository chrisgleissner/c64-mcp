#!/usr/bin/env node
/**
 * Extract a specific version's changelog entry from CHANGELOG.md
 * Usage: node scripts/extract-changelog-entry.mjs <version>
 * Outputs the changelog section for the given version to stdout.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const version = process.argv[2];
if (!version) {
  console.error('Error: version argument required');
  process.exit(1);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const changelogPath = path.resolve('CHANGELOG.md');
let content;
try {
  content = await readFile(changelogPath, 'utf8');
} catch (err) {
  console.error(`Error reading CHANGELOG.md: ${err.message}`);
  process.exit(1);
}

// Match the version header (e.g., "## 0.7.0 - 2025-11-01")
const versionPattern = new RegExp(`^## ${escapeRegex(version)} - \\d{4}-\\d{2}-\\d{2}$`, 'm');
const match = content.match(versionPattern);

if (!match) {
  console.error(`Error: changelog entry for version ${version} not found`);
  process.exit(1);
}

const startIndex = match.index;
// Find the next version header or end of file
const nextHeaderPattern = /^## \d+\.\d+\.\d+ - \d{4}-\d{2}-\d{2}$/m;
const remainingContent = content.slice(startIndex + match[0].length);
const nextMatch = remainingContent.match(nextHeaderPattern);

let entry;
if (nextMatch) {
  entry = content.slice(startIndex, startIndex + match[0].length + nextMatch.index);
} else {
  entry = content.slice(startIndex);
}

// Trim trailing whitespace
console.log(entry.trimEnd());
