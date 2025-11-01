import test from "#test/runner";
import assert from "#test/assert";
import fs from "node:fs/promises";
import { toolRegistry } from "../src/tools/registry/index.js";
import { metaModule } from "../src/tools/meta/index.js";
import { ToolValidationError } from "../src/tools/errors.js";
import { getPlatformStatus, setPlatform } from "../src/platform.js";
import { createLogger, tmpPath } from "./meta/helpers.mjs";

const originalPlatform = getPlatformStatus().id;

test.after(() => {
  setPlatform(originalPlatform);
});

test("grouped tools appear in registry list", () => {
  const toolNames = toolRegistry.list().map((descriptor) => descriptor.name);
  assert.ok(toolNames.includes("c64_program"), "c64_program should be registered");
  assert.ok(toolNames.includes("c64_memory"), "c64_memory should be registered");
  assert.ok(toolNames.includes("c64_sound"), "c64_sound should be registered");
  assert.ok(toolNames.includes("c64_system"), "c64_system should be registered");
  assert.ok(toolNames.includes("c64_debug"), "c64_debug should be registered");
  assert.ok(toolNames.includes("c64_graphics"), "c64_graphics should be registered");
  assert.ok(toolNames.includes("c64_rag"), "c64_rag should be registered");
  assert.ok(toolNames.includes("c64_disk"), "c64_disk should be registered");
  assert.ok(toolNames.includes("c64_drive"), "c64_drive should be registered");
  assert.ok(toolNames.includes("c64_printer"), "c64_printer should be registered");
  assert.ok(toolNames.includes("c64_config"), "c64_config should be registered");
  assert.ok(toolNames.includes("c64_extract"), "c64_extract should be registered");
  assert.ok(toolNames.includes("c64_stream"), "c64_stream should be registered");
  assert.ok(toolNames.includes("c64_vice"), "c64_vice should be registered");
});

test("registry only exposes grouped tool names", () => {
  const toolNames = toolRegistry.list().map((descriptor) => descriptor.name);
  for (const name of toolNames) {
    assert.ok(name.startsWith("c64_"), `unexpected legacy tool visible in registry: ${name}`);
  }
});

test("c64_program run_prg delegates to legacy handler", async () => {
  const calls = [];
  const stubClient = {
    async runPrgFile(path) {
      calls.push({ method: "runPrgFile", path });
      return { success: true, details: {} };
    },
    async uploadAndRunBasic() {
      throw new Error("not used");
    },
    async uploadAndRunAsm() {
      throw new Error("not used");
    },
    async loadPrgFile() {
      throw new Error("not used");
    },
    async runCrtFile() {
      throw new Error("not used");
    },
  };

  const ctx = {
    client: stubClient,
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const result = await toolRegistry.invoke("c64_program", { op: "run_prg", path: "//USB0/demo.prg" }, ctx);
  assert.equal(result.isError, undefined);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "runPrgFile");
  assert.equal(calls[0].path, "//USB0/demo.prg");
});

