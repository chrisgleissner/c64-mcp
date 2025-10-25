import test from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { createConnectedClient } from "./helpers/mcpTestClient.mjs";
import { startMockC64Server } from "./mockC64Server.mjs";

test("CallTool returns structured error for unknown tools", async () => {
  const connection = await createConnectedClient();
  const { client } = connection;

  try {
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: "nonexistent_tool",
        },
      },
      CallToolResultSchema,
    );

    assert.ok(Array.isArray(result.content), "CallTool result should contain content array");
    assert.ok(result.content.length > 0, "CallTool result should include at least one message");

    const [first] = result.content;
    assert.equal(first.type, "text");
    assert.match(first.text, /Unknown tool/i);

    assert.ok(result.metadata, "CallTool result should include metadata for errors");
    assert.ok(result.metadata.error, "Metadata should expose error details");
    assert.equal(result.metadata.error.kind, "unknown");
  } finally {
    await connection.close();
    const stderrOutput = connection.stderrOutput();
    if (stderrOutput) {
      process.stderr.write(stderrOutput);
    }
  }
});

test("upload_and_run_basic tool proxies to C64 client", async () => {
  const mockServer = await startMockC64Server();

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "c64-mcp-config-"));
  const configPath = path.join(tmpDir, "config.json");
  fs.writeFileSync(configPath, JSON.stringify({ baseUrl: mockServer.baseUrl }), "utf8");

  const connection = await createConnectedClient({
    env: {
      C64MCP_CONFIG: configPath,
      C64_TEST_TARGET: "mock",
    },
  });
  const { client } = connection;

  try {
  const program = `10 PRINT "HELLO"
20 GOTO 10`;
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: "upload_and_run_basic",
          arguments: {
            program,
          },
        },
      },
      CallToolResultSchema,
    );

    assert.ok(Array.isArray(result.content));
    const textContent = result.content.find((entry) => entry.type === "text");
    assert.ok(textContent, "Expected text response content");
    assert.match(textContent.text, /BASIC program uploaded/i);

  assert.ok(result.metadata?.success, "metadata should flag success");
  assert.equal(result.metadata.details?.result ?? "ok", "ok");
    assert.equal(mockServer.state.runCount, 1, "mock server should execute program once");
    assert.ok(mockServer.state.lastPrg, "mock server should receive PRG payload");
  } finally {
    await connection.close();
    await mockServer.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const stderrOutput = connection.stderrOutput();
    if (stderrOutput) {
      process.stderr.write(stderrOutput);
    }
  }
});
