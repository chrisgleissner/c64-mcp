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

test("upload_and_run_asm tool assembles source and runs program", async () => {
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
    const program = `
      .org $0801
start:
      lda #$01
      sta $0400
      rts
    `;

    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: "upload_and_run_asm",
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
    assert.match(textContent.text, /Assembly program assembled/i);

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

test("read_screen tool returns current PETSCII screen", async () => {
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
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: "read_screen",
          arguments: {},
        },
      },
      CallToolResultSchema,
    );

    assert.ok(Array.isArray(result.content));
    const textContent = result.content.find((entry) => entry.type === "text");
    assert.ok(textContent, "Expected text response content");
    assert.match(textContent.text, /READY/i);

    assert.ok(result.metadata?.success, "metadata should flag success");
    assert.equal(typeof result.metadata.screen, "string", "metadata should embed screen contents");
    assert.match(String(result.metadata.screen), /READY/i);
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

test("read_memory tool returns hex dump with metadata", async () => {
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
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: "read_memory",
          arguments: {
            address: "$0400",
            length: 8,
          },
        },
      },
      CallToolResultSchema,
    );

    assert.ok(Array.isArray(result.content));
    const textContent = result.content.find((entry) => entry.type === "text");
    assert.ok(textContent, "Expected text response content");
    assert.match(textContent.text, /Read 8 bytes starting at \$0400/);

    assert.ok(result.metadata?.success, "metadata should flag success");
    assert.equal(result.metadata.address, "$0400");
    assert.equal(result.metadata.length, 8);
    assert.equal(result.metadata.hexData, "$1252454144592E0D");
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

test("write_memory tool writes bytes to mock C64", async () => {
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
    const result = await client.request(
      {
        method: "tools/call",
        params: {
          name: "write_memory",
          arguments: {
            address: "$0400",
            bytes: "$AA55",
          },
        },
      },
      CallToolResultSchema,
    );

    assert.ok(Array.isArray(result.content));
    const textContent = result.content.find((entry) => entry.type === "text");
    assert.ok(textContent, "Expected text response content");
    assert.match(textContent.text, /Wrote/);

    assert.ok(result.metadata?.success, "metadata should flag success");
    assert.equal(result.metadata.address, "$0400");
    assert.equal(result.metadata.bytes, "$AA55");

    assert.equal(mockServer.state.lastWrite?.address, 0x0400);
    assert.deepEqual([...mockServer.state.lastWrite?.bytes ?? []], [0xaa, 0x55]);
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

test("SID control tools operate via MCP", async () => {
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
    const volumeResult = await client.request(
      {
        method: "tools/call",
        params: {
          name: "sid_volume",
          arguments: {
            volume: 12,
          },
        },
      },
      CallToolResultSchema,
    );

    assert.ok(volumeResult.metadata?.success, "sid_volume should succeed");
    assert.equal(volumeResult.metadata.appliedVolume, 12);
    assert.equal(mockServer.state.lastWrite?.address, 0xd418);
    assert.equal(mockServer.state.lastWrite?.bytes[0], 12);

    const noteOnResult = await client.request(
      {
        method: "tools/call",
        params: {
          name: "sid_note_on",
          arguments: {
            voice: 2,
            note: "C4",
            waveform: "tri",
            pulseWidth: 0x0400,
            attack: 2,
            decay: 5,
            sustain: 8,
            release: 4,
          },
        },
      },
      CallToolResultSchema,
    );

    assert.ok(noteOnResult.metadata?.success, "sid_note_on should succeed");
    assert.equal(noteOnResult.metadata.voice, 2);
    assert.equal(mockServer.state.lastWrite?.address, 0xd407);
    assert.equal(mockServer.state.lastWrite?.bytes.length, 7);

    const noteOffResult = await client.request(
      {
        method: "tools/call",
        params: {
          name: "sid_note_off",
          arguments: {
            voice: 2,
          },
        },
      },
      CallToolResultSchema,
    );

    assert.ok(noteOffResult.metadata?.success, "sid_note_off should succeed");
    assert.equal(noteOffResult.metadata.voice, 2);
    assert.equal(mockServer.state.lastWrite?.address, 0xd40b);
    assert.equal(mockServer.state.lastWrite?.bytes[0], 0x00);

    const silenceResult = await client.request(
      {
        method: "tools/call",
        params: {
          name: "sid_silence_all",
          arguments: {},
        },
      },
      CallToolResultSchema,
    );

    assert.ok(silenceResult.metadata?.success, "sid_silence_all should succeed");
    assert.equal(mockServer.state.lastWrite?.address, 0xd418);
    assert.equal(mockServer.state.lastWrite?.bytes[0], 0x00);

    const resetResult = await client.request(
      {
        method: "tools/call",
        params: {
          name: "sid_reset",
          arguments: {
            hard: true,
          },
        },
      },
      CallToolResultSchema,
    );

    assert.ok(resetResult.metadata?.success, "sid_reset should succeed");
    assert.equal(resetResult.metadata.mode, "hard");
    assert.equal(mockServer.state.lastWrite?.address, 0xd400);
    assert.equal(mockServer.state.lastWrite?.bytes.length, 0x19);
    assert.ok(mockServer.state.lastWrite?.bytes.every((byte) => byte === 0x00));
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
