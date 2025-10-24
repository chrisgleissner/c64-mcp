#!/usr/bin/env node
/**
 * Generate or extend CHANGELOG.md from commit messages since the last tag,
 * following a Conventional Commits-like format.
 *
 * Groups by:
 *  - feat      → Features
 *  - fix       → Bug Fixes
 *  - perf      → Performance
 *  - refactor  → Refactoring
 *  - docs      → Documentation
 *  - test      → Tests
 *  - build/ci/chore → Chores
 *  - other     → Other
 *
 * Usage: node scripts/generate-changelog.mjs [version]
 * - version is optional; when provided, it's used as the new release header.
 */
import { execSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const run = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();

const nowDate = new Date().toISOString().slice(0, 10);
const root = process.cwd();

function getLastTag() {
  try {
    return run('git describe --tags --abbrev=0');
  } catch {
    return '';
  }
}

function getCommits(range) {
  // Subject and short SHA; filter out merge commits later
  const format = `%s|%h`;
  const cmd = range ? `git log --pretty=format:"${format}" ${range}` : `git log --pretty=format:"${format}"`;
  const out = run(cmd);
  if (!out) return [];
  return out.split('\n').map((line) => {
    const [subject, sha] = line.split('|');
    return { subject, sha };
  });
}

function classify(subject) {
  // Conventional commits: type(scope)!: desc
  // Extract type and optional scope
  const m = subject.match(/^([a-zA-Z]+)(\([^\)]+\))?(!)?:\s+(.*)$/);
  if (!m) return { group: 'other', entry: subject };
  const [, type,, bang, desc] = m; // scope ignored in output line beyond description
  const map = {
    feat: 'Features',
    fix: 'Bug Fixes',
    perf: 'Performance',
    refactor: 'Refactoring',
    docs: 'Documentation',
    test: 'Tests',
    build: 'Chores',
    ci: 'Chores',
    chore: 'Chores'
  };
  const group = map[type.toLowerCase()] || 'Other';
  const breaking = Boolean(bang);
  return { group, entry: desc + (breaking ? ' (BREAKING)' : '') };
}

function renderSection(version, date, groups) {
  const order = ['Features', 'Bug Fixes', 'Performance', 'Refactoring', 'Documentation', 'Tests', 'Chores', 'Other'];
  let out = `\n## ${version} - ${date}\n\n`;
  let any = false;
  for (const name of order) {
    const items = groups[name] || [];
    if (items.length === 0) continue;
    any = true;
    out += `### ${name}\n\n`;
    for (const it of items) {
      out += `- ${it.text}\n`;
    }
    out += '\n';
  }
  if (!any) {
    out += '- No notable changes in this release.\n\n';
  }
  return out;
}

async function main() {
  const version = process.argv[2] || '';
  const lastTag = getLastTag();
  const range = lastTag ? `${lastTag}..HEAD` : '';
  const rawCommits = getCommits(range)
    .filter((c) => c.subject && !/^Merge\s/.test(c.subject));

  const groups = {};
  for (const c of rawCommits) {
    const { group, entry } = classify(c.subject);
    const line = `${entry} (${c.sha})`;
    if (!groups[group]) groups[group] = [];
    groups[group].push({ text: line });
  }

  // Load or create CHANGELOG.md
  const changelogPath = path.join(root, 'CHANGELOG.md');
  const exists = existsSync(changelogPath);
  const existing = exists ? await readFile(changelogPath, 'utf8') : '# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n';

  const headerVersion = version || run('node -p "require(\'./package.json\').version"');
  const section = renderSection(headerVersion, nowDate, groups);

  // Prepend the new section after a top-level title if present
  let updated;
  const titleMatch = existing.match(/^#\s+Changelog\s*\n/);
  if (titleMatch) {
    const idx = titleMatch[0].length;
    updated = existing.slice(0, idx) + section + existing.slice(idx);
  } else {
    updated = section + existing;
  }

  await writeFile(changelogPath, updated);
  console.log(`CHANGELOG.md updated for ${headerVersion} (since ${lastTag || 'repo start'}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
