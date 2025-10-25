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

interface RegisteredTool {
  readonly module: ToolModule;
  readonly descriptor: ToolDescriptor;
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
    const entry = toolMap.get(name);
    if (!entry) {
      throw new Error(`Unknown tool: ${name}`);
    }

    return entry.module.invoke(name, args, ctx);
  },
};
