import {
  createOperationDispatcher,
  defineToolModule,
  discriminatedUnionSchema,
} from "../types.js";
import { programRunnersModule, programOperationHandlers as groupedProgramHandlers } from "../programRunners.js";
import { metaModule } from "../meta/index.js";
import {
  buildDescriptorIndex,
  ensureDescriptor,
  extendSchemaWithOp,
  createOperationHandlers,
  invokeModuleTool,
  type GroupedOperationConfig,
  type GenericOperationMap,
} from "./utils.js";

const programDescriptorIndex = buildDescriptorIndex(programRunnersModule);
const metaDescriptorIndex = buildDescriptorIndex(metaModule);

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
    handler: async (rawArgs, ctx) => invokeModuleTool(metaModule, "batch_run_with_assertions", rawArgs, ctx),
  },
  {
    op: "bundle_run",
    schema: extendSchemaWithOp(
      "bundle_run",
      ensureDescriptor(metaDescriptorIndex, "bundle_run_artifacts").inputSchema,
      { description: "Capture screen, memory, and debug registers into an artifact bundle." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(metaModule, "bundle_run_artifacts", rawArgs, ctx),
  },
];

const programOperationHandlers = createOperationHandlers(programOperations);

export const programModule = defineToolModule({
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
      name: "c64_program",
      description: "Grouped entry point for program upload, execution, and batch workflows.",
      summary: "Runs PRG/CRT files, uploads BASIC or ASM, and coordinates batch test flows.",
      inputSchema: discriminatedUnionSchema({
        description: "Program operations available via the c64_program tool.",
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
        "c64_program",
        programOperationHandlers,
      ),
    },
  ],
});
