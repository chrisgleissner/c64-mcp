import type { JsonSchema, ToolDescriptor, ToolExecutionContext, ToolModule, ToolRunResult } from "./types.js";
import { createOperationDispatcher, defineToolModule, discriminatedUnionSchema, OPERATION_DISCRIMINATOR } from "./types.js";
import { programRunnersModule, programOperationHandlers as groupedProgramHandlers } from "./programRunners.js";
import { memoryModule, memoryOperationHandlers as groupedMemoryHandlers } from "./memory.js";
import { audioModule } from "./audio.js";
import { machineControlModule } from "./machineControl.js";
import { storageModule } from "./storage.js";
import { graphicsModule } from "./graphics.js";
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
  readonly module?: ToolModule;
  readonly legacyName?: string;
  readonly handler?: (
    args: Record<string, unknown> & { readonly [OPERATION_DISCRIMINATOR]: string },
    ctx: ToolExecutionContext,
  ) => Promise<ToolRunResult>;
  readonly transform?: (args: Record<string, unknown>) => unknown;
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
    if (operation.handler) {
      handlers[operation.op] = operation.handler;
      continue;
    }

    const module = operation.module;
    const legacyName = operation.legacyName;

    if (!module || !legacyName) {
      throw new Error(`Grouped operation ${operation.op} is missing a handler or module delegation.`);
    }

    handlers[operation.op] = async (rawArgs, ctx) => {
      const { [OPERATION_DISCRIMINATOR]: _ignored, ...rest } = rawArgs;
      const payload = operation.transform ? operation.transform(rest) : rest;
      return module.invoke(legacyName, payload, ctx);
    };
  }

  return handlers as import("./types.js").OperationHandlerMap<GenericOperationMap>;
}

function dropOpTransform(args: Record<string, unknown>): Record<string, unknown> {
  return args;
}

