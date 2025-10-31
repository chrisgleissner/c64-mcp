import type { JsonSchema, ToolDescriptor, ToolExecutionContext, ToolModule, ToolRunResult } from "./types.js";
import { createOperationDispatcher, defineToolModule, discriminatedUnionSchema, OPERATION_DISCRIMINATOR } from "./types.js";
import {
  arraySchema,
  booleanSchema,
  numberSchema,
  objectSchema,
  optionalSchema,
  stringSchema,
} from "./schema.js";
import { ToolExecutionError, ToolValidationError, toolErrorResult } from "./errors.js";
import { programRunnersModule, programOperationHandlers as groupedProgramHandlers } from "./programRunners.js";
import { memoryModule, memoryOperationHandlers as groupedMemoryHandlers } from "./memory.js";
import { audioModule } from "./audio.js";
import { machineControlModule } from "./machineControl.js";
import { storageModule } from "./storage.js";
import { graphicsModule, graphicsOperationHandlers as groupedGraphicsHandlers } from "./graphics.js";
import { printerModule } from "./printer.js";
import { ragModule } from "./rag.js";
import { developerModule } from "./developer.js";
import { streamingModule } from "./streaming.js";
import { metaModule } from "./meta/index.js";
import { getPlatformStatus, setPlatform } from "../platform.js";

interface RegisteredTool {
  readonly module: ToolModule;
  readonly descriptor: ToolDescriptor;
}

export interface ToolModuleDescriptor {
  readonly domain: string;
  readonly summary: string;
  readonly defaultTags: readonly string[];
  readonly workflowHints: readonly string[];
  readonly tools: readonly ToolDescriptor[];
}

type GroupedOperationConfig = {
  readonly op: string;
  readonly schema: JsonSchema;
  readonly handler: (
    args: Record<string, unknown> & { readonly [OPERATION_DISCRIMINATOR]: string },
    ctx: ToolExecutionContext,
  ) => Promise<ToolRunResult>;
};

type GenericOperationMap = Record<string, Record<string, unknown>>;

function cloneSchema(schema?: JsonSchema): JsonSchema {
  if (!schema) {
    return {
      type: "object",
      properties: {},
      additionalProperties: false,
    } satisfies JsonSchema;
  }
  return JSON.parse(JSON.stringify(schema)) as JsonSchema;
}

function isObjectSchema(schema: JsonSchema): boolean {
  if (!schema.type) {
    return true;
  }
  if (typeof schema.type === "string") {
    return schema.type === "object";
  }
  return schema.type.includes("object");
}

function extendSchemaWithOp(
  op: string,
  baseSchema: JsonSchema | undefined,
  options: { description?: string; extraProperties?: Record<string, JsonSchema> } = {},
): JsonSchema {
  const schema = cloneSchema(baseSchema);
  const description = options.description ?? schema.description;

  if (!isObjectSchema(schema)) {
    // Fallback: wrap non-object schemas into an object payload
    return {
      type: "object",
      description,
      properties: {
        [OPERATION_DISCRIMINATOR]: { const: op },
        payload: schema,
      },
      required: [OPERATION_DISCRIMINATOR, "payload"],
      additionalProperties: false,
    } satisfies JsonSchema;
  }

  const properties = { ...(schema.properties ?? {}) } as Record<string, JsonSchema>;
  properties[OPERATION_DISCRIMINATOR] = { const: op };

  if (options.extraProperties) {
    for (const [key, value] of Object.entries(options.extraProperties)) {
      properties[key] = value;
    }
  }

  const required = new Set(schema.required ?? []);
  required.add(OPERATION_DISCRIMINATOR);

  return {
    ...schema,
    description,
    properties,
    required: Array.from(required),
  } satisfies JsonSchema;
}

function createOperationHandlers(
  operations: readonly GroupedOperationConfig[],
): import("./types.js").OperationHandlerMap<GenericOperationMap> {
  const handlers: Record<string, (args: Record<string, unknown> & { readonly [OPERATION_DISCRIMINATOR]: string }, ctx: ToolExecutionContext) => Promise<ToolRunResult>> = {};

  for (const operation of operations) {
    handlers[operation.op] = operation.handler;
  }

  return handlers as import("./types.js").OperationHandlerMap<GenericOperationMap>;
}

function invokeModuleTool(
  module: ToolModule,
  toolName: string,
  rawArgs: Record<string, unknown> & { readonly [OPERATION_DISCRIMINATOR]: string },
  ctx: ToolExecutionContext,
): Promise<ToolRunResult> {
  const { [OPERATION_DISCRIMINATOR]: _ignored, ...rest } = rawArgs;
  return module.invoke(toolName, rest, ctx);
}

const programDescriptorIndex = new Map(programRunnersModule.describeTools().map((descriptor) => [descriptor.name, descriptor]));
const audioDescriptorIndex = new Map(audioModule.describeTools().map((descriptor) => [descriptor.name, descriptor]));
const storageDescriptorIndex = new Map(storageModule.describeTools().map((descriptor) => [descriptor.name, descriptor]));
const printerDescriptorIndex = new Map(printerModule.describeTools().map((descriptor) => [descriptor.name, descriptor]));
const developerDescriptorIndex = new Map(developerModule.describeTools().map((descriptor) => [descriptor.name, descriptor]));
const streamingDescriptorIndex = new Map(streamingModule.describeTools().map((descriptor) => [descriptor.name, descriptor]));
const metaDescriptorIndex = new Map(metaModule.describeTools().map((descriptor) => [descriptor.name, descriptor]));
const memoryDescriptorIndex = new Map(memoryModule.describeTools().map((descriptor) => [descriptor.name, descriptor]));
const machineDescriptorIndex = new Map(machineControlModule.describeTools().map((descriptor) => [descriptor.name, descriptor]));
const graphicsDescriptorIndex = new Map(graphicsModule.describeTools().map((descriptor) => [descriptor.name, descriptor]));
const ragDescriptorIndex = new Map(ragModule.describeTools().map((descriptor) => [descriptor.name, descriptor]));

function ensureDescriptor(
  index: Map<string, ToolDescriptor>,
  name: string,
): ToolDescriptor {
  const descriptor = index.get(name);
  if (!descriptor) {
    throw new Error(`Unable to locate descriptor for ${name}`);
  }
  return descriptor;
}

const programOperations: GroupedOperationConfig[] = [
  {
    op: "load_prg",
    schema: extendSchemaWithOp(
      "load_prg",
      ensureDescriptor(programDescriptorIndex, "load_prg").inputSchema,
      { description: "Load a PRG from Ultimate storage without executing it." },
    ),
    handler: groupedProgramHandlers.load_prg,
  },
  {
    op: "run_prg",
    schema: extendSchemaWithOp(
      "run_prg",
      ensureDescriptor(programDescriptorIndex, "run_prg").inputSchema,
      { description: "Load and execute a PRG located on the Ultimate filesystem." },
    ),
    handler: groupedProgramHandlers.run_prg,
  },
  {
    op: "run_crt",
    schema: extendSchemaWithOp(
      "run_crt",
      ensureDescriptor(programDescriptorIndex, "run_crt").inputSchema,
      { description: "Mount and run a CRT cartridge image." },
    ),
    handler: groupedProgramHandlers.run_crt,
  },
  {
    op: "upload_run_basic",
    schema: extendSchemaWithOp(
      "upload_run_basic",
      ensureDescriptor(programDescriptorIndex, "upload_run_basic").inputSchema,
      { description: "Upload Commodore BASIC v2 source and execute it immediately." },
    ),
    handler: groupedProgramHandlers.upload_run_basic,
  },
  {
    op: "upload_run_asm",
    schema: extendSchemaWithOp(
      "upload_run_asm",
      ensureDescriptor(programDescriptorIndex, "upload_run_asm").inputSchema,
      { description: "Assemble 6502/6510 source, upload the PRG, and execute it." },
    ),
    handler: groupedProgramHandlers.upload_run_asm,
  },
  {
    op: "batch_run",
    schema: extendSchemaWithOp(
      "batch_run",
      ensureDescriptor(metaDescriptorIndex, "batch_run_with_assertions").inputSchema,
      { description: "Run multiple PRG/CRT programs with post-run assertions." },
    ),
    handler: async (rawArgs, ctx) => {
      const { [OPERATION_DISCRIMINATOR]: _ignored, ...rest } = rawArgs;
      return metaModule.invoke("batch_run_with_assertions", rest, ctx);
    },
  },
  {
    op: "bundle_run",
    schema: extendSchemaWithOp(
      "bundle_run",
      ensureDescriptor(metaDescriptorIndex, "bundle_run_artifacts").inputSchema,
      { description: "Capture screen, memory, and debug registers into an artifact bundle." },
    ),
    handler: async (rawArgs, ctx) => {
      const { [OPERATION_DISCRIMINATOR]: _ignored, ...rest } = rawArgs;
      return metaModule.invoke("bundle_run_artifacts", rest, ctx);
    },
  },
];

