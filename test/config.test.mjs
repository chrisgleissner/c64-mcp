import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig, __resetConfigCacheForTests } from "../src/config.ts";

function writeTempConfig(contents) {
  const dir = mkdtempSync(path.join(tmpdir(), "c64-config-"));
  const file = path.join(dir, ".c64mcp.json");
  writeFileSync(file, JSON.stringify(contents, null, 2), "utf8");
  return { dir, file };
}

test("loadConfig supports host/port schema", (t) => {
  const originalEnv = process.env.C64MCP_CONFIG;
  const { dir, file } = writeTempConfig({
    c64u: {
      host: "example.local",
      port: 6581,
    },
  });

  process.env.C64MCP_CONFIG = file;
  __resetConfigCacheForTests();

  const config = loadConfig();
  assert.equal(config.c64_host, "example.local:6581");
  assert.equal(config.baseUrl, "http://example.local:6581");
  assert.equal(config.c64_port, 6581);

  t.after(() => {
    __resetConfigCacheForTests();
    if (originalEnv === undefined) {
      delete process.env.C64MCP_CONFIG;
    } else {
      process.env.C64MCP_CONFIG = originalEnv;
    }
    rmSync(dir, { recursive: true, force: true });
  });
});

test("loadConfig defaults port when omitted", (t) => {
  const originalEnv = process.env.C64MCP_CONFIG;
  const { dir, file } = writeTempConfig({
    c64u: {
      host: "c64u",
    },
  });

  process.env.C64MCP_CONFIG = file;
  __resetConfigCacheForTests();

  const config = loadConfig();
  assert.equal(config.c64_host, "c64u");
  assert.equal(config.baseUrl, "http://c64u");
  assert.equal(config.c64_port, 80);

  t.after(() => {
    __resetConfigCacheForTests();
    if (originalEnv === undefined) {
      delete process.env.C64MCP_CONFIG;
    } else {
      process.env.C64MCP_CONFIG = originalEnv;
    }
    rmSync(dir, { recursive: true, force: true });
  });
});