test("c64_program upload_run_basic uses shared BASIC handler", async () => {
  const uploads = [];
  let screenReads = 0;
  const stubClient = {
    async runPrgFile() {
      throw new Error("not used");
    },
    async uploadAndRunBasic(program) {
      uploads.push(program);
      return { success: true };
    },
    async uploadAndRunAsm() {
      throw new Error("not used");
    },
    async loadPrgFile() {
      throw new Error("not used");
    },
    async runCrtFile() {
      throw new Error("not used");
    },
    async readScreen() {
      screenReads += 1;
      return "READY.\n";
    },
  };

  const ctx = {
    client: stubClient,
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const result = await toolRegistry.invoke(
    "c64_program",
    { op: "upload_run_basic", program: '10 PRINT "HI"\n20 END' },
    ctx,
  );

  assert.equal(result.isError, undefined);
  assert.equal(uploads.length, 1);
  assert.ok(screenReads >= 1);
});

test("c64_memory read delegates to legacy handler", async () => {
  const calls = [];
  const stubClient = {
    async readMemory(address, length) {
      calls.push({ method: "readMemory", address, length });
      return { success: true, data: "$AA", details: { address: "0400", length: 1 } };
    },
    async writeMemory() {
      throw new Error("not used");
    },
    async readScreen() {
      return "READY.";
    },
  };

  const ctx = {
    client: stubClient,
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const result = await toolRegistry.invoke("c64_memory", { op: "read", address: "$0400", length: 1 }, ctx);
  assert.equal(result.isError, undefined);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "readMemory");
  assert.equal(calls[0].address, "$0400");
  assert.equal(calls[0].length, "1");
});

test("c64_memory wait_for_text polls screen", async () => {
  let readCount = 0;
  const stubClient = {
    async readMemory() {
      throw new Error("not used");
    },
    async writeMemory() {
      throw new Error("not used");
    },
    async readScreen() {
      readCount += 1;
      return "READY.";
    },
  };

  const ctx = {
    client: stubClient,
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const result = await toolRegistry.invoke("c64_memory", { op: "wait_for_text", pattern: "READY." }, ctx);
  assert.equal(result.isError, undefined);
  assert.ok(readCount >= 1, "readScreen should be called at least once");
});

test("c64_memory write with verify pauses, writes, and resumes", async () => {
  const callLog = [];
  let readInvocation = 0;

  const stubClient = {
    async pause() {
      callLog.push("pause");
      return { success: true };
    },
    async resume() {
      callLog.push("resume");
      return { success: true };
    },
    async readMemory(address, length) {
      callLog.push({ method: "readMemory", address, length });
      readInvocation += 1;
      if (readInvocation === 1) {
        return { success: true, data: "$0000" };
      }
      return { success: true, data: "$ABCD" };
    },
    async writeMemory(address, bytes) {
      callLog.push({ method: "writeMemory", address, bytes });
      return { success: true, details: { address: "$0400", length: 2 } };
    },
    async readScreen() {
      throw new Error("not used");
    },
  };

  const ctx = {
    client: stubClient,
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const result = await toolRegistry.invoke(
    "c64_memory",
    { op: "write", address: "$0400", bytes: "$ABCD", verify: true },
    ctx,
  );

  assert.equal(result.isError, undefined);
  assert.equal(result.metadata?.verified, true);

  const callNames = callLog.map((entry) => (typeof entry === "string" ? entry : entry.method));
  assert.deepEqual(callNames.filter((name) => name === "pause"), ["pause"]);
  assert.deepEqual(callNames.filter((name) => name === "writeMemory"), ["writeMemory"]);
  assert.deepEqual(callNames.filter((name) => name === "resume"), ["resume"]);

  const readCalls = callLog.filter((entry) => typeof entry === "object" && entry.method === "readMemory");
  assert.equal(readCalls.length, 2, "should read before and after write when verify is true");
  assert.equal(readCalls[0].address, "$0400");
  assert.equal(readCalls[1].address, "$0400");
});

test("c64_sound note_on delegates to legacy handler", async () => {
  const calls = [];
  const stubClient = {
    async sidNoteOn(payload) {
      calls.push({ method: "sidNoteOn", payload });
      return { success: true };
    },
  };

  const ctx = {
    client: stubClient,
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const result = await toolRegistry.invoke(
    "c64_sound",
    { op: "note_on", voice: 2, note: "G4", waveform: "tri" },
    ctx,
  );

  assert.equal(result.isError, undefined);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "sidNoteOn");
  assert.equal(calls[0].payload.voice, 2);
  assert.equal(calls[0].payload.note, "G4");
});

test("c64_sound silence_all verify runs audio analyzer", async () => {
  const stubClient = {
    async sidSilenceAll() {
      return { success: true };
    },
    async recordAndAnalyzeAudio({ durationSeconds }) {
      return {
        analysis: {
          durationSeconds,
          global_metrics: {
            average_rms: 0.01,
            max_rms: 0.015,
          },
        },
      };
    },
  };

  const ctx = {
    client: stubClient,
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const result = await toolRegistry.invoke(
    "c64_sound",
    { op: "silence_all", verify: true },
    ctx,
  );

  assert.equal(result.isError, undefined);
  assert.equal(result.metadata?.verify, true);
  assert.equal(result.metadata?.verification?.silent, true);
  assert.ok(result.metadata?.verification?.maxRms <= 0.02);
});

test("c64_system reset delegates to machine control", async () => {
  const calls = [];
  const stubClient = {
    async reset() {
      calls.push("reset");
      return { success: true, details: {} };
    },
  };

  const ctx = {
    client: stubClient,
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const result = await toolRegistry.invoke("c64_system", { op: "reset" }, ctx);

  assert.equal(result.isError, undefined);
  assert.deepEqual(calls, ["reset"]);
  assert.equal(result.metadata?.success, true);
});

test("c64_system background task lifecycle proxies to meta tools", async () => {
  const { file, dir } = tmpPath("grouped-system", "tasks.json");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, JSON.stringify({ tasks: [] }, null, 2));
  const previous = process.env.C64_TASK_STATE_FILE;
  process.env.C64_TASK_STATE_FILE = file;

  try {
    const stubClient = {
      async readMemory() {
        return { success: true, data: "$00" };
      },
    };

    const ctx = {
      client: stubClient,
      rag: {},
      logger: createLogger(),
      platform: getPlatformStatus(),
      setPlatform,
    };

    const start = await toolRegistry.invoke(
      "c64_system",
  { op: "start_task", name: "grouped-task", operation: "read", intervalMs: 10, maxIterations: 1 },
      ctx,
    );
    assert.equal(start.metadata?.success, true);

  await new Promise((resolve) => setTimeout(resolve, 50));

    const list = await toolRegistry.invoke("c64_system", { op: "list_tasks" }, ctx);
    assert.equal(list.metadata?.success, true);
    const tasks = list.structuredContent?.data?.tasks ?? [];
    const match = tasks.find((task) => task.name === "grouped-task");
    assert.ok(match, "background task should be present");

    const stop = await toolRegistry.invoke("c64_system", { op: "stop_all_tasks" }, ctx);
    assert.equal(stop.metadata?.success, true);
  } finally {
    if (previous === undefined) delete process.env.C64_TASK_STATE_FILE;
    else process.env.C64_TASK_STATE_FILE = previous;
  }
});

test("c64_disk list_drives delegates to storage module", async () => {
  const calls = [];
  const stubClient = {
    async drivesList() {
      calls.push("drivesList");
      return { success: true, details: { drives: [] } };
    },
  };

  const ctx = {
    client: stubClient,
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const result = await toolRegistry.invoke("c64_disk", { op: "list_drives" }, ctx);

  assert.equal(result.isError, undefined);
  assert.deepEqual(calls, ["drivesList"]);
});

test("c64_disk mount without verify calls driveMount", async () => {
  const calls = [];
  const stubClient = {
    async driveMount(drive, image, options) {
      calls.push({ drive, image, options });
      return { success: true, details: {} };
    },
  };

  const ctx = {
    client: stubClient,
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const result = await toolRegistry.invoke(
    "c64_disk",
    {
      op: "mount",
      drive: "drive8",
      image: "//USB0/demo.g64",
      type: "g64",
      attachmentMode: "readonly",
    },
    ctx,
  );

  assert.equal(result.isError, undefined);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].drive, "drive8");
  assert.equal(calls[0].image, "//USB0/demo.g64");
  assert.equal(calls[0].options?.type, "g64");
  assert.equal(calls[0].options?.mode, "readonly");
});

test("c64_disk mount with verify delegates to meta workflow", async () => {
  const calls = [];
  const stubClient = {
    async driveMount() {
      throw new Error("driveMount should not be called when verify=true");
    },
  };

  const ctx = {
    client: stubClient,
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const originalInvoke = metaModule.invoke;
  metaModule.invoke = async (name, payload) => {
    calls.push({ name, payload });
    return {
      content: [{ type: "text", text: "verified" }],
      metadata: { verifyMount: true },
    };
  };

  try {
    const result = await toolRegistry.invoke(
      "c64_disk",
      {
        op: "mount",
        drive: "drive9",
        image: "//USB0/demo.d64",
        verify: true,
        powerOnIfNeeded: true,
        resetAfterMount: true,
      },
      ctx,
    );

    assert.equal(result.metadata?.verifyMount, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, "drive_mount_and_verify");
    assert.equal(calls[0].payload.drive, "drive9");
    assert.equal(calls[0].payload.imagePath, "//USB0/demo.d64");
    assert.equal(calls[0].payload.verifyMount, true);
  } finally {
    metaModule.invoke = originalInvoke;
  }
});

test("c64_disk create_image validates D64 tracks", async () => {
  const ctx = {
    client: {},
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  await assert.rejects(
    () => toolRegistry.invoke(
      "c64_disk",
      { op: "create_image", format: "d64", path: "//USB0/bad.d64", tracks: 36 },
      ctx,
    ),
    ToolValidationError,
  );
});

test("c64_drive set_mode delegates to storage module", async () => {
  const calls = [];
  const stubClient = {
    async driveSetMode(drive, mode) {
      calls.push({ drive, mode });
      return { success: true, details: {} };
    },
  };

  const ctx = {
    client: stubClient,
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const result = await toolRegistry.invoke(
    "c64_drive",
    { op: "set_mode", drive: "drive8", mode: "1581" },
    ctx,
  );

  assert.equal(result.isError, undefined);
  assert.deepEqual(calls, [{ drive: "drive8", mode: "1581" }]);
});

test("c64_printer print_text delegates to printer module", async () => {
  const calls = [];
  const stubClient = {
    async printTextOnPrinterAndRun(payload) {
      calls.push(payload);
      return { success: true, details: {} };
    },
  };

  const ctx = {
    client: stubClient,
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const result = await toolRegistry.invoke(
    "c64_printer",
    { op: "print_text", text: "HELLO", formFeed: true },
    ctx,
  );

  assert.equal(result.isError, undefined);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].text, "HELLO");
  assert.equal(calls[0].formFeed, true);
});

test("c64_printer print_bitmap routes to Commodore workflow", async () => {
  const calls = [];
  const stubClient = {
    async printBitmapOnCommodoreAndRun(payload) {
      calls.push(payload);
      return { success: true, details: {} };
    },
  };

  const ctx = {
    client: stubClient,
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const result = await toolRegistry.invoke(
    "c64_printer",
    {
      op: "print_bitmap",
      printer: "commodore",
      columns: [0, 255],
      secondaryAddress: 7,
    },
    ctx,
  );

  assert.equal(result.isError, undefined);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].columns, [0, 255]);
  assert.equal(calls[0].secondaryAddress, 7);
  assert.equal(calls[0].ensureMsb, true);
});

test("c64_extract sprites delegates to sprite extractor", async () => {
  const ctx = {
    client: {},
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const calls = [];
  const originalInvoke = metaModule.invoke;
  metaModule.invoke = async (name, payload) => {
    calls.push({ name, payload });
    return {
      content: [{ type: "text", text: "sprites extracted" }],
      metadata: { success: true },
    };
  };

  try {
    const result = await toolRegistry.invoke(
      "c64_extract",
      { op: "sprites", address: "$2000", length: 2048, stride: 64 },
      ctx,
    );

    assert.equal(result.isError, undefined);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, "extract_sprites_from_ram");
    assert.equal(calls[0].payload.address, "$2000");
    assert.equal(calls[0].payload.length, 2048);
    assert.equal(calls[0].payload.stride, 64);
  } finally {
    metaModule.invoke = originalInvoke;
  }
});

test("c64_extract memory_dump forwards to meta dump tool", async () => {
  const ctx = {
    client: {},
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const calls = [];
  const originalInvoke = metaModule.invoke;
  metaModule.invoke = async (name, payload) => {
    calls.push({ name, payload });
    return {
      content: [{ type: "text", text: "dumped" }],
      metadata: { success: true },
    };
  };

  try {
    const result = await toolRegistry.invoke(
      "c64_extract",
      {
        op: "memory_dump",
        address: "$0400",
        length: 256,
        outputPath: "./dumps/screen.hex",
        format: "hex",
      },
      ctx,
    );

    assert.equal(result.isError, undefined);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, "memory_dump_to_file");
    assert.equal(calls[0].payload.address, "$0400");
    assert.equal(calls[0].payload.length, 256);
    assert.equal(calls[0].payload.outputPath, "./dumps/screen.hex");
    assert.equal(calls[0].payload.format, "hex");
    assert.equal("op" in calls[0].payload, false);
  } finally {
    metaModule.invoke = originalInvoke;
  }
});

test("c64_stream start delegates to streaming start handler", async () => {
  const calls = [];
  const stubClient = {
    async streamStart(stream, target) {
      calls.push({ stream, target });
      return { success: true, details: { ack: true } };
    },
    async streamStop() {
      throw new Error("not used");
    },
  };

  const ctx = {
    client: stubClient,
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const result = await toolRegistry.invoke(
    "c64_stream",
    { op: "start", stream: "audio", target: "127.0.0.1:9000" },
    ctx,
  );

  assert.equal(result.isError, undefined);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { stream: "audio", target: "127.0.0.1:9000" });
  assert.equal(result.metadata?.success, true);
  assert.equal(result.metadata?.stream, "audio");
  assert.equal(result.metadata?.target, "127.0.0.1:9000");
});

test("c64_stream stop delegates to streaming stop handler", async () => {
  const calls = [];
  const stubClient = {
    async streamStart() {
      throw new Error("not used");
    },
    async streamStop(stream) {
      calls.push(stream);
      return { success: true, details: { stopped: true } };
    },
  };

  const ctx = {
    client: stubClient,
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const result = await toolRegistry.invoke(
    "c64_stream",
    { op: "stop", stream: "audio" },
    ctx,
  );

  assert.equal(result.isError, undefined);
  assert.deepEqual(calls, ["audio"]);
  assert.equal(result.metadata?.success, true);
  assert.equal(result.metadata?.stream, "audio");
});

test("c64_printer print_bitmap routes to Epson workflow", async () => {
  const calls = [];
  const stubClient = {
    async printBitmapOnEpsonAndRun(payload) {
      calls.push(payload);
      return { success: true, details: {} };
    },
  };

  const ctx = {
    client: stubClient,
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const result = await toolRegistry.invoke(
    "c64_printer",
    {
      op: "print_bitmap",
      printer: "epson",
      columns: [255, 0, 255],
      mode: "*",
      density: 3,
      repeats: 2,
    },
    ctx,
  );

  assert.equal(result.isError, undefined);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].columns, [255, 0, 255]);
  assert.equal(calls[0].mode, "*");
  assert.equal(calls[0].density, 3);
  assert.equal(calls[0].repeats, 2);
});

test("c64_printer print_bitmap rejects invalid secondary address", async () => {
  const ctx = {
    client: {},
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  await assert.rejects(
    () => toolRegistry.invoke(
      "c64_printer",
      {
        op: "print_bitmap",
        printer: "commodore",
        columns: [0],
        secondaryAddress: 5,
      },
      ctx,
    ),
    ToolValidationError,
  );
});

test("c64_config list delegates to configsList", async () => {
  const calls = [];
  const stubClient = {
    async configsList() {
      calls.push("configsList");
      return { categories: [] };
    },
  };

  const ctx = {
    client: stubClient,
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const result = await toolRegistry.invoke("c64_config", { op: "list" }, ctx);

  assert.equal(result.isError, undefined);
  assert.deepEqual(calls, ["configsList"]);
});

test("c64_config set delegates to configSet", async () => {
  const calls = [];
  const stubClient = {
    async configSet(category, item, value) {
      calls.push({ category, item, value });
      return { success: true, details: {} };
    },
  };

  const ctx = {
    client: stubClient,
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const result = await toolRegistry.invoke(
    "c64_config",
    { op: "set", category: "Audio", item: "Volume", value: 70 },
    ctx,
  );

  assert.equal(result.isError, undefined);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].category, "Audio");
  assert.equal(calls[0].item, "Volume");
  assert.equal(calls[0].value, "70");
});

test("c64_config write_debugreg uppercases payload", async () => {
  const calls = [];
  const stubClient = {
    async debugregWrite(value) {
      calls.push(value);
      return { success: true, details: {} };
    },
  };

  const ctx = {
    client: stubClient,
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const result = await toolRegistry.invoke(
    "c64_config",
    { op: "write_debugreg", value: "2a" },
    ctx,
  );

  assert.equal(result.isError, undefined);
  assert.deepEqual(calls, ["2A"]);
});

test("c64_config snapshot delegates to meta workflow", async () => {
  const ctx = {
    client: {},
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const originalInvoke = metaModule.invoke;
  const calls = [];
  metaModule.invoke = async (name, payload) => {
    calls.push({ name, payload });
    return {
      content: [{ type: "text", text: "snapshot" }],
      metadata: { success: true },
    };
  };

  try {
    const result = await toolRegistry.invoke(
      "c64_config",
      { op: "snapshot", path: "/tmp/config.json" },
      ctx,
    );

    assert.equal(result.metadata?.success, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, "config_snapshot_and_restore");
    assert.equal(calls[0].payload.action, "snapshot");
    assert.equal(calls[0].payload.path, "/tmp/config.json");
  } finally {
    metaModule.invoke = originalInvoke;
  }
});

test("c64_config restore forwards applyToFlash flag", async () => {
  const ctx = {
    client: {},
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const originalInvoke = metaModule.invoke;
  const calls = [];
  metaModule.invoke = async (name, payload) => {
    calls.push({ name, payload });
    return {
      content: [{ type: "text", text: "restore" }],
      metadata: { success: true },
    };
  };

  try {
    const result = await toolRegistry.invoke(
      "c64_config",
      { op: "restore", path: "./snap.json", applyToFlash: true },
      ctx,
    );

    assert.equal(result.metadata?.success, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].payload.action, "restore");
    assert.equal(calls[0].payload.path, "./snap.json");
    assert.equal(calls[0].payload.applyToFlash, true);
  } finally {
    metaModule.invoke = originalInvoke;
  }
});

test("c64_config diff delegates to config snapshot meta tool", async () => {
  const ctx = {
    client: {},
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const originalInvoke = metaModule.invoke;
  const calls = [];
  metaModule.invoke = async (name, payload) => {
    calls.push({ name, payload });
    return {
      content: [{ type: "text", text: "diff" }],
      metadata: { success: true },
    };
  };

  try {
    const result = await toolRegistry.invoke(
      "c64_config",
      { op: "diff", path: "./snap.json" },
      ctx,
    );

    assert.equal(result.metadata?.success, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].payload.action, "diff");
    assert.equal(calls[0].payload.path, "./snap.json");
  } finally {
    metaModule.invoke = originalInvoke;
  }
});

test("c64_config shuffle delegates to program shuffle workflow", async () => {
  const ctx = {
    client: {},
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const originalInvoke = metaModule.invoke;
  const calls = [];
  metaModule.invoke = async (name, payload) => {
    calls.push({ name, payload });
    return {
      content: [{ type: "text", text: "shuffle" }],
      metadata: { success: true },
    };
  };

  try {
    const result = await toolRegistry.invoke(
      "c64_config",
      { op: "shuffle", root: "/games" },
      ctx,
    );

    assert.equal(result.metadata?.success, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, "program_shuffle");
    assert.equal(calls[0].payload.root, "/games");
  } finally {
    metaModule.invoke = originalInvoke;
  }
});

test("c64_graphics render_petscii delegates to legacy handler", async () => {
  const calls = [];
  const stubClient = {
    async renderPetsciiScreenAndRun(payload) {
      calls.push(payload);
      return { success: true, details: {} };
    },
    async generateAndRunSpritePrg() {
      throw new Error("not used");
    },
    async uploadAndRunBasic() {
      throw new Error("not used");
    },
  };

  const ctx = {
    client: stubClient,
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const result = await toolRegistry.invoke(
    "c64_graphics",
    { op: "render_petscii", text: "HELLO", borderColor: 6 },
    ctx,
  );

  assert.equal(result.isError, undefined);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].text, "HELLO");
  assert.equal(calls[0].borderColor, 6);
});

test("c64_graphics generate_sprite proxies to sprite helper", async () => {
  const calls = [];
  const stubClient = {
    async generateAndRunSpritePrg(payload) {
      calls.push(payload);
      return { success: true, details: {} };
    },
    async renderPetsciiScreenAndRun() {
      throw new Error("not used");
    },
    async uploadAndRunBasic() {
      throw new Error("not used");
    },
  };

  const ctx = {
    client: stubClient,
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const sprite = Array.from({ length: 63 }, () => 0);
  const result = await toolRegistry.invoke(
    "c64_graphics",
    { op: "generate_sprite", sprite, index: 1, x: 140, y: 120, color: 5 },
    ctx,
  );

  assert.equal(result.isError, undefined);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].spriteBytes.length, 63);
  assert.equal(calls[0].spriteIndex, 1);
  assert.equal(calls[0].x, 140);
  assert.equal(calls[0].y, 120);
  assert.equal(calls[0].color, 5);
});

test("c64_graphics generate_bitmap reports placeholder error", async () => {
  const ctx = {
    client: {},
    rag: {},
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const result = await toolRegistry.invoke("c64_graphics", { op: "generate_bitmap" }, ctx);

  assert.equal(result.isError, true);
  assert.equal(result.metadata?.error?.kind, "execution");
  assert.equal(result.metadata?.error?.details?.available, false);
});

test("c64_rag basic retrieval delegates to RAG layer", async () => {
  const queries = [];
  const stubRag = {
    async retrieve(q, k, language) {
      queries.push({ q, k, language });
      return [
        {
          snippet: "10 PRINT \"HELLO\"",
          score: 0.9,
          origin: "basic.md#hello",
        },
      ];
    },
  };

  const ctx = {
    client: {},
    rag: stubRag,
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const result = await toolRegistry.invoke(
    "c64_rag",
    { op: "basic", q: "print border" },
    ctx,
  );

  assert.equal(result.isError, undefined);
  assert.equal(queries.length, 1);
  assert.equal(queries[0].language, "basic");
  assert.equal(queries[0].q, "print border");
  assert.equal(queries[0].k, 3);
  assert.ok(result.structuredContent?.data?.refs?.length);
});

test("c64_rag asm retrieval delegates to RAG layer", async () => {
  const queries = [];
  const stubRag = {
    async retrieve(q, k, language) {
      queries.push({ q, k, language });
      return [];
    },
  };

  const ctx = {
    client: {},
    rag: stubRag,
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
    },
    platform: getPlatformStatus(),
    setPlatform,
  };

  const result = await toolRegistry.invoke(
    "c64_rag",
    { op: "asm", q: "stable raster irq" },
    ctx,
  );

  assert.equal(result.isError, undefined);
  assert.equal(queries.length, 1);
  assert.equal(queries[0].language, "asm");
  assert.equal(queries[0].q, "stable raster irq");
  assert.equal(queries[0].k, 3);
});

test("c64_debug list_checkpoints proxies to VICE client", async () => {
  const restore = getPlatformStatus().id;
  setPlatform("vice");
  try {
    let calls = 0;
    const stubClient = {
      async viceCheckpointList() {
        calls += 1;
        return [
          {
            id: 1,
            hit: false,
            start: 0x0801,
            end: 0x0801,
            stopOnHit: true,
            enabled: true,
            temporary: false,
            operations: { execute: true, load: false, store: false },
            hitCount: 0,
            ignoreCount: 0,
            hasCondition: false,
            memspace: 0,
          },
        ];
      },
    };

    const ctx = {
      client: stubClient,
      rag: {},
      logger: {
        debug() {},
        info() {},
        warn() {},
        error() {},
      },
      platform: getPlatformStatus(),
      setPlatform,
    };

    const result = await toolRegistry.invoke("c64_debug", { op: "list_checkpoints" }, ctx);

    assert.equal(result.isError, undefined);
    assert.equal(calls, 1);
  assert.equal(result.structuredContent?.type, "json");
  const data = result.structuredContent?.data;
  assert.ok(data && Array.isArray(data.checkpoints));
  assert.equal(data.checkpoints[0].id, 1);
  assert.equal(data.checkpoints[0].start, "$0801");
  } finally {
    setPlatform(restore);
  }
});

test("c64_debug set_registers resolves metadata and writes values", async () => {
  const restore = getPlatformStatus().id;
  setPlatform("vice");
  try {
    let metadataCalls = 0;
    const setCalls = [];
    const stubClient = {
      async viceRegistersAvailable(memspace) {
        metadataCalls += 1;
        return [
          { id: 0, name: "PC", bits: 16, size: 2 },
          { id: 1, name: "A", bits: 8, size: 1 },
        ];
      },
      async viceRegistersSet(writes, options) {
        setCalls.push({ writes, options });
        return writes.map((write) => ({
          id: write.id ?? (write.name?.toUpperCase() === "PC" ? 0 : 1),
          size: write.value > 0xff ? 2 : 1,
          value: write.value,
        }));
      },
    };

    const ctx = {
      client: stubClient,
      rag: {},
      logger: {
        debug() {},
        info() {},
        warn() {},
        error() {},
      },
      platform: getPlatformStatus(),
      setPlatform,
    };

    const result = await toolRegistry.invoke(
      "c64_debug",
      {
        op: "set_registers",
        writes: [
          { name: "pc", value: 0x1234 },
          { id: 1, value: 0x20 },
        ],
      },
      ctx,
    );

    assert.equal(result.isError, undefined);
    assert.equal(metadataCalls, 1);
    assert.equal(setCalls.length, 1);
    assert.deepEqual(setCalls[0].writes, [
      { name: "pc", value: 0x1234 },
      { id: 1, value: 0x20 },
    ]);
    assert.equal(setCalls[0].options.memspace, 0);
    assert.ok(Array.isArray(setCalls[0].options.metadata));
  assert.equal(result.structuredContent?.type, "json");
  const data = result.structuredContent?.data;
  assert.ok(data && Array.isArray(data.registers));
  assert.equal(data.registers.length, 2);
  } finally {
    setPlatform(restore);
  }
});

test("c64_debug step over delegates to VICE stepping", async () => {
  const restore = getPlatformStatus().id;
  setPlatform("vice");
  try {
    const stepCalls = [];
    const stubClient = {
      async viceStepInstructions(count, options) {
        stepCalls.push({ count, options });
      },
    };

    const ctx = {
      client: stubClient,
      rag: {},
      logger: {
        debug() {},
        info() {},
        warn() {},
        error() {},
      },
      platform: getPlatformStatus(),
      setPlatform,
    };

    const result = await toolRegistry.invoke(
      "c64_debug",
      { op: "step", count: 2, mode: "over" },
      ctx,
    );

    assert.equal(result.isError, undefined);
    assert.equal(stepCalls.length, 1);
    assert.equal(stepCalls[0].count, 2);
    assert.equal(stepCalls[0].options.stepOver, true);
  } finally {
    setPlatform(restore);
  }
});

test("c64_vice display_get returns snapshot metadata", async () => {
  const restore = getPlatformStatus().id;
  setPlatform("vice");
  try {
    let calls = 0;
    const stubClient = {
      async viceDisplayGet(options) {
        calls += 1;
        assert.ok(options);
        return {
          debugWidth: 320,
          debugHeight: 200,
          innerWidth: 320,
          innerHeight: 200,
          offsetX: 0,
          offsetY: 0,
          bitsPerPixel: 8,
          pixels: Buffer.from([0, 1, 2, 3]),
        };
      },
    };

    const ctx = {
      client: stubClient,
      rag: {},
      logger: {
        debug() {},
        info() {},
        warn() {},
        error() {},
      },
      platform: getPlatformStatus(),
      setPlatform,
    };

    const result = await toolRegistry.invoke("c64_vice", { op: "display_get" }, ctx);

    assert.equal(result.isError, undefined);
    assert.equal(calls, 1);
    assert.equal(result.structuredContent?.type, "json");
    const data = result.structuredContent?.data;
    assert.ok(data);
    assert.equal(data.byteLength, 4);
    assert.equal(data.pixels.encoding, "base64");
    assert.equal(data.pixels.data, Buffer.from([0, 1, 2, 3]).toString("base64"));
  } finally {
    setPlatform(restore);
  }
});

test("c64_vice resource_set writes allowed resources", async () => {
  const restore = getPlatformStatus().id;
  setPlatform("vice");
  try {
    const calls = [];
    const stubClient = {
      async viceResourceSet(name, value) {
        calls.push({ name, value });
      },
    };

    const ctx = {
      client: stubClient,
      rag: {},
      logger: {
        debug() {},
        info() {},
        warn() {},
        error() {},
      },
      platform: getPlatformStatus(),
      setPlatform,
    };

    const result = await toolRegistry.invoke(
      "c64_vice",
      { op: "resource_set", name: "SidEngine", value: 2 },
      ctx,
    );

    assert.equal(result.isError, undefined);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, "SidEngine");
    assert.equal(calls[0].value, 2);
  } finally {
    setPlatform(restore);
  }
});

test("c64_vice resource_set rejects unsafe prefixes", async () => {
  const restore = getPlatformStatus().id;
  setPlatform("vice");
  try {
    const stubClient = {
      async viceResourceSet() {
        throw new Error("should not be called");
      },
    };

    const ctx = {
      client: stubClient,
      rag: {},
      logger: {
        debug() {},
        info() {},
        warn() {},
        error() {},
      },
      platform: getPlatformStatus(),
      setPlatform,
    };

    const result = await toolRegistry.invoke(
      "c64_vice",
      { op: "resource_set", name: "Drive8Type", value: "1541" },
      ctx,
    );

    assert.equal(result.isError, true);
    assert.equal(result.metadata?.error?.kind, "validation");
    assert.equal(result.metadata?.error?.path, "$.name");
  } finally {
    setPlatform(restore);
  }
});
