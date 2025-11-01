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

  test("c64_program upload_run_basic operation proxies to C64 client", async () => {
    await withSharedMcpClient(async ({ client, mockServer }) => {
      const program = `10 PRINT "HELLO"\n20 GOTO 10`;
      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64_program",
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

  test("c64_program upload_run_asm assembles source and runs program", async () => {
    await withSharedMcpClient(async ({ client, mockServer }) => {
      const program = `\n      .org $0801\nstart:\n      lda #$01\n      sta $0400\n      rts\n    `;

      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64_program",
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

  test("c64_memory read_screen operation returns current PETSCII screen", async () => {
    await withSharedMcpClient(async ({ client }) => {
      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64_memory",
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

  test("c64_memory read operation returns hex dump with metadata", async () => {
    await withSharedMcpClient(async ({ client }) => {
      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64_memory",
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

  test("c64_memory write operation writes bytes to mock C64", async () => {
    await withSharedMcpClient(async ({ client, mockServer }) => {
      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64_memory",
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

  test("c64_sound operations operate via MCP", async () => {
    await withSharedMcpClient(async ({ client, mockServer }) => {
      const volumeResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64_sound",
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
            name: "c64_sound",
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
            name: "c64_sound",
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
            name: "c64_sound",
            arguments: {
              op: "silence_all",
            },
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
            name: "c64_sound",
            arguments: {
              op: "reset",
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

  test("c64_system operations operate via MCP", async () => {
    await withSharedMcpClient(async ({ client, mockServer }) => {
      const pauseResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64_system",
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
            name: "c64_system",
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
            name: "c64_system",
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
            name: "c64_system",
            arguments: { op: "reboot" },
          },
        },
        CallToolResultSchema,
      );

      assert.ok(rebootResult.metadata?.success, "reboot operation should succeed");
      assert.equal(mockServer.state.reboots, 1, "reboot endpoint should be invoked once");

    });
  });

  test("c64_graphics create_petscii dry run returns art metadata", async () => {
    await withSharedMcpClient(async ({ client }) => {
      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64_graphics",
            arguments: {
              op: "create_petscii",
              prompt: "c64 logo",
              dryRun: true,
            },
          },
        },
        CallToolResultSchema,
      );

      assert.ok(Array.isArray(result.content));
      const textContent = getTextContent(result);
      assert.ok(textContent, "Expected text response content");
      assert.match(textContent.text, /petsciiCodes/i);

      assert.equal(result.metadata?.dryRun, true);
      assert.equal(result.metadata?.ranOnC64, false);
      assert.ok(result.structuredContent?.data?.program, "should include generated BASIC program");
      assert.ok(result.structuredContent?.data?.petsciiCodes?.length > 0, "should include petscii codes");
    });
  });

  test("c64_rag basic retrieval returns references", async () => {
    await withSharedMcpClient(async ({ client }) => {
      const result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64_rag",
            arguments: {
              op: "basic",
              q: "print reverse text",
              k: 2,
            },
          },
        },
        CallToolResultSchema,
      );

      assert.ok(Array.isArray(result.content));
      const textContent = getTextContent(result);
      assert.ok(textContent, "Expected text response content");
      assert.match(textContent.text, /Primary knowledge resources/i);

      assert.ok(result.metadata?.success, "metadata should flag success");
      assert.ok(result.structuredContent?.data?.refs, "should return structured refs");
      assert.ok(result.structuredContent?.data?.refs.length <= 2);
    });
  });

  test("Developer configuration tools operate via MCP", async () => {
    await withSharedMcpClient(async ({ client, mockServer }) => {
      const listResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64_config",
            arguments: {
              op: "list",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(listResult.metadata?.success, true, "list operation should succeed");
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
            name: "c64_config",
            arguments: {
              op: "get",
              category: "Audio",
              item: "Volume",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(getItemResult.metadata?.success, true, "get operation should succeed");
      assert.equal(getItemResult.metadata?.category, "Audio");
      assert.equal(getItemResult.metadata?.item, "Volume");

      const setResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64_config",
            arguments: {
              op: "set",
              category: "Audio",
              item: "Volume",
              value: 11,
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(setResult.metadata?.success, true, "set operation should succeed");
      assert.equal(mockServer.state.configs.Audio.Volume, "11");

      const batchResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64_config",
            arguments: {
              op: "batch_update",
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

      assert.equal(batchResult.metadata?.success, true, "batch_update operation should succeed");
      assert.equal(mockServer.state.configs.Audio.Balance, "left");
      assert.equal(mockServer.state.configs.Video.Mode, "NTSC");

      const saveResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64_config",
            arguments: {
              op: "save_flash",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(saveResult.metadata?.success, true, "save_flash operation should succeed");
      assert.ok(mockServer.state.flashSnapshot, "flash snapshot should be captured after save");

      const resetResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64_config",
            arguments: {
              op: "reset_defaults",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(resetResult.metadata?.success, true, "reset_defaults operation should succeed");
      assert.equal(mockServer.state.configs.Audio.Volume, "6", "reset should restore default volume");

      const loadResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64_config",
            arguments: {
              op: "load_flash",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(loadResult.metadata?.success, true, "load_flash operation should succeed");
      assert.equal(mockServer.state.configs.Video.Mode, "NTSC", "load should restore saved snapshot");
    });
  });

  test("Streaming tools operate via MCP", async () => {
    await withSharedMcpClient(async ({ client, mockServer }) => {
      const startResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64_stream",
            arguments: {
              op: "start",
              stream: "audio",
              target: "127.0.0.1:9000",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(startResult.metadata?.success, true, "start operation should succeed");
      assert.equal(mockServer.state.streams.audio.active, true);
      assert.equal(mockServer.state.streams.audio.target, "127.0.0.1:9000");

      const stopResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64_stream",
            arguments: {
              op: "stop",
              stream: "audio",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(stopResult.metadata?.success, true, "stop operation should succeed");
      assert.equal(mockServer.state.streams.audio.active, false);
    });
  });

  test("Drive and storage tools operate via MCP", async () => {
    await withSharedMcpClient(async ({ client, mockServer }) => {
      const listResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64_disk",
            arguments: {
              op: "list_drives",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(listResult.metadata?.success, true, "list_drives operation should succeed");
      assert.ok(listResult.metadata?.drives, "drives_list should include drive metadata");

      const mountResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64_disk",
            arguments: {
              op: "mount",
              drive: "drive8",
              image: "/tmp/demo.d64",
              type: "d64",
              attachmentMode: "readwrite",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(mountResult.metadata?.success, true, "mount operation should succeed");
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
            name: "c64_drive",
            arguments: {
              op: "set_mode",
              drive: "drive8",
              mode: "1571",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(modeResult.metadata?.success, true, "set_mode operation should succeed");
      assert.equal(mockServer.state.drives.drive8.mode, "1571");

      const onResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64_drive",
            arguments: {
              op: "power_on",
              drive: "drive8",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(onResult.metadata?.success, true, "power_on operation should succeed");
      assert.equal(mockServer.state.drives.drive8.power, "on");

      const offResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64_drive",
            arguments: {
              op: "power_off",
              drive: "drive8",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(offResult.metadata?.success, true, "power_off operation should succeed");
      assert.equal(mockServer.state.drives.drive8.power, "off");

      const resetResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64_drive",
            arguments: {
              op: "reset",
              drive: "drive8",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(resetResult.metadata?.success, true, "reset operation should succeed");
      assert.equal(mockServer.state.drives.drive8.resetCount, 1);

      const romResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64_drive",
            arguments: {
              op: "load_rom",
              drive: "drive8",
              path: "/roms/custom.rom",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(romResult.metadata?.success, true, "load_rom operation should succeed");
      assert.equal(mockServer.state.drives.drive8.lastRom, "/roms/custom.rom");

      const removeResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64_disk",
            arguments: {
              op: "unmount",
              drive: "drive8",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(removeResult.metadata?.success, true, "unmount operation should succeed");
      assert.equal(mockServer.state.drives.drive8.mountedImage, null);

      const infoResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64_disk",
            arguments: {
              op: "file_info",
              path: "/tmp/demo.d64",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(infoResult.metadata?.success, true, "file_info operation should succeed");
      assert.equal(mockServer.state.lastFileInfo, "/tmp/demo.d64");

      const createD64Result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64_disk",
            arguments: {
              op: "create_image",
              format: "d64",
              path: "/tmp/new.d64",
              tracks: 35,
              diskname: "DISK1",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(createD64Result.metadata?.success, true, "create_image (d64) should succeed");

      const createD71Result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64_disk",
            arguments: {
              op: "create_image",
              format: "d71",
              path: "/tmp/new.d71",
              diskname: "DISK2",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(createD71Result.metadata?.success, true, "create_image (d71) should succeed");

      const createD81Result = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64_disk",
            arguments: {
              op: "create_image",
              format: "d81",
              path: "/tmp/new.d81",
              diskname: "DISK3",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(createD81Result.metadata?.success, true, "create_image (d81) should succeed");

      const createDnpResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "c64_disk",
            arguments: {
              op: "create_image",
              format: "dnp",
              path: "/tmp/new.dnp",
              tracks: 80,
              diskname: "DISK4",
            },
          },
        },
        CallToolResultSchema,
      );

      assert.equal(createDnpResult.metadata?.success, true, "create_image (dnp) should succeed");
      assert.equal(mockServer.state.createdImages.length, 4, "All disk creations should be tracked");
      const createdTypes = mockServer.state.createdImages.map((entry) => entry.type).sort();
      assert.deepEqual(createdTypes, ["d64", "d71", "d81", "dnp"], "Disk creation types should match requests");
    });
  });
}
