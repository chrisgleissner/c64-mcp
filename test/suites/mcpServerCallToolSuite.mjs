import test from "#test/runner";
import assert from "#test/assert";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

function getTextContent(result) {
  return result.content.find((entry) => entry.type === "text");
}

export function registerMcpServerCallToolTests(withSharedMcpClient) {
  test("CallTool returns structured error for unknown tools", async () => {
    await withSharedMcpClient(async ({ client }) => {
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

      const first = getTextContent(result);
      assert.ok(first, "Expected text response content");
      assert.equal(first.type, "text");
      assert.match(first.text, /Unknown tool/i);

      assert.ok(result.metadata, "CallTool result should include metadata for errors");
      assert.ok(result.metadata?.error, "Metadata should expose error details");
      assert.equal(result.metadata?.error?.kind, "unknown");
    });
  });

  test("c64.program upload_run_basic operation proxies to C64 client", async () => {
    await withSharedMcpClient(async ({ client, mockServer }) => {
      const program = `10 PRINT "HELLO"\n20 GOTO 10`;
      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64.program",
            arguments: {
              op: "upload_run_basic",
              program,
            },
          },
        },
        CallToolResultSchema,
      );

      assert.ok(Array.isArray(result.content));
      const textContent = getTextContent(result);
      assert.ok(textContent, "Expected text response content");
      assert.match(textContent.text, /BASIC program uploaded/i);

      assert.ok(result.metadata?.success, "metadata should flag success");
      assert.equal(result.metadata?.details?.result ?? "ok", "ok");
      assert.equal(mockServer.state.runCount, 1, "mock server should execute program once");
      assert.ok(mockServer.state.lastPrg, "mock server should receive PRG payload");
    });
  });

  test("c64.program upload_run_asm assembles source and runs program", async () => {
    await withSharedMcpClient(async ({ client, mockServer }) => {
      const program = `\n      .org $0801\nstart:\n      lda #$01\n      sta $0400\n      rts\n    `;

      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64.program",
            arguments: {
              op: "upload_run_asm",
              program,
            },
          },
        },
        CallToolResultSchema,
      );

      assert.ok(Array.isArray(result.content));
      const textContent = getTextContent(result);
      assert.ok(textContent, "Expected text response content");
      assert.match(textContent.text, /Assembly program assembled/i);

      assert.ok(result.metadata?.success, "metadata should flag success");
      assert.equal(result.metadata?.details?.result ?? "ok", "ok");
      assert.equal(mockServer.state.runCount, 1, "mock server should execute program once");
      assert.ok(mockServer.state.lastPrg, "mock server should receive PRG payload");
    });
  });

  test("c64.memory read_screen operation returns current PETSCII screen", async () => {
    await withSharedMcpClient(async ({ client }) => {
      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64.memory",
            arguments: {
              op: "read_screen",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.ok(Array.isArray(result.content));
      const textContent = getTextContent(result);
      assert.ok(textContent, "Expected text response content");
      assert.match(textContent.text, /READY/i);

      assert.ok(result.metadata?.success, "metadata should flag success");
      assert.equal(typeof result.metadata?.screen, "string", "metadata should embed screen contents");
      assert.match(String(result.metadata?.screen), /READY/i);
    });
  });

  test("c64.memory read operation returns hex dump with metadata", async () => {
    await withSharedMcpClient(async ({ client }) => {
      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64.memory",
            arguments: {
              op: "read",
              address: "$0400",
              length: 8,
            },
          },
        },
        CallToolResultSchema,
      );

      assert.ok(Array.isArray(result.content));
      const textContent = getTextContent(result);
      assert.ok(textContent, "Expected text response content");
      assert.match(textContent.text, /Read 8 bytes starting at \$0400/);

      assert.ok(result.metadata?.success, "metadata should flag success");
      assert.equal(result.metadata?.address, "$0400");
      assert.equal(result.metadata?.length, 8);
      assert.equal(result.metadata?.hexData, "$1252454144592E0D");
    });
  });

  test("c64.memory write operation writes bytes to mock C64", async () => {
    await withSharedMcpClient(async ({ client, mockServer }) => {
      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64.memory",
            arguments: {
              op: "write",
              address: "$0400",
              bytes: "$AA55",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.ok(Array.isArray(result.content));
      const textContent = getTextContent(result);
      assert.ok(textContent, "Expected text response content");
      assert.match(textContent.text, /Wrote/);

      assert.ok(result.metadata?.success, "metadata should flag success");
      assert.equal(result.metadata?.address, "$0400");
      assert.equal(result.metadata?.bytes, "$AA55");

      assert.equal(mockServer.state.lastWrite?.address, 0x0400);
      assert.deepEqual([...mockServer.state.lastWrite?.bytes ?? []], [0xaa, 0x55]);
    });
  });

  test("c64.sound operations operate via MCP", async () => {
    await withSharedMcpClient(async ({ client, mockServer }) => {
      const volumeResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64.sound",
            arguments: {
              op: "set_volume",
              volume: 12,
            },
          },
        },
        CallToolResultSchema,
      );

  assert.ok(volumeResult.metadata?.success, "set_volume should succeed");
      assert.equal(volumeResult.metadata?.appliedVolume, 12);
      assert.equal(mockServer.state.lastWrite?.address, 0xd418);
      assert.equal(mockServer.state.lastWrite?.bytes[0], 12);

      const noteOnResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64.sound",
            arguments: {
              op: "note_on",
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

  assert.ok(noteOnResult.metadata?.success, "note_on should succeed");
      assert.equal(noteOnResult.metadata?.voice, 2);
      assert.equal(mockServer.state.lastWrite?.address, 0xd407);
      assert.equal(mockServer.state.lastWrite?.bytes.length, 7);

      const noteOffResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64.sound",
            arguments: {
              op: "note_off",
              voice: 2,
            },
          },
        },
        CallToolResultSchema,
      );

      assert.ok(noteOffResult.metadata?.success, "note_off should succeed");
      assert.equal(noteOffResult.metadata?.voice, 2);
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
      assert.equal(resetResult.metadata?.mode, "hard");
      assert.equal(mockServer.state.lastWrite?.address, 0xd400);
      assert.equal(mockServer.state.lastWrite?.bytes.length, 0x19);
      assert.ok(mockServer.state.lastWrite?.bytes.every((byte) => byte === 0x00));
    });
  });

  test("c64.system operations operate via MCP", async () => {
    await withSharedMcpClient(async ({ client, mockServer }) => {
      const pauseResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64.system",
            arguments: { op: "pause" },
          },
        },
        CallToolResultSchema,
      );

      assert.ok(pauseResult.metadata?.success, "pause operation should succeed");
      assert.equal(mockServer.state.paused, true, "machine should be paused");

      const resumeResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64.system",
            arguments: { op: "resume" },
          },
        },
        CallToolResultSchema,
      );

      assert.ok(resumeResult.metadata?.success, "resume operation should succeed");
      assert.equal(mockServer.state.paused, false, "machine should be resumed");

      const resetResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64.system",
            arguments: { op: "reset" },
          },
        },
        CallToolResultSchema,
      );

      assert.ok(resetResult.metadata?.success, "reset operation should succeed");
      assert.equal(mockServer.state.resets, 1, "reset endpoint should be invoked once");

      const rebootResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64.system",
            arguments: { op: "reboot" },
          },
        },
        CallToolResultSchema,
      );

      assert.ok(rebootResult.metadata?.success, "reboot operation should succeed");
      assert.equal(mockServer.state.reboots, 1, "reboot endpoint should be invoked once");

    });
  });

  test("Machine control tools operate via MCP", async () => {
    await withSharedMcpClient(async ({ client, mockServer }) => {
      const resetResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "reset_c64",
            arguments: {},
          },
        },
        CallToolResultSchema,
      );

      assert.ok(resetResult.metadata?.success, "reset_c64 should succeed");
      assert.equal(mockServer.state.resets, 1, "reset endpoint should be invoked once");

      const rebootResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "reboot_c64",
            arguments: {},
          },
        },
        CallToolResultSchema,
      );

      assert.ok(rebootResult.metadata?.success, "reboot_c64 should succeed");
      assert.equal(mockServer.state.reboots, 1, "reboot endpoint should be invoked once");

      const pauseResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "pause",
            arguments: {},
          },
        },
        CallToolResultSchema,
      );

      assert.ok(pauseResult.metadata?.success, "pause should succeed");
      assert.equal(mockServer.state.paused, true, "machine should be paused");

      const resumeResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "resume",
            arguments: {},
          },
        },
        CallToolResultSchema,
      );

      assert.ok(resumeResult.metadata?.success, "resume should succeed");
      assert.equal(mockServer.state.paused, false, "machine should be resumed");

      const debugReadResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "debugreg_read",
            arguments: {},
          },
        },
        CallToolResultSchema,
      );

      assert.ok(debugReadResult.metadata?.success, "debugreg_read should succeed");
      assert.equal(debugReadResult.metadata?.value, "00");

      const debugWriteResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "debugreg_write",
            arguments: {
              value: "AB",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.ok(debugWriteResult.metadata?.success, "debugreg_write should succeed");
      assert.equal(debugWriteResult.metadata?.value, "AB");
      assert.equal(mockServer.state.debugreg, "AB");

      const versionResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "version",
            arguments: {},
          },
        },
        CallToolResultSchema,
      );

      const versionContent = getTextContent(versionResult);
      assert.ok(versionContent, "version tool should return text content");
      assert.equal(versionResult.metadata?.success, true);
      assert.equal(versionResult.metadata?.details?.version, "0.1-mock");

      const infoResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "info",
            arguments: {},
          },
        },
        CallToolResultSchema,
      );

      const infoContent = getTextContent(infoResult);
      assert.ok(infoContent, "info tool should return text content");
      assert.equal(infoResult.metadata?.success, true);
      assert.equal(infoResult.metadata?.details?.product, "U64-MOCK");
    });
  });

  test("Developer configuration tools operate via MCP", async () => {
    await withSharedMcpClient(async ({ client, mockServer }) => {
      const listResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "config_list",
            arguments: {},
          },
        },
        CallToolResultSchema,
      );

      assert.equal(listResult.metadata?.success, true, "config_list should succeed");
  const listContent = getTextContent(listResult);
  assert.ok(listContent, "config_list should return text content");
  const categories = JSON.parse(listContent.text)?.categories ?? [];
      assert.ok(Array.isArray(categories), "config_list should return categories array");
      assert.ok(categories.includes("Audio"));
  assert.equal(listResult.structuredContent?.type, "json");
  assert.deepEqual(listResult.structuredContent?.data?.categories, categories);

      const getItemResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "config_get",
            arguments: {
              category: "Audio",
              item: "Volume",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(getItemResult.metadata?.success, true, "config_get should succeed");
      assert.equal(getItemResult.metadata?.category, "Audio");
      assert.equal(getItemResult.metadata?.item, "Volume");

      const setResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "config_set",
            arguments: {
              category: "Audio",
              item: "Volume",
              value: 11,
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(setResult.metadata?.success, true, "config_set should succeed");
      assert.equal(mockServer.state.configs.Audio.Volume, "11");

      const batchResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "config_batch_update",
            arguments: {
              Audio: {
                Balance: "left",
              },
              Video: {
                Mode: "NTSC",
              },
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(batchResult.metadata?.success, true, "config_batch_update should succeed");
      assert.equal(mockServer.state.configs.Audio.Balance, "left");
      assert.equal(mockServer.state.configs.Video.Mode, "NTSC");

      const saveResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "config_save_to_flash",
            arguments: {},
          },
        },
        CallToolResultSchema,
      );

      assert.equal(saveResult.metadata?.success, true, "config_save_to_flash should succeed");
      assert.ok(mockServer.state.flashSnapshot, "flash snapshot should be captured after save");

      const resetResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "config_reset_to_default",
            arguments: {},
          },
        },
        CallToolResultSchema,
      );

      assert.equal(resetResult.metadata?.success, true, "config_reset_to_default should succeed");
      assert.equal(mockServer.state.configs.Audio.Volume, "6", "reset should restore default volume");

      const loadResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "config_load_from_flash",
            arguments: {},
          },
        },
        CallToolResultSchema,
      );

      assert.equal(loadResult.metadata?.success, true, "config_load_from_flash should succeed");
      assert.equal(mockServer.state.configs.Video.Mode, "NTSC", "load should restore saved snapshot");
    });
  });

  test("Streaming tools operate via MCP", async () => {
    await withSharedMcpClient(async ({ client, mockServer }) => {
      const startResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "stream_start",
            arguments: {
              stream: "audio",
              target: "127.0.0.1:9000",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(startResult.metadata?.success, true, "stream_start should succeed");
      assert.equal(mockServer.state.streams.audio.active, true);
      assert.equal(mockServer.state.streams.audio.target, "127.0.0.1:9000");

      const stopResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "stream_stop",
            arguments: {
              stream: "audio",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(stopResult.metadata?.success, true, "stream_stop should succeed");
      assert.equal(mockServer.state.streams.audio.active, false);
    });
  });

  test("Drive and storage tools operate via MCP", async () => {
    await withSharedMcpClient(async ({ client, mockServer }) => {
      const listResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "drives_list",
            arguments: {},
          },
        },
        CallToolResultSchema,
      );

      assert.equal(listResult.metadata?.success, true, "drives_list should succeed");
      assert.ok(listResult.metadata?.drives, "drives_list should include drive metadata");

      const mountResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "drive_mount",
            arguments: {
              drive: "drive8",
              image: "/tmp/demo.d64",
              type: "d64",
              mode: "readwrite",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(mountResult.metadata?.success, true, "drive_mount should succeed");
      assert.equal(mockServer.state.lastDriveOperation?.action, "mount");
      assert.deepEqual(mockServer.state.drives.drive8.mountedImage, {
        image: "/tmp/demo.d64",
        type: "d64",
        mode: "readwrite",
      });

      const modeResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "drive_mode",
            arguments: {
              drive: "drive8",
              mode: "1571",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(modeResult.metadata?.success, true, "drive_mode should succeed");
      assert.equal(mockServer.state.drives.drive8.mode, "1571");

      const onResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "drive_on",
            arguments: {
              drive: "drive8",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(onResult.metadata?.success, true, "drive_on should succeed");
      assert.equal(mockServer.state.drives.drive8.power, "on");

      const offResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "drive_off",
            arguments: {
              drive: "drive8",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(offResult.metadata?.success, true, "drive_off should succeed");
      assert.equal(mockServer.state.drives.drive8.power, "off");

      const resetResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "drive_reset",
            arguments: {
              drive: "drive8",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(resetResult.metadata?.success, true, "drive_reset should succeed");
      assert.equal(mockServer.state.drives.drive8.resetCount, 1);

      const romResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "drive_load_rom",
            arguments: {
              drive: "drive8",
              path: "/roms/custom.rom",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(romResult.metadata?.success, true, "drive_load_rom should succeed");
      assert.equal(mockServer.state.drives.drive8.lastRom, "/roms/custom.rom");

      const removeResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "drive_remove",
            arguments: {
              drive: "drive8",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(removeResult.metadata?.success, true, "drive_remove should succeed");
      assert.equal(mockServer.state.drives.drive8.mountedImage, null);

      const infoResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "file_info",
            arguments: {
              path: "/tmp/demo.d64",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(infoResult.metadata?.success, true, "file_info should succeed");
      assert.equal(mockServer.state.lastFileInfo, "/tmp/demo.d64");

      const createD64Result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "create_d64",
            arguments: {
              path: "/tmp/new.d64",
              tracks: 35,
              diskname: "DISK1",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(createD64Result.metadata?.success, true, "create_d64 should succeed");

      const createD71Result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "create_d71",
            arguments: {
              path: "/tmp/new.d71",
              diskname: "DISK2",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(createD71Result.metadata?.success, true, "create_d71 should succeed");

      const createD81Result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "create_d81",
            arguments: {
              path: "/tmp/new.d81",
              diskname: "DISK3",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(createD81Result.metadata?.success, true, "create_d81 should succeed");

      const createDnpResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "create_dnp",
            arguments: {
              path: "/tmp/new.dnp",
              tracks: 80,
              diskname: "DISK4",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(createDnpResult.metadata?.success, true, "create_dnp should succeed");
      assert.equal(mockServer.state.createdImages.length, 4, "All disk creations should be tracked");
      const createdTypes = mockServer.state.createdImages.map((entry) => entry.type).sort();
      assert.deepEqual(createdTypes, ["d64", "d71", "d81", "dnp"], "Disk creation types should match requests");
    });
  });
}
