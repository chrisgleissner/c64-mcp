import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "#test/runner";
import assert from "#test/assert";

const scriptPath = path.resolve("scripts/extract-changelog-entry.mjs");

function createTempChangelog(content) {
  const dir = mkdtempSync(path.join(tmpdir(), "changelog-"));
  const file = path.join(dir, "CHANGELOG.md");
  writeFileSync(file, content, "utf8");
  return { dir, file };
}

function runScript(version, changelogPath) {
  const cwd = path.dirname(changelogPath);
  
  try {
    return execSync(`node ${scriptPath} ${version}`, {
      cwd,
      encoding: "utf8",
    });
  } catch (err) {
    throw new Error(err.stderr || err.message);
  }
}

test("extract-changelog-entry extracts single version", (t) => {
  const content = `# Changelog

## 1.0.0 - 2025-01-15

### Features

- Added new feature
- Improved performance

### Bug Fixes

- Fixed critical bug

## 0.9.0 - 2025-01-01

### Features

- Initial release
`;

  const { dir, file } = createTempChangelog(content);

  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const result = runScript("1.0.0", file);
  assert.ok(result.includes("## 1.0.0 - 2025-01-15"));
  assert.ok(result.includes("### Features"));
  assert.ok(result.includes("- Added new feature"));
  assert.ok(result.includes("- Fixed critical bug"));
  assert.ok(!result.includes("0.9.0"));
});

test("extract-changelog-entry extracts last version", (t) => {
  const content = `# Changelog

## 1.0.0 - 2025-01-15

### Features

- Latest version
`;

  const { dir, file } = createTempChangelog(content);

  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const result = runScript("1.0.0", file);
  assert.ok(result.includes("## 1.0.0 - 2025-01-15"));
  assert.ok(result.includes("- Latest version"));
});

test("extract-changelog-entry handles missing version", (t) => {
  const content = `# Changelog

## 1.0.0 - 2025-01-15

### Features

- Some feature
`;

  const { dir, file } = createTempChangelog(content);

  t.after(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  try {
    runScript("2.0.0", file);
    assert.fail("Should have thrown an error");
  } catch (err) {
    assert.ok(err.message.includes("not found"));
  }
});