const programOperationHandlers = createOperationHandlers(programOperations);

const groupedProgramModule = programOperations.length === 0
  ? null
  : defineToolModule({
      domain: "programs",
      summary: "Grouped program upload, run, and orchestration workflows.",
      resources: ["c64://context/bootstrap", "c64://specs/basic", "c64://specs/assembly"],
      prompts: ["basic-program", "assembly-program"],
      defaultTags: ["programs", "execution"],
      workflowHints: [
        "Choose BASIC or assembly uploaders based on the language you just generated for the user.",
        "Prefer PRG or CRT runners when the user supplies an Ultimate filesystem path instead of source text.",
      ],
      supportedPlatforms: ["c64u", "vice"],
      tools: [
        {
          name: "c64.program",
          description: "Grouped entry point for program upload, execution, and batch workflows.",
          summary: "Runs PRG/CRT files, uploads BASIC or ASM, and coordinates batch test flows.",
          inputSchema: discriminatedUnionSchema({
            description: "Program operations available via the c64.program tool.",
            variants: programOperations.map((operation) => operation.schema),
          }),
          tags: ["programs", "execution", "grouped"],
          examples: [
            {
              name: "Run PRG from storage",
              description: "Load and execute a PRG in one call",
              arguments: { op: "run_prg", path: "//USB0/demo.prg" },
            },
            {
              name: "Upload BASIC source",
              description: "Send inline BASIC to the C64 and run it",
              arguments: { op: "upload_run_basic", program: "10 PRINT \"HELLO\"\n20 GOTO 10" },
            },
          ],
          execute: createOperationDispatcher<GenericOperationMap>(
            "c64.program",
            programOperationHandlers,
          ),
        },
      ],
    });

