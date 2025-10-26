#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';

/**
 * Deduplicate bullet items within the latest release section of CHANGELOG.md.
 * Dedupe is based on the bullet text excluding the trailing short SHA in parens.
 * If a group becomes empty after dedupe, the group heading is removed.
 */
async function main() {
  const changelogPath = 'CHANGELOG.md';
  const original = await readFile(changelogPath, 'utf8');

  // Find the first release section after the top-level title
  const lines = original.split(/\r?\n/);

  // Find start of the first section header (## X.Y.Z - YYYY-MM-DD)
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+\d+\.\d+\.\d+\s+-\s+\d{4}-\d{2}-\d{2}\s*$/.test(lines[i])) {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) {
    console.error('No release section found to deduplicate.');
    return;
  }

  // Find end of this section (next section header or EOF)
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^##\s+\d+\.\d+\.\d+\s+-\s+\d{4}-\d{2}-\d{2}\s*$/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }

  const before = lines.slice(0, startIdx);
  const section = lines.slice(startIdx, endIdx);
  const after = lines.slice(endIdx);

  // Process the section: keep header line and dedupe within each group
  const newSection = [];
  const headerLine = section[0];
  newSection.push(headerLine);

  let i = 1; // start processing after header
  while (i < section.length) {
    const line = section[i];

    // Preserve blank lines following header or between groups
    if (line.trim() === '') {
      newSection.push(line);
      i++;
      continue;
    }

    // Expect group heading like "### Features"
    if (/^###\s+/.test(line)) {
      const groupHeading = line;
      const groupBuffer = [];
      const seenKeys = new Set();

      // Include the heading now; we may remove it later if empty
      const headingIndexInNewSection = newSection.length;
      newSection.push(groupHeading);

      // Consume until next heading or next section header or EOF
      i++;
      // Capture optional blank line following heading
      if (i < section.length && section[i].trim() === '') {
        // defer adding blank line; we'll manage spacing later
        i++;
      }

      while (i < section.length && !/^###\s+/.test(section[i]) && !/^##\s+\d+\.\d+\.\d+\s+-\s+\d{4}-\d{2}-\d{2}\s*$/.test(section[i])) {
        const current = section[i];
        if (/^-\s+/.test(current)) {
          const bullet = current.replace(/^-(\s+)/, '- ');
          // Key without trailing short SHA in parentheses
          const key = bullet
            .replace(/\s*\([0-9a-f]{7,}\)\s*$/, '')
            .trim()
            .toLowerCase();
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            groupBuffer.push(bullet);
          }
        }
        i++;
      }

      if (groupBuffer.length > 0) {
        // Add a blank line then bullets, then a trailing blank line
        newSection.push('');
        for (const b of groupBuffer) newSection.push(b);
        newSection.push('');
      } else {
        // Remove the heading we added since there are no bullets
        newSection.splice(headingIndexInNewSection, 1);
      }

      continue; // continue outer while without i++ (already moved)
    }

    // Any other content line in the section, keep as-is
    newSection.push(line);
    i++;
  }

  // Collapse excessive blank lines (max two in a row)
  const collapsed = [];
  let blankRun = 0;
  for (const l of newSection) {
    if (l.trim() === '') {
      blankRun++;
      if (blankRun <= 2) collapsed.push('');
    } else {
      blankRun = 0;
      collapsed.push(l);
    }
  }

  const updated = [...before, ...collapsed, ...after].join('\n');
  await writeFile(changelogPath, updated);
  console.log('CHANGELOG.md deduplicated for latest section.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