const programDescriptorIndex = new Map(programRunnersModule.describeTools().map((descriptor) => [descriptor.name, descriptor]));
const audioDescriptorIndex = new Map(audioModule.describeTools().map((descriptor) => [descriptor.name, descriptor]));
const metaDescriptorIndex = new Map(metaModule.describeTools().map((descriptor) => [descriptor.name, descriptor]));
const memoryDescriptorIndex = new Map(memoryModule.describeTools().map((descriptor) => [descriptor.name, descriptor]));

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
    module: programRunnersModule,
    legacyName: "load_prg_file",
    schema: extendSchemaWithOp(
      "load_prg",
      ensureDescriptor(programDescriptorIndex, "load_prg_file").inputSchema,
      { description: "Load a PRG from Ultimate storage without executing it." },
    ),
    handler: groupedProgramHandlers.load_prg,
  },
  {
    op: "run_prg",
    module: programRunnersModule,
    legacyName: "run_prg_file",
    schema: extendSchemaWithOp(
      "run_prg",
      ensureDescriptor(programDescriptorIndex, "run_prg_file").inputSchema,
      { description: "Load and execute a PRG located on the Ultimate filesystem." },
    ),
    handler: groupedProgramHandlers.run_prg,
  },
  {
    op: "run_crt",
    module: programRunnersModule,
    legacyName: "run_crt_file",
    schema: extendSchemaWithOp(
      "run_crt",
      ensureDescriptor(programDescriptorIndex, "run_crt_file").inputSchema,
      { description: "Mount and run a CRT cartridge image." },
    ),
    handler: groupedProgramHandlers.run_crt,
  },
  {
    op: "upload_run_basic",
    module: programRunnersModule,
    legacyName: "upload_and_run_basic",
    schema: extendSchemaWithOp(
      "upload_run_basic",
      ensureDescriptor(programDescriptorIndex, "upload_and_run_basic").inputSchema,
      { description: "Upload Commodore BASIC v2 source and execute it immediately." },
    ),
    handler: groupedProgramHandlers.upload_run_basic,
  },
  {
    op: "upload_run_asm",
    module: programRunnersModule,
    legacyName: "upload_and_run_asm",
    schema: extendSchemaWithOp(
      "upload_run_asm",
      ensureDescriptor(programDescriptorIndex, "upload_and_run_asm").inputSchema,
      { description: "Assemble 6502/6510 source, upload the PRG, and execute it." },
    ),
    handler: groupedProgramHandlers.upload_run_asm,
  },
  {
    op: "batch_run",
    module: metaModule,
    legacyName: "batch_run_with_assertions",
    schema: extendSchemaWithOp(
      "batch_run",
      ensureDescriptor(metaDescriptorIndex, "batch_run_with_assertions").inputSchema,
      { description: "Run multiple PRG/CRT programs with post-run assertions." },
    ),
    transform: dropOpTransform,
  },
  {
    op: "bundle_run",
    module: metaModule,
    legacyName: "bundle_run_artifacts",
    schema: extendSchemaWithOp(
      "bundle_run",
      ensureDescriptor(metaDescriptorIndex, "bundle_run_artifacts").inputSchema,
      { description: "Capture screen, memory, and debug registers into an artifact bundle." },
    ),
    transform: dropOpTransform,
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
    module: memoryModule,
    legacyName: "read_memory",
    schema: extendSchemaWithOp(
      "read",
      ensureDescriptor(memoryDescriptorIndex, "read_memory").inputSchema,
      { description: "Read a range of bytes and return a hex dump with address metadata." },
    ),
    handler: groupedMemoryHandlers.read,
  },
  {
    op: "write",
    module: memoryModule,
    legacyName: "write_memory",
    schema: extendSchemaWithOp(
      "write",
      ensureDescriptor(memoryDescriptorIndex, "write_memory").inputSchema,
      { description: "Write a hexadecimal byte sequence into RAM." },
    ),
    handler: groupedMemoryHandlers.write,
  },
  {
    op: "read_screen",
    module: memoryModule,
    legacyName: "read_screen",
    schema: extendSchemaWithOp(
      "read_screen",
      ensureDescriptor(memoryDescriptorIndex, "read_screen").inputSchema,
      { description: "Return the current 40x25 text screen converted to ASCII." },
    ),
    handler: groupedMemoryHandlers.read_screen,
  },
  {
    op: "wait_for_text",
    module: metaModule,
    legacyName: "wait_for_screen_text",
    schema: extendSchemaWithOp(
      "wait_for_text",
      ensureDescriptor(metaDescriptorIndex, "wait_for_screen_text").inputSchema,
      { description: "Poll the screen until a substring or regex appears, or timeout elapses." },
    ),
    transform: dropOpTransform,
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
    module: audioModule,
    legacyName: "sid_volume",
    schema: extendSchemaWithOp(
      "set_volume",
      ensureDescriptor(audioDescriptorIndex, "sid_volume").inputSchema,
      { description: "Set the SID master volume register at $D418 (0-15)." },
    ),
  },
  {
    op: "reset",
    module: audioModule,
    legacyName: "sid_reset",
    schema: extendSchemaWithOp(
      "reset",
      ensureDescriptor(audioDescriptorIndex, "sid_reset").inputSchema,
      { description: "Soft or hard reset of SID registers to clear glitches." },
    ),
  },
  {
    op: "note_on",
    module: audioModule,
    legacyName: "sid_note_on",
    schema: extendSchemaWithOp(
      "note_on",
      ensureDescriptor(audioDescriptorIndex, "sid_note_on").inputSchema,
      { description: "Trigger a SID voice with configurable waveform, ADSR, and pitch." },
    ),
  },
  {
    op: "note_off",
    module: audioModule,
    legacyName: "sid_note_off",
    schema: extendSchemaWithOp(
      "note_off",
      ensureDescriptor(audioDescriptorIndex, "sid_note_off").inputSchema,
      { description: "Release a SID voice by clearing its gate bit." },
    ),
  },
  {
    op: "silence_all",
    module: audioModule,
    legacyName: "sid_silence_all",
    schema: extendSchemaWithOp(
      "silence_all",
      ensureDescriptor(audioDescriptorIndex, "sid_silence_all").inputSchema,
      { description: "Silence all SID voices with optional audio verification." },
    ),
  },
  {
    op: "play_sid_file",
    module: audioModule,
    legacyName: "sidplay_file",
    schema: extendSchemaWithOp(
      "play_sid_file",
      ensureDescriptor(audioDescriptorIndex, "sidplay_file").inputSchema,
      { description: "Play a SID file stored on the Ultimate filesystem." },
    ),
  },
  {
    op: "play_mod_file",
    module: audioModule,
    legacyName: "modplay_file",
    schema: extendSchemaWithOp(
      "play_mod_file",
      ensureDescriptor(audioDescriptorIndex, "modplay_file").inputSchema,
      { description: "Play a MOD tracker module via the Ultimate SID player." },
    ),
  },
  {
    op: "generate",
    module: audioModule,
    legacyName: "music_generate",
    schema: extendSchemaWithOp(
      "generate",
      ensureDescriptor(audioDescriptorIndex, "music_generate").inputSchema,
      { description: "Generate a lightweight SID arpeggio playback sequence." },
    ),
  },
  {
    op: "compile_play",
    module: audioModule,
    legacyName: "music_compile_and_play",
    schema: extendSchemaWithOp(
      "compile_play",
      ensureDescriptor(audioDescriptorIndex, "music_compile_and_play").inputSchema,
      { description: "Compile SIDWAVE or CPG source and optionally play it immediately." },
    ),
  },
  {
    op: "pipeline",
    module: metaModule,
    legacyName: "music_compile_play_analyze",
    schema: extendSchemaWithOp(
      "pipeline",
      ensureDescriptor(metaDescriptorIndex, "music_compile_play_analyze").inputSchema,
      { description: "Compile a SIDWAVE score, play it, and analyze the recording." },
    ),
    transform: dropOpTransform,
  },
  {
    op: "analyze",
    module: audioModule,
    legacyName: "analyze_audio",
    schema: extendSchemaWithOp(
      "analyze",
      ensureDescriptor(audioDescriptorIndex, "analyze_audio").inputSchema,
      { description: "Automatically analyze SID playback when verification is requested." },
    ),
  },
  {
    op: "record_analyze",
    module: audioModule,
    legacyName: "record_and_analyze_audio",
    schema: extendSchemaWithOp(
      "record_analyze",
      ensureDescriptor(audioDescriptorIndex, "record_and_analyze_audio").inputSchema,
      { description: "Record audio for a fixed duration and return SID analysis metrics." },
    ),
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

const toolModules: ToolModule[] = [
  audioModule,
  machineControlModule,
  storageModule,
  graphicsModule,
  printerModule,
  ragModule,
  developerModule,
  streamingModule,
  metaModule,
];

if (groupedSoundModule) {
  toolModules.splice(1, 0, groupedSoundModule);
}

if (groupedProgramModule) {
  toolModules.push(groupedProgramModule);
} else {
  toolModules.push(programRunnersModule);
}

if (groupedMemoryModule) {
  toolModules.push(groupedMemoryModule);
} else {
  toolModules.push(memoryModule);
}

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
