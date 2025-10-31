import {
  createOperationDispatcher,
  defineToolModule,
  discriminatedUnionSchema,
} from "../types.js";
import { machineControlModule } from "../machineControl.js";
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

const machineDescriptorIndex = buildDescriptorIndex(machineControlModule);
const metaDescriptorIndex = buildDescriptorIndex(metaModule);

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

export const systemModuleGroup = defineToolModule({
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
