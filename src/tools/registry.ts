import type { JsonSchema, ToolDescriptor, ToolExecutionContext, ToolModule, ToolRunResult } from "./types.js";
import { createOperationDispatcher, defineToolModule, discriminatedUnionSchema, OPERATION_DISCRIMINATOR } from "./types.js";
import { programRunnersModule } from "./programRunners.js";
import { memoryModule } from "./memory.js";
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
  readonly module: ToolModule;
  readonly legacyName: string;
  readonly schema: JsonSchema;
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
  const handlers: Record<string, (args: Record<string, unknown>, ctx: ToolExecutionContext) => Promise<ToolRunResult>> = {};

  for (const operation of operations) {
    handlers[operation.op] = async (rawArgs, ctx) => {
      const { [OPERATION_DISCRIMINATOR]: _ignored, ...rest } = rawArgs;
      const payload = operation.transform ? operation.transform(rest) : rest;
      return operation.module.invoke(operation.legacyName, payload, ctx);
    };
  }

  return handlers as import("./types.js").OperationHandlerMap<GenericOperationMap>;
}

function dropOpTransform(args: Record<string, unknown>): Record<string, unknown> {
  return args;
}

const programDescriptorIndex = new Map(programRunnersModule.describeTools().map((descriptor) => [descriptor.name, descriptor]));
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
    transform: dropOpTransform,
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
    transform: dropOpTransform,
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
    transform: dropOpTransform,
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
    transform: dropOpTransform,
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
    transform: dropOpTransform,
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
    transform: dropOpTransform,
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
    transform: dropOpTransform,
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
    transform: dropOpTransform,
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

const toolModules: ToolModule[] = [
  programRunnersModule,
  memoryModule,
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

if (groupedProgramModule) {
  toolModules.push(groupedProgramModule);
}

if (groupedMemoryModule) {
  toolModules.push(groupedMemoryModule);
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
