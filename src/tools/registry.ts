import type { ToolDescriptor, ToolExecutionContext, ToolModule, ToolRunResult } from "./types.js";
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

const toolModules: readonly ToolModule[] = [
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