const memoryOperations: GroupedOperationConfig[] = [
  {
    op: "read",
    schema: extendSchemaWithOp(
      "read",
      ensureDescriptor(memoryDescriptorIndex, "read").inputSchema,
      { description: "Read a range of bytes and return a hex dump with address metadata." },
    ),
    handler: groupedMemoryHandlers.read,
  },
  {
    op: "write",
    schema: extendSchemaWithOp(
      "write",
      ensureDescriptor(memoryDescriptorIndex, "write").inputSchema,
      { description: "Write a hexadecimal byte sequence into RAM." },
    ),
    handler: groupedMemoryHandlers.write,
  },
  {
    op: "read_screen",
    schema: extendSchemaWithOp(
      "read_screen",
      ensureDescriptor(memoryDescriptorIndex, "read_screen").inputSchema,
      { description: "Return the current 40x25 text screen converted to ASCII." },
    ),
    handler: groupedMemoryHandlers.read_screen,
  },
  {
    op: "wait_for_text",
    schema: extendSchemaWithOp(
      "wait_for_text",
      ensureDescriptor(metaDescriptorIndex, "wait_for_screen_text").inputSchema,
      { description: "Poll the screen until a substring or regex appears, or timeout elapses." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(metaModule, "wait_for_screen_text", rawArgs, ctx),
  },
];

const memoryOperationHandlers = createOperationHandlers(memoryOperations);

const groupedMemoryModule = memoryOperations.length === 0
  ? null
  : defineToolModule({
      domain: "memory",
      summary: "Grouped memory, screen, and polling operations.",
      resources: ["c64://context/bootstrap", "c64://specs/basic", "c64://specs/assembly"],
      prompts: ["memory-debug", "basic-program", "assembly-program"],
      defaultTags: ["memory", "debug"],
      workflowHints: [
        "Pair memory operations with documentation snippets so addresses and symbols stay meaningful to the user.",
        "Confirm intent before mutating RAM and explain how the change affects the running program.",
      ],
      tools: [
        {
          name: "c64.memory",
          description: "Grouped entry point for memory I/O, screen reads, and screen polling.",
          summary: "Reads or writes RAM, captures the screen, or waits for text matches in one tool.",
          inputSchema: discriminatedUnionSchema({
            description: "Memory operations available via the c64.memory tool.",
            variants: memoryOperations.map((operation) => operation.schema),
          }),
          tags: ["memory", "screen", "grouped"],
          examples: [
            {
              name: "Read colour RAM",
              description: "Read 16 bytes starting at $D800",
              arguments: { op: "read", address: "$D800", length: 16 },
            },
            {
              name: "Wait for READY prompt",
              description: "Poll until the READY. prompt appears",
              arguments: { op: "wait_for_text", pattern: "READY." },
            },
          ],
          execute: createOperationDispatcher<GenericOperationMap>(
            "c64.memory",
            memoryOperationHandlers,
          ),
        },
      ],
    });

const soundOperations: GroupedOperationConfig[] = [
  {
    op: "set_volume",
    schema: extendSchemaWithOp(
      "set_volume",
      ensureDescriptor(audioDescriptorIndex, "sid_volume").inputSchema,
      { description: "Set the SID master volume register at $D418 (0-15)." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(audioModule, "sid_volume", rawArgs, ctx),
  },
  {
    op: "reset",
    schema: extendSchemaWithOp(
      "reset",
      ensureDescriptor(audioDescriptorIndex, "sid_reset").inputSchema,
      { description: "Soft or hard reset of SID registers to clear glitches." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(audioModule, "sid_reset", rawArgs, ctx),
  },
  {
    op: "note_on",
    schema: extendSchemaWithOp(
      "note_on",
      ensureDescriptor(audioDescriptorIndex, "sid_note_on").inputSchema,
      { description: "Trigger a SID voice with configurable waveform, ADSR, and pitch." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(audioModule, "sid_note_on", rawArgs, ctx),
  },
  {
    op: "note_off",
    schema: extendSchemaWithOp(
      "note_off",
      ensureDescriptor(audioDescriptorIndex, "sid_note_off").inputSchema,
      { description: "Release a SID voice by clearing its gate bit." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(audioModule, "sid_note_off", rawArgs, ctx),
  },
  {
    op: "silence_all",
    schema: extendSchemaWithOp(
      "silence_all",
      ensureDescriptor(audioDescriptorIndex, "sid_silence_all").inputSchema,
      { description: "Silence all SID voices with optional audio verification." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(audioModule, "sid_silence_all", rawArgs, ctx),
  },
  {
    op: "play_sid_file",
    schema: extendSchemaWithOp(
      "play_sid_file",
      ensureDescriptor(audioDescriptorIndex, "sidplay_file").inputSchema,
      { description: "Play a SID file stored on the Ultimate filesystem." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(audioModule, "sidplay_file", rawArgs, ctx),
  },
  {
    op: "play_mod_file",
    schema: extendSchemaWithOp(
      "play_mod_file",
      ensureDescriptor(audioDescriptorIndex, "modplay_file").inputSchema,
      { description: "Play a MOD tracker module via the Ultimate SID player." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(audioModule, "modplay_file", rawArgs, ctx),
  },
  {
    op: "generate",
    schema: extendSchemaWithOp(
      "generate",
      ensureDescriptor(audioDescriptorIndex, "music_generate").inputSchema,
      { description: "Generate a lightweight SID arpeggio playback sequence." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(audioModule, "music_generate", rawArgs, ctx),
  },
  {
    op: "compile_play",
    schema: extendSchemaWithOp(
      "compile_play",
      ensureDescriptor(audioDescriptorIndex, "music_compile_and_play").inputSchema,
      { description: "Compile SIDWAVE or CPG source and optionally play it immediately." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(audioModule, "music_compile_and_play", rawArgs, ctx),
  },
  {
    op: "pipeline",
    schema: extendSchemaWithOp(
      "pipeline",
      ensureDescriptor(metaDescriptorIndex, "music_compile_play_analyze").inputSchema,
      { description: "Compile a SIDWAVE score, play it, and analyze the recording." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(metaModule, "music_compile_play_analyze", rawArgs, ctx),
  },
  {
    op: "analyze",
    schema: extendSchemaWithOp(
      "analyze",
      ensureDescriptor(audioDescriptorIndex, "analyze_audio").inputSchema,
      { description: "Automatically analyze SID playback when verification is requested." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(audioModule, "analyze_audio", rawArgs, ctx),
  },
  {
    op: "record_analyze",
    schema: extendSchemaWithOp(
      "record_analyze",
      ensureDescriptor(audioDescriptorIndex, "record_and_analyze_audio").inputSchema,
      { description: "Record audio for a fixed duration and return SID analysis metrics." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(audioModule, "record_and_analyze_audio", rawArgs, ctx),
  },
];

const soundOperationHandlers = createOperationHandlers(soundOperations);

const groupedSoundModule = soundOperations.length === 0
  ? null
  : defineToolModule({
      domain: "audio",
      summary: "Grouped SID control, playback, composition, and analysis operations.",
      resources: [
        "c64://specs/sid",
        "c64://specs/sidwave",
        "c64://docs/sid/file-structure",
      ],
      prompts: ["sid-music"],
      defaultTags: ["sid", "audio"],
      workflowHints: [
        "Trigger note_on or generate when the user wants immediate SID playback.",
        "Follow up playback changes with analyze or silence verification to provide confident audio feedback.",
      ],
      tools: [
        {
          name: "c64.sound",
          description: "Grouped entry point for SID control, playback, composition, and analysis workflows.",
          summary: "Adjusts SID registers, plays files, composes music, and runs verification captures.",
          inputSchema: discriminatedUnionSchema({
            description: "Sound operations available via the c64.sound tool.",
            variants: soundOperations.map((operation) => operation.schema),
          }),
          tags: ["sid", "audio", "grouped"],
          examples: [
            {
              name: "Trigger SID voice",
              description: "Start voice 1 on C4 with a triangle waveform",
              arguments: { op: "note_on", voice: 1, note: "C4", waveform: "tri" },
            },
            {
              name: "Verify silence",
              description: "Stop all voices and confirm the SID output is quiet",
              arguments: { op: "silence_all", verify: true },
            },
          ],
          execute: createOperationDispatcher<GenericOperationMap>(
            "c64.sound",
            soundOperationHandlers,
          ),

        },
      ],
    });

const systemOperations: GroupedOperationConfig[] = [
  {
    op: "pause",
    schema: extendSchemaWithOp(
      "pause",
      ensureDescriptor(machineDescriptorIndex, "pause").inputSchema,
      { description: "Pause the machine using DMA halt until resumed." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(machineControlModule, "pause", rawArgs, ctx),
  },
  {
    op: "resume",
    schema: extendSchemaWithOp(
      "resume",
      ensureDescriptor(machineDescriptorIndex, "resume").inputSchema,
      { description: "Resume CPU execution after a DMA pause." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(machineControlModule, "resume", rawArgs, ctx),
  },
  {
    op: "reset",
    schema: extendSchemaWithOp(
      "reset",
      ensureDescriptor(machineDescriptorIndex, "reset_c64").inputSchema,
      { description: "Issue a soft reset without cutting power." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(machineControlModule, "reset_c64", rawArgs, ctx),
  },
  {
    op: "reboot",
    schema: extendSchemaWithOp(
      "reboot",
      ensureDescriptor(machineDescriptorIndex, "reboot_c64").inputSchema,
      { description: "Trigger a firmware reboot to recover from faults." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(machineControlModule, "reboot_c64", rawArgs, ctx),
  },
  {
    op: "poweroff",
    schema: extendSchemaWithOp(
      "poweroff",
      ensureDescriptor(machineDescriptorIndex, "poweroff").inputSchema,
      { description: "Request a controlled shutdown via the Ultimate firmware." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(machineControlModule, "poweroff", rawArgs, ctx),
  },
  {
    op: "menu",
    schema: extendSchemaWithOp(
      "menu",
      ensureDescriptor(machineDescriptorIndex, "menu_button").inputSchema,
      { description: "Toggle the Ultimate menu button for navigation." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(machineControlModule, "menu_button", rawArgs, ctx),
  },
  {
    op: "start_task",
    schema: extendSchemaWithOp(
      "start_task",
      ensureDescriptor(metaDescriptorIndex, "start_background_task").inputSchema,
      { description: "Start a named background task that runs on an interval." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(metaModule, "start_background_task", rawArgs, ctx),
  },
  {
    op: "stop_task",
    schema: extendSchemaWithOp(
      "stop_task",
      ensureDescriptor(metaDescriptorIndex, "stop_background_task").inputSchema,
      { description: "Stop a specific background task and clear its timer." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(metaModule, "stop_background_task", rawArgs, ctx),
  },
  {
    op: "stop_all_tasks",
    schema: extendSchemaWithOp(
      "stop_all_tasks",
      ensureDescriptor(metaDescriptorIndex, "stop_all_background_tasks").inputSchema,
      { description: "Stop every running background task and persist state." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(metaModule, "stop_all_background_tasks", rawArgs, ctx),
  },
  {
    op: "list_tasks",
    schema: extendSchemaWithOp(
      "list_tasks",
      ensureDescriptor(metaDescriptorIndex, "list_background_tasks").inputSchema,
      { description: "List known background tasks with status metadata." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(metaModule, "list_background_tasks", rawArgs, ctx),
  },
];

const systemOperationHandlers = createOperationHandlers(systemOperations);

const groupedSystemModule = systemOperations.length === 0
  ? null
  : defineToolModule({
      domain: "system",
      summary: "Grouped machine control and background task orchestration.",
      resources: ["c64://context/bootstrap"],
      prompts: ["memory-debug"],
      defaultTags: ["system", "control"],
      workflowHints: [
        "Use pause/resume around invasive memory changes, and explain the impact of resets or power changes.",
        "Combine background task operations with list_tasks to monitor long-running diagnostics.",
      ],
      tools: [
        {
          name: "c64.system",
          description: "Grouped entry point for power, reset, menu, and background task control.",
          summary: "Manages machine state (pause, reset, power) and schedules recurring background tasks.",
          inputSchema: discriminatedUnionSchema({
            description: "System operations available via the c64.system tool.",
            variants: systemOperations.map((operation) => operation.schema),
          }),
          tags: ["system", "control", "grouped"],
          examples: [
            {
              name: "Soft reset",
              description: "Issue a soft reset without cutting power",
              arguments: { op: "reset" },
            },
            {
              name: "Start background screen capture",
              description: "Launch a recurring read_screen task",
              arguments: {
                op: "start_task",
                name: "screen_poll",
                operation: "read_screen",
                intervalMs: 2000,
              },
            },
          ],
          execute: createOperationDispatcher<GenericOperationMap>(
            "c64.system",
            systemOperationHandlers,
          ),
        },
      ],
    });

    const graphicsOperations: GroupedOperationConfig[] = [
      {
        op: "create_petscii",
        schema: extendSchemaWithOp(
          "create_petscii",
          ensureDescriptor(graphicsDescriptorIndex, "create_petscii").inputSchema,
          { description: "Generate PETSCII art from prompts, text, or explicit bitmap data." },
        ),
  handler: groupedGraphicsHandlers.create_petscii,
      },
      {
        op: "render_petscii",
        schema: extendSchemaWithOp(
          "render_petscii",
          ensureDescriptor(graphicsDescriptorIndex, "render_petscii").inputSchema,
          { description: "Render PETSCII text with optional border/background colours." },
        ),
  handler: groupedGraphicsHandlers.render_petscii,
      },
      {
        op: "generate_sprite",
        schema: extendSchemaWithOp(
          "generate_sprite",
          ensureDescriptor(graphicsDescriptorIndex, "generate_sprite").inputSchema,
          { description: "Build and run a sprite PRG from raw 63-byte sprite data." },
        ),
  handler: groupedGraphicsHandlers.generate_sprite,
      },
      {
        op: "generate_bitmap",
        schema: extendSchemaWithOp(
          "generate_bitmap",
          {
            description: "Reserved high-resolution bitmap generator (coming soon).",
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          { description: "Reserved high-resolution bitmap generator (coming soon)." },
        ),
        handler: async () => toolErrorResult(
          new ToolExecutionError("c64.graphics op generate_bitmap is not yet available", {
            details: { available: false },
          }),
        ),
      },
    ];

  const graphicsOperationDispatcher = createOperationHandlers(graphicsOperations);

    const groupedGraphicsModule = graphicsOperations.length === 0
      ? null
      : defineToolModule({
          domain: "graphics",
          summary: "Grouped PETSCII, sprite, and upcoming bitmap helpers.",
          resources: ["c64://specs/vic", "c64://specs/basic", "c64://specs/assembly"],
          prompts: ["graphics-demo", "basic-program", "assembly-program"],
          defaultTags: ["graphics", "vic"],
          workflowHints: [
            "Use PETSCII helpers for text art and clarify whether the BASIC program executed or stayed a dry run.",
            "Mention sprite positions/colours so follow-up memory inspection stays grounded.",
          ],
          supportedPlatforms: ["c64u", "vice"],
          tools: [
            {
              name: "c64.graphics",
              description: "Grouped entry point for PETSCII art, sprite previews, and future bitmap generation.",
              summary: "Generates PETSCII art, renders text screens, or runs sprite demos from one tool.",
              inputSchema: discriminatedUnionSchema({
                description: "Graphics operations available via the c64.graphics tool.",
                variants: graphicsOperations.map((operation) => operation.schema),
              }),
              tags: ["graphics", "vic", "grouped"],
              examples: [
                {
                  name: "Create PETSCII art (dry run)",
                  description: "Synthesize art without uploading to the C64",
                  arguments: { op: "create_petscii", prompt: "duck on a pond", dryRun: true },
                },
                {
                  name: "Render PETSCII text",
                  description: "Print HELLO with blue border",
                  arguments: { op: "render_petscii", text: "HELLO", borderColor: 6 },
                },
                {
                  name: "Display sprite",
                  description: "Show sprite data at coordinates",
                  arguments: { op: "generate_sprite", sprite: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" },
                },
              ],
              execute: createOperationDispatcher<GenericOperationMap>(
                "c64.graphics",
                graphicsOperationDispatcher,
              ),
            },
          ],
        });

    const ragOperations: GroupedOperationConfig[] = [
      {
        op: "basic",
        schema: extendSchemaWithOp(
          "basic",
          ensureDescriptor(ragDescriptorIndex, "rag_retrieve_basic").inputSchema,
          { description: "Retrieve BASIC references and snippets from the local knowledge base." },
        ),
        handler: async (rawArgs, ctx) => invokeModuleTool(ragModule, "rag_retrieve_basic", rawArgs, ctx),
      },
      {
        op: "asm",
        schema: extendSchemaWithOp(
          "asm",
          ensureDescriptor(ragDescriptorIndex, "rag_retrieve_asm").inputSchema,
          { description: "Retrieve 6502/6510 assembly references from the local knowledge base." },
        ),
        handler: async (rawArgs, ctx) => invokeModuleTool(ragModule, "rag_retrieve_asm", rawArgs, ctx),
      },
    ];

    type DiskAttachmentMode = "readwrite" | "readonly" | "unlinked";
    type DiskImageFormat = "d64" | "d71" | "d81" | "dnp";
    type DiskTypeOverride = "d64" | "g64" | "d71" | "g71" | "d81";
    type DriveMode = "1541" | "1571" | "1581";

    interface DiskMountArgs extends Record<string, unknown> {
      drive: string;
      image: string;
      type?: string;
      attachmentMode?: string;
      driveMode?: string;
      verify: boolean;
      powerOnIfNeeded: boolean;
      resetAfterMount: boolean;
      maxRetries: number;
      retryDelayMs: number;
    }

    const diskMountArgsSchema = objectSchema<DiskMountArgs>({
      description: "Mount a disk image with optional verification and drive preparation.",
      properties: {
        drive: stringSchema({
          description: "Drive identifier (for example drive8).",
          minLength: 1,
        }),
        image: stringSchema({
          description: "Absolute or Ultimate filesystem path to the disk image.",
          minLength: 1,
        }),
        type: optionalSchema(stringSchema({
          description: "Override detected image type when firmware guesses incorrectly.",
          enum: ["d64", "g64", "d71", "g71", "d81"],
        })),
        attachmentMode: optionalSchema(stringSchema({
          description: "Attachment mode controlling how the firmware treats the mounted image.",
          enum: ["readwrite", "readonly", "unlinked"],
        })),
        driveMode: optionalSchema(stringSchema({
          description: "Drive emulation mode to switch to during verification.",
          enum: ["1541", "1571", "1581"],
        })),
        verify: booleanSchema({
          description: "When true, power on/reset/verify using the reliability workflow.",
          default: false,
        }),
        powerOnIfNeeded: booleanSchema({
          description: "Power on the drive automatically before mounting when verify=true.",
          default: true,
        }),
        resetAfterMount: booleanSchema({
          description: "Issue a drive reset after mounting when verify=true.",
          default: true,
        }),
        maxRetries: numberSchema({
          description: "Maximum number of mount retries when verify=true.",
          integer: true,
          minimum: 0,
          maximum: 5,
          default: 2,
        }),
        retryDelayMs: numberSchema({
          description: "Delay between mount retry attempts when verify=true.",
          integer: true,
          minimum: 0,
          maximum: 5000,
          default: 500,
        }),
      },
      required: ["drive", "image"],
      additionalProperties: false,
    });

    interface CreateImageArgs extends Record<string, unknown> {
      format: string;
      path: string;
      diskname?: string;
      tracks?: number;
    }

    const createImageArgsSchema = objectSchema<CreateImageArgs>({
      description: "Create a blank disk image (D64/D71/D81/DNP).",
      properties: {
        format: stringSchema({
          description: "Disk image format to create.",
          enum: ["d64", "d71", "d81", "dnp"],
        }),
        path: stringSchema({
          description: "Destination path on the Ultimate filesystem.",
          minLength: 1,
        }),
        diskname: optionalSchema(stringSchema({
          description: "Optional disk label (1-16 characters, converted to PETSCII).",
          minLength: 1,
          maxLength: 16,
        })),
        tracks: optionalSchema(numberSchema({
          description: "Track count (D64 supports 35 or 40; DNP requires explicit tracks).",
          integer: true,
          minimum: 1,
          maximum: 255,
        })),
      },
      required: ["format", "path"],
      additionalProperties: false,
    });

    interface PrintBitmapArgs extends Record<string, unknown> {
      printer: string;
      columns: readonly number[];
      repeats?: number;
      useSubRepeat?: number;
      secondaryAddress?: number;
      ensureMsb: boolean;
      mode?: string;
      density?: number;
      timesPerLine?: number;
    }

    const printBitmapArgsSchema = objectSchema<PrintBitmapArgs>({
      description: "Print a bitmap row using Commodore or Epson workflows.",
      properties: {
        printer: stringSchema({
          description: "Target printer family.",
          enum: ["commodore", "epson"],
          default: "commodore",
        }),
        columns: arraySchema(numberSchema({
          description: "Bitmap column byte (0-255).",
          integer: true,
          minimum: 0,
          maximum: 255,
        }), {
          description: "Sequence of bitmap columns.",
          minItems: 1,
        }),
        repeats: optionalSchema(numberSchema({
          description: "Number of times to repeat the row (1-255).",
          integer: true,
          minimum: 1,
          maximum: 255,
        })),
        useSubRepeat: optionalSchema(numberSchema({
          description: "Repeat the next byte this many times (Commodore BIM SUB).",
          integer: true,
          minimum: 1,
          maximum: 255,
        })),
        secondaryAddress: optionalSchema(numberSchema({
          description: "Secondary address for device 4 (0 or 7).",
          integer: true,
          minimum: 0,
          maximum: 7,
        })),
        ensureMsb: booleanSchema({
          description: "Ensure MSB set for Commodore printers.",
          default: true,
        }),
        mode: optionalSchema(stringSchema({
          description: "Epson ESC/P graphics mode (K/L/Y/Z/*).",
          minLength: 1,
          maxLength: 1,
        })),
        density: optionalSchema(numberSchema({
          description: "Density parameter when using Epson mode '*'.",
          integer: true,
          minimum: 0,
          maximum: 3,
        })),
        timesPerLine: optionalSchema(numberSchema({
          description: "Number of times to print the row per line (1-10).",
          integer: true,
          minimum: 1,
          maximum: 10,
        })),
      },
      required: ["printer", "columns"],
      additionalProperties: false,
    });

    const diskOperations: GroupedOperationConfig[] = [
      {
        op: "list_drives",
        schema: extendSchemaWithOp(
          "list_drives",
          ensureDescriptor(storageDescriptorIndex, "drives_list").inputSchema,
          { description: "List Ultimate drive slots and their mounted images." },
        ),
        handler: async (rawArgs, ctx) => invokeModuleTool(storageModule, "drives_list", rawArgs, ctx),
      },
      {
        op: "mount",
        schema: extendSchemaWithOp(
          "mount",
          diskMountArgsSchema.jsonSchema,
          { description: "Mount a disk image with optional verification and retries." },
        ),
        handler: async (rawArgs, ctx) => {
          const { [OPERATION_DISCRIMINATOR]: _ignored, ...rest } = rawArgs;
          const parsed = diskMountArgsSchema.parse(rest);
          const type = parsed.type as DiskTypeOverride | undefined;
          const attachmentMode = parsed.attachmentMode as DiskAttachmentMode | undefined;
          const driveMode = parsed.driveMode as DriveMode | undefined;

          if (parsed.verify) {
            const metaPayload = {
              drive: parsed.drive,
              imagePath: parsed.image,
              mode: driveMode,
              powerOnIfNeeded: parsed.powerOnIfNeeded,
              resetAfterMount: parsed.resetAfterMount,
              maxRetries: parsed.maxRetries,
              retryDelayMs: parsed.retryDelayMs,
              verifyMount: true,
            };
            return metaModule.invoke("drive_mount_and_verify", metaPayload, ctx);
          }

          const payload: Record<string, unknown> = {
            drive: parsed.drive,
            image: parsed.image,
          };
          if (type) {
            payload.type = type;
          }
          if (attachmentMode) {
            payload.mode = attachmentMode;
          }

          return storageModule.invoke("drive_mount", payload, ctx);
        },
      },
      {
        op: "unmount",
        schema: extendSchemaWithOp(
          "unmount",
          ensureDescriptor(storageDescriptorIndex, "drive_remove").inputSchema,
          { description: "Remove the mounted image from an Ultimate drive slot." },
        ),
        handler: async (rawArgs, ctx) => invokeModuleTool(storageModule, "drive_remove", rawArgs, ctx),
      },
      {
        op: "file_info",
        schema: extendSchemaWithOp(
          "file_info",
          ensureDescriptor(storageDescriptorIndex, "file_info").inputSchema,
          { description: "Inspect metadata for a file on the Ultimate filesystem." },
        ),
        handler: async (rawArgs, ctx) => invokeModuleTool(storageModule, "file_info", rawArgs, ctx),
      },
      {
        op: "create_image",
        schema: extendSchemaWithOp(
          "create_image",
          createImageArgsSchema.jsonSchema,
          { description: "Create a blank disk image of the specified format." },
        ),
        handler: async (rawArgs, ctx) => {
          const { [OPERATION_DISCRIMINATOR]: _ignored, ...rest } = rawArgs;
          const parsed = createImageArgsSchema.parse(rest);
          const format = parsed.format as DiskImageFormat;
          const { path, diskname, tracks } = parsed;

          switch (format) {
            case "d64":
              if (tracks !== undefined && tracks !== 35 && tracks !== 40) {
                throw new ToolValidationError("D64 images support 35 or 40 tracks", {
                  path: "$.tracks",
                  details: { allowed: [35, 40], received: tracks },
                });
              }
              return storageModule.invoke("create_d64", {
                path,
                tracks,
                diskname,
              }, ctx);
            case "d71":
              if (tracks !== undefined) {
                throw new ToolValidationError("tracks is not used for D71 images", {
                  path: "$.tracks",
                });
              }
              return storageModule.invoke("create_d71", { path, diskname }, ctx);
            case "d81":
              if (tracks !== undefined) {
                throw new ToolValidationError("tracks is not used for D81 images", {
                  path: "$.tracks",
                });
              }
              return storageModule.invoke("create_d81", { path, diskname }, ctx);
            case "dnp":
              if (tracks === undefined) {
                throw new ToolValidationError("tracks is required for DNP images", {
                  path: "$.tracks",
                });
              }
              return storageModule.invoke("create_dnp", { path, tracks, diskname }, ctx);
            default:
              throw new ToolValidationError("Unsupported disk format", {
                path: "$.format",
                details: { format },
              });
          }
        },
      },
      {
        op: "find_and_run",
        schema: extendSchemaWithOp(
          "find_and_run",
          ensureDescriptor(metaDescriptorIndex, "find_and_run_program_by_name").inputSchema,
          { description: "Search for a PRG/CRT by name substring and run the first match." },
        ),
        handler: async (rawArgs, ctx) => invokeModuleTool(metaModule, "find_and_run_program_by_name", rawArgs, ctx),
      },
    ];

    const driveOperations: GroupedOperationConfig[] = [
      {
        op: "reset",
        schema: extendSchemaWithOp(
          "reset",
          ensureDescriptor(storageDescriptorIndex, "drive_reset").inputSchema,
          { description: "Issue an IEC reset for the selected drive slot." },
        ),
        handler: async (rawArgs, ctx) => invokeModuleTool(storageModule, "drive_reset", rawArgs, ctx),
      },
      {
        op: "power_on",
        schema: extendSchemaWithOp(
          "power_on",
          ensureDescriptor(storageDescriptorIndex, "drive_on").inputSchema,
          { description: "Power on a specific Ultimate drive slot." },
        ),
        handler: async (rawArgs, ctx) => invokeModuleTool(storageModule, "drive_on", rawArgs, ctx),
      },
      {
        op: "power_off",
        schema: extendSchemaWithOp(
          "power_off",
          ensureDescriptor(storageDescriptorIndex, "drive_off").inputSchema,
          { description: "Power off a specific Ultimate drive slot." },
        ),
        handler: async (rawArgs, ctx) => invokeModuleTool(storageModule, "drive_off", rawArgs, ctx),
      },
      {
        op: "load_rom",
        schema: extendSchemaWithOp(
          "load_rom",
          ensureDescriptor(storageDescriptorIndex, "drive_load_rom").inputSchema,
          { description: "Temporarily load a custom ROM into an Ultimate drive slot." },
        ),
        handler: async (rawArgs, ctx) => invokeModuleTool(storageModule, "drive_load_rom", rawArgs, ctx),
      },
      {
        op: "set_mode",
        schema: extendSchemaWithOp(
          "set_mode",
          ensureDescriptor(storageDescriptorIndex, "drive_mode").inputSchema,
          { description: "Set the emulation mode for a drive slot (1541/1571/1581)." },
        ),
        handler: async (rawArgs, ctx) => invokeModuleTool(storageModule, "drive_mode", rawArgs, ctx),
      },
    ];

    const printerOperations: GroupedOperationConfig[] = [
      {
        op: "print_text",
        schema: extendSchemaWithOp(
          "print_text",
          ensureDescriptor(printerDescriptorIndex, "print_text").inputSchema,
          { description: "Generate BASIC that prints text to device 4." },
        ),
        handler: async (rawArgs, ctx) => invokeModuleTool(printerModule, "print_text", rawArgs, ctx),
      },
      {
        op: "print_bitmap",
        schema: extendSchemaWithOp(
          "print_bitmap",
          printBitmapArgsSchema.jsonSchema,
          { description: "Print a bitmap row via Commodore (BIM) or Epson ESC/P workflows." },
        ),
        handler: async (rawArgs, ctx) => {
          const { [OPERATION_DISCRIMINATOR]: _ignored, ...rest } = rawArgs;
          const parsed = printBitmapArgsSchema.parse(rest);
          const printer = parsed.printer as "commodore" | "epson";

          if (parsed.secondaryAddress !== undefined && parsed.secondaryAddress !== 0 && parsed.secondaryAddress !== 7) {
            throw new ToolValidationError("secondaryAddress must be 0 or 7", {
              path: "$.secondaryAddress",
              details: { received: parsed.secondaryAddress },
            });
          }

          if (printer === "commodore") {
            const payload: Record<string, unknown> = {
              columns: parsed.columns,
              repeats: parsed.repeats,
              useSubRepeat: parsed.useSubRepeat,
              secondaryAddress: parsed.secondaryAddress,
              ensureMsb: parsed.ensureMsb,
            };
            return printerModule.invoke("print_bitmap_commodore", payload, ctx);
          }

          const payload: Record<string, unknown> = {
            columns: parsed.columns,
            mode: parsed.mode,
            density: parsed.density,
            repeats: parsed.repeats,
            timesPerLine: parsed.timesPerLine,
          };
          return printerModule.invoke("print_bitmap_epson", payload, ctx);
        },
      },
      {
        op: "define_chars",
        schema: extendSchemaWithOp(
          "define_chars",
          ensureDescriptor(printerDescriptorIndex, "define_printer_chars").inputSchema,
          { description: "Define custom printer characters (Commodore DLL mode)." },
        ),
        handler: async (rawArgs, ctx) => invokeModuleTool(printerModule, "define_printer_chars", rawArgs, ctx),
      },
    ];

const diskOperationHandlers = createOperationHandlers(diskOperations);
const driveOperationHandlers = createOperationHandlers(driveOperations);
const printerOperationHandlers = createOperationHandlers(printerOperations);

interface ConfigSnapshotArgs extends Record<string, unknown> {
  readonly path: string;
}

interface ConfigRestoreArgs extends Record<string, unknown> {
  readonly path: string;
  readonly applyToFlash?: boolean;
}

interface ConfigDiffArgs extends Record<string, unknown> {
  readonly path: string;
}

const configSnapshotArgsSchema = objectSchema<ConfigSnapshotArgs>({
  description: "Snapshot all configuration categories to a JSON file.",
  properties: {
    path: stringSchema({
      description: "Absolute or workspace-relative path where the snapshot file will be written.",
      minLength: 1,
    }),
  },
  required: ["path"],
  additionalProperties: false,
});

const configRestoreArgsSchema = objectSchema<ConfigRestoreArgs>({
  description: "Restore configuration from a snapshot, optionally persisting to flash.",
  properties: {
    path: stringSchema({
      description: "Snapshot file to read (must contain categories payload).",
      minLength: 1,
    }),
    applyToFlash: optionalSchema(booleanSchema({
      description: "When true, save the restored configuration to flash immediately.",
      default: false,
    })),
  },
  required: ["path"],
  additionalProperties: false,
});

const configDiffArgsSchema = objectSchema<ConfigDiffArgs>({
  description: "Compare current configuration against a saved snapshot file.",
  properties: {
    path: stringSchema({
      description: "Snapshot file to compare with.",
      minLength: 1,
    }),
  },
  required: ["path"],
  additionalProperties: false,
});

const configOperations: GroupedOperationConfig[] = [
  {
    op: "list",
    schema: extendSchemaWithOp(
      "list",
      ensureDescriptor(developerDescriptorIndex, "config_list").inputSchema,
      { description: "List configuration categories reported by the firmware." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(developerModule, "config_list", rawArgs, ctx),
  },
  {
    op: "get",
    schema: extendSchemaWithOp(
      "get",
      ensureDescriptor(developerDescriptorIndex, "config_get").inputSchema,
      { description: "Read a configuration category or specific item." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(developerModule, "config_get", rawArgs, ctx),
  },
  {
    op: "set",
    schema: extendSchemaWithOp(
      "set",
      ensureDescriptor(developerDescriptorIndex, "config_set").inputSchema,
      { description: "Write a configuration value in the selected category." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(developerModule, "config_set", rawArgs, ctx),
  },
  {
    op: "batch_update",
    schema: extendSchemaWithOp(
      "batch_update",
      ensureDescriptor(developerDescriptorIndex, "config_batch_update").inputSchema,
      { description: "Apply multiple configuration updates in a single request." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(developerModule, "config_batch_update", rawArgs, ctx),
  },
  {
    op: "load_flash",
    schema: extendSchemaWithOp(
      "load_flash",
      ensureDescriptor(developerDescriptorIndex, "config_load_from_flash").inputSchema,
      { description: "Load configuration from flash storage." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(developerModule, "config_load_from_flash", rawArgs, ctx),
  },
  {
    op: "save_flash",
    schema: extendSchemaWithOp(
      "save_flash",
      ensureDescriptor(developerDescriptorIndex, "config_save_to_flash").inputSchema,
      { description: "Persist the current configuration to flash storage." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(developerModule, "config_save_to_flash", rawArgs, ctx),
  },
  {
    op: "reset_defaults",
    schema: extendSchemaWithOp(
      "reset_defaults",
      ensureDescriptor(developerDescriptorIndex, "config_reset_to_default").inputSchema,
      { description: "Reset firmware configuration to factory defaults." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(developerModule, "config_reset_to_default", rawArgs, ctx),
  },
  {
    op: "read_debugreg",
    schema: extendSchemaWithOp(
      "read_debugreg",
      ensureDescriptor(developerDescriptorIndex, "debugreg_read").inputSchema,
      { description: "Read the Ultimate debug register ($D7FF)." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(developerModule, "debugreg_read", rawArgs, ctx),
  },
  {
    op: "write_debugreg",
    schema: extendSchemaWithOp(
      "write_debugreg",
      ensureDescriptor(developerDescriptorIndex, "debugreg_write").inputSchema,
      { description: "Write a hex value to the Ultimate debug register ($D7FF)." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(developerModule, "debugreg_write", rawArgs, ctx),
  },
  {
    op: "info",
    schema: extendSchemaWithOp(
      "info",
      ensureDescriptor(developerDescriptorIndex, "info").inputSchema,
      { description: "Retrieve Ultimate hardware information and status." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(developerModule, "info", rawArgs, ctx),
  },
  {
    op: "version",
    schema: extendSchemaWithOp(
      "version",
      ensureDescriptor(developerDescriptorIndex, "version").inputSchema,
      { description: "Fetch firmware version details." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(developerModule, "version", rawArgs, ctx),
  },
  {
    op: "snapshot",
    schema: extendSchemaWithOp(
      "snapshot",
      configSnapshotArgsSchema.jsonSchema,
      { description: "Snapshot configuration to disk for later restore or diff." },
    ),
    handler: async (rawArgs, ctx) => {
      const { [OPERATION_DISCRIMINATOR]: _ignored, ...rest } = rawArgs;
      const parsed = configSnapshotArgsSchema.parse(rest);
      return metaModule.invoke("config_snapshot_and_restore", {
        action: "snapshot",
        path: parsed.path,
      }, ctx);
    },
  },
  {
    op: "restore",
    schema: extendSchemaWithOp(
      "restore",
      configRestoreArgsSchema.jsonSchema,
      { description: "Restore configuration from a snapshot file." },
    ),
    handler: async (rawArgs, ctx) => {
      const { [OPERATION_DISCRIMINATOR]: _ignored, ...rest } = rawArgs;
      const parsed = configRestoreArgsSchema.parse(rest);
      if (parsed.applyToFlash === undefined) {
        return metaModule.invoke("config_snapshot_and_restore", {
          action: "restore",
          path: parsed.path,
        }, ctx);
      }
      return metaModule.invoke("config_snapshot_and_restore", {
        action: "restore",
        path: parsed.path,
        applyToFlash: parsed.applyToFlash,
      }, ctx);
    },
  },
  {
    op: "diff",
    schema: extendSchemaWithOp(
      "diff",
      configDiffArgsSchema.jsonSchema,
      { description: "Compare the current configuration with a snapshot." },
    ),
    handler: async (rawArgs, ctx) => {
      const { [OPERATION_DISCRIMINATOR]: _ignored, ...rest } = rawArgs;
      const parsed = configDiffArgsSchema.parse(rest);
      return metaModule.invoke("config_snapshot_and_restore", {
        action: "diff",
        path: parsed.path,
      }, ctx);
    },
  },
  {
    op: "shuffle",
    schema: extendSchemaWithOp(
      "shuffle",
      ensureDescriptor(metaDescriptorIndex, "program_shuffle").inputSchema,
      { description: "Discover PRG/CRT files and run each with optional screen capture." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(metaModule, "program_shuffle", rawArgs, ctx),
  },
];

const configOperationHandlers = createOperationHandlers(configOperations);

const extractOperations: GroupedOperationConfig[] = [
  {
    op: "sprites",
    schema: extendSchemaWithOp(
      "sprites",
      ensureDescriptor(metaDescriptorIndex, "extract_sprites_from_ram").inputSchema,
      { description: "Scan RAM for sprites and optionally export .spr files." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(metaModule, "extract_sprites_from_ram", rawArgs, ctx),
  },
  {
    op: "charset",
    schema: extendSchemaWithOp(
      "charset",
      ensureDescriptor(metaDescriptorIndex, "rip_charset_from_ram").inputSchema,
      { description: "Locate and extract 2KB character sets from RAM." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(metaModule, "rip_charset_from_ram", rawArgs, ctx),
  },
  {
    op: "memory_dump",
    schema: extendSchemaWithOp(
      "memory_dump",
      ensureDescriptor(metaDescriptorIndex, "memory_dump_to_file").inputSchema,
      { description: "Dump a RAM range to hex or binary files with manifest metadata." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(metaModule, "memory_dump_to_file", rawArgs, ctx),
  },
  {
    op: "fs_stats",
    schema: extendSchemaWithOp(
      "fs_stats",
      ensureDescriptor(metaDescriptorIndex, "filesystem_stats_by_extension").inputSchema,
      { description: "Walk the filesystem and aggregate counts/bytes by extension." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(metaModule, "filesystem_stats_by_extension", rawArgs, ctx),
  },
  {
    op: "firmware_health",
    schema: extendSchemaWithOp(
      "firmware_health",
      ensureDescriptor(metaDescriptorIndex, "firmware_info_and_healthcheck").inputSchema,
      { description: "Run firmware readiness checks and report status metrics." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(metaModule, "firmware_info_and_healthcheck", rawArgs, ctx),
  },
];

const extractOperationHandlers = createOperationHandlers(extractOperations);

const streamOperations: GroupedOperationConfig[] = [
  {
    op: "start",
    schema: extendSchemaWithOp(
      "start",
      ensureDescriptor(streamingDescriptorIndex, "stream_start").inputSchema,
      { description: "Start an Ultimate streaming session toward a host:port target." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(streamingModule, "stream_start", rawArgs, ctx),
  },
  {
    op: "stop",
    schema: extendSchemaWithOp(
      "stop",
      ensureDescriptor(streamingDescriptorIndex, "stream_stop").inputSchema,
      { description: "Stop an active Ultimate streaming session." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(streamingModule, "stream_stop", rawArgs, ctx),
  },
];

const streamOperationHandlers = createOperationHandlers(streamOperations);

const ragOperationHandlers = createOperationHandlers(ragOperations);

const groupedConfigModule = configOperations.length === 0
  ? null
  : defineToolModule({
      domain: "config",
      summary: "Grouped configuration management, diagnostics, and snapshot workflows.",
      resources: ["c64://context/bootstrap", "c64://docs/index"],
      prompts: ["memory-debug"],
      defaultTags: ["config", "diagnostics"],
      workflowHints: [
        "List categories before changing values so users can confirm firmware-provided names.",
        "Mention when operations persist to flash or modify debug registers to highlight impacts.",
        "Call out snapshot file paths so users can version-control or reuse them later.",
      ],
      tools: [
        {
          name: "c64.config",
          description: "Grouped entry point for configuration reads/writes, diagnostics, and snapshots.",
          summary: "List or update settings, access firmware info, take snapshots, and run program shuffle workflows.",
          inputSchema: discriminatedUnionSchema({
            description: "Configuration operations available via the c64.config tool.",
            variants: configOperations.map((operation) => operation.schema),
          }),
          tags: ["config", "diagnostics", "grouped"],
          examples: [
            {
              name: "List categories",
              description: "Enumerate configuration categories",
              arguments: { op: "list" },
            },
            {
              name: "Set volume",
              description: "Adjust audio volume to 70",
              arguments: { op: "set", category: "Audio", item: "Volume", value: 70 },
            },
            {
              name: "Snapshot config",
              description: "Write configuration snapshot to disk",
              arguments: { op: "snapshot", path: "./snapshots/c64.json" },
            },
          ],
          execute: createOperationDispatcher<GenericOperationMap>(
            "c64.config",
            configOperationHandlers,
          ),
        },
      ],
    });

const groupedExtractModule = extractOperations.length === 0
  ? null
  : defineToolModule({
      domain: "extract",
      summary: "Grouped extraction helpers for sprites, charsets, memory dumps, and diagnostics.",
      resources: ["c64://context/bootstrap", "c64://specs/basic", "c64://specs/assembly"],
      defaultTags: ["extract", "diagnostics"],
      workflowHints: [
        "Pause the machine when advised so dumps and sprite scans remain stable.",
        "Summarise output file paths or sample counts so users can inspect artifacts quickly.",
      ],
      tools: [
        {
          name: "c64.extract",
          description: "Grouped entry point for sprite/charset extraction, memory dumps, filesystem stats, and firmware health checks.",
          summary: "Export sprites or charsets, dump RAM, compute filesystem stats, or run firmware health checks.",
          inputSchema: discriminatedUnionSchema({
            description: "Extraction operations available via the c64.extract tool.",
            variants: extractOperations.map((operation) => operation.schema),
          }),
          tags: ["extract", "diagnostics", "grouped"],
          examples: [
            {
              name: "Dump RAM to file",
              description: "Write $0400-$07FF to hex file",
              arguments: { op: "memory_dump", address: "$0400", length: 1024, outputPath: "./dumps/screen.hex" },
            },
            {
              name: "Scan sprites",
              description: "Scan $2000 for sprites",
              arguments: { op: "sprites", address: "$2000", length: 2048 },
            },
          ],
          execute: createOperationDispatcher<GenericOperationMap>(
            "c64.extract",
            extractOperationHandlers,
          ),
        },
      ],
    });

const groupedStreamModule = streamOperations.length === 0
  ? null
  : defineToolModule({
      domain: "stream",
      summary: "Grouped streaming helpers for starting and stopping Ultimate capture sessions.",
      resources: ["c64://docs/index", "c64://specs/sid"],
      prompts: ["sid-music"],
      defaultTags: ["stream", "monitor"],
      workflowHints: [
        "Confirm stream targets for the user so they can connect their tooling.",
        "Remind users to stop streams when capture completes to free resources.",
      ],
      tools: [
        {
          name: "c64.stream",
          description: "Grouped entry point for starting and stopping Ultimate streaming sessions.",
          summary: "Start or stop audio/video/debug streaming in a single tool.",
          inputSchema: discriminatedUnionSchema({
            description: "Streaming operations available via the c64.stream tool.",
            variants: streamOperations.map((operation) => operation.schema),
          }),
          tags: ["stream", "monitor", "grouped"],
          examples: [
            {
              name: "Start audio stream",
              description: "Send audio to localhost",
              arguments: { op: "start", stream: "audio", target: "127.0.0.1:9000" },
            },
            {
              name: "Stop audio stream",
              description: "Stop streaming",
              arguments: { op: "stop", stream: "audio" },
            },
          ],
          execute: createOperationDispatcher<GenericOperationMap>(
            "c64.stream",
            streamOperationHandlers,
          ),
        },
      ],
    });

const groupedDiskModule = diskOperations.length === 0
  ? null
  : defineToolModule({
      domain: "storage",
      summary: "Grouped disk image management, mounting, and discovery tools.",
      resources: ["c64://context/bootstrap"],
      prompts: ["drive-management"],
      defaultTags: ["storage", "drive"],
      workflowHints: [
        "Summarise drive state before and after mounts so the user can confirm hardware changes.",
        "Call out when verification retries succeed or fail so follow-up actions are clear.",
      ],
      tools: [
        {
          name: "c64.disk",
          description: "Grouped entry point for disk mounts, listings, image creation, and program discovery.",
          summary: "Mount or unmount images, create new disks, list drives, and find programs from one tool.",
          inputSchema: discriminatedUnionSchema({
            description: "Disk operations available via the c64.disk tool.",
            variants: diskOperations.map((operation) => operation.schema),
          }),
          tags: ["storage", "drive", "grouped"],
          examples: [
            {
              name: "Mount image with verification",
              description: "Power on drive8, mount image, and verify",
              arguments: { op: "mount", drive: "drive8", image: "/tmp/demo.d64", verify: true },
            },
            {
              name: "Create D81",
              description: "Create blank D81 image",
              arguments: { op: "create_image", format: "d81", path: "/tmp/new.d81" },
            },
            {
              name: "List drives",
              description: "Fetch drive status",
              arguments: { op: "list_drives" },
            },
          ],
          execute: createOperationDispatcher<GenericOperationMap>(
            "c64.disk",
            diskOperationHandlers,
          ),
        },
      ],
    });

const groupedDriveModule = driveOperations.length === 0
  ? null
  : defineToolModule({
      domain: "drive",
      summary: "Grouped drive power, reset, ROM, and mode helpers.",
      resources: ["c64://context/bootstrap"],
      defaultTags: ["drive", "hardware"],
      workflowHints: [
        "State the resulting power/mode/ROM so the user can reconcile IEC behaviour.",
        "Suggest running c64.disk (op list_drives) to confirm status when appropriate.",
      ],
      tools: [
        {
          name: "c64.drive",
          description: "Grouped entry point for drive power, mode, reset, and ROM operations.",
          summary: "Power cycle drive slots, reset IEC state, switch emulation modes, or load custom ROMs.",
          inputSchema: discriminatedUnionSchema({
            description: "Drive operations available via the c64.drive tool.",
            variants: driveOperations.map((operation) => operation.schema),
          }),
          tags: ["drive", "hardware", "grouped"],
          examples: [
            {
              name: "Power on drive",
              description: "Enable drive8",
              arguments: { op: "power_on", drive: "drive8" },
            },
            {
              name: "Set 1581 mode",
              description: "Switch emulation mode",
              arguments: { op: "set_mode", drive: "drive8", mode: "1581" },
            },
          ],
          execute: createOperationDispatcher<GenericOperationMap>(
            "c64.drive",
            driveOperationHandlers,
          ),
        },
      ],
    });

const groupedPrinterModule = printerOperations.length === 0
  ? null
  : defineToolModule({
      domain: "printer",
      summary: "Grouped printer text, bitmap, and character definition helpers.",
      resources: ["c64://context/bootstrap"],
      defaultTags: ["printer", "device"],
      workflowHints: [
        "Mention device/secondary addresses so the user knows which printer workflow ran.",
        "When defining characters, remind the user to send the BASIC program returned in the payload.",
      ],
      tools: [
        {
          name: "c64.printer",
          description: "Grouped entry point for Commodore and Epson printing helpers.",
          summary: "Print text or bitmaps and define custom characters for Commodore or Epson printers.",
          inputSchema: discriminatedUnionSchema({
            description: "Printer operations available via the c64.printer tool.",
            variants: printerOperations.map((operation) => operation.schema),
          }),
          tags: ["printer", "device", "grouped"],
          examples: [
            {
              name: "Print text",
              description: "Generate BASIC for device 4",
              arguments: { op: "print_text", text: "HELLO", ensureReturn: true },
            },
            {
              name: "Print bitmap",
              description: "Send Epson graphics row",
              arguments: { op: "print_bitmap", printer: "epson", columns: [0, 255, 0], mode: "*", density: 3 },
            },
          ],
          execute: createOperationDispatcher<GenericOperationMap>(
            "c64.printer",
            printerOperationHandlers,
          ),
        },
      ],
    });

const groupedRagModule = ragOperations.length === 0
  ? null
  : defineToolModule({
      domain: "rag",
      summary: "Grouped retrieval helpers for BASIC and assembly references.",
      resources: ["c64://specs/basic", "c64://specs/assembly", "c64://context/bootstrap"],
      prompts: ["basic-program", "assembly-program"],
      defaultTags: ["rag", "search"],
      workflowHints: [
        "Use BASIC retrieval before synthesising new BASIC code and mention primary resources in responses.",
        "For assembly, note registers or addresses surfaced so the user can inspect them further.",
      ],
      supportedPlatforms: ["c64u", "vice"],
      tools: [
        {
          name: "c64.rag",
          description: "Grouped entry point for BASIC and assembly RAG lookups.",
          summary: "Returns curated knowledge references for BASIC or 6502/6510 assembly queries.",
          inputSchema: discriminatedUnionSchema({
            description: "RAG operations available via the c64.rag tool.",
            variants: ragOperations.map((operation) => operation.schema),
          }),
          tags: ["rag", "knowledge", "grouped"],
          examples: [
            {
              name: "Lookup BASIC references",
              description: "Find PRINT syntax guidance",
              arguments: { op: "basic", q: "basic print device 4" },
            },
            {
              name: "Retrieve assembly snippet",
              description: "Search for raster IRQ examples",
              arguments: { op: "asm", q: "stable raster irq" },
            },
          ],
          execute: createOperationDispatcher<GenericOperationMap>(
            "c64.rag",
            ragOperationHandlers,
          ),
        },
      ],
    });

const groupedModules: Array<[string, ToolModule | null]> = [
  ["c64.program", groupedProgramModule],
  ["c64.memory", groupedMemoryModule],
  ["c64.sound", groupedSoundModule],
  ["c64.system", groupedSystemModule],
  ["c64.graphics", groupedGraphicsModule],
  ["c64.rag", groupedRagModule],
  ["c64.disk", groupedDiskModule],
  ["c64.drive", groupedDriveModule],
  ["c64.printer", groupedPrinterModule],
  ["c64.config", groupedConfigModule],
  ["c64.extract", groupedExtractModule],
  ["c64.stream", groupedStreamModule],
];

for (const [name, module] of groupedModules) {
  if (!module) {
    throw new Error(`Grouped tool ${name} is not available`);
  }
}

const toolModules: ToolModule[] = groupedModules.map(([, module]) => module as ToolModule);

const toolMap: Map<string, RegisteredTool> = new Map();

for (const module of toolModules) {
  for (const descriptor of module.describeTools()) {
    if (toolMap.has(descriptor.name)) {
      throw new Error(
        `Duplicate tool name detected while registering modules: ${descriptor.name}`,
      );
    }
    toolMap.set(descriptor.name, { module, descriptor });
  }
}

export const toolRegistry = {
  list(): readonly ToolDescriptor[] {
    return Array.from(toolMap.values(), (entry) => entry.descriptor);
  },

  async invoke(
    name: string,
    args: unknown,
    ctx: ToolExecutionContext,
  ): Promise<ToolRunResult> {
    const enrichedCtx: ToolExecutionContext = {
      ...ctx,
      platform: ctx.platform ?? getPlatformStatus(),
      setPlatform: ctx.setPlatform ?? setPlatform,
    };

    const entry = toolMap.get(name);
    if (!entry) {
      throw new Error(`Unknown tool: ${name}`);
    }

    return entry.module.invoke(name, args, enrichedCtx);
  },
};

export function describeToolModules(): readonly ToolModuleDescriptor[] {
  return toolModules.map((module) => ({
    domain: module.domain,
    summary: module.summary,
    defaultTags: module.defaultTags,
    workflowHints: module.workflowHints ?? [],
    tools: module.describeTools(),
  }));
}
