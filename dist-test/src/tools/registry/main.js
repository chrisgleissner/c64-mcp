import { getPlatformStatus, setPlatform } from "../../platform.js";
import { programModule } from "./program.js";
import { memoryModuleGroup as memoryModule } from "./memory.js";
import { soundModuleGroup as soundModule } from "./sound.js";
import { systemModuleGroup as systemModule } from "./system.js";
import { graphicsModuleGroup as graphicsModule } from "./graphics.js";
import { ragModuleGroup as ragModule } from "./rag.js";
import { diskModuleGroup as diskModule } from "./disk.js";
import { driveModuleGroup as driveModule } from "./drive.js";
import { printerModuleGroup as printerModule } from "./printer.js";
import { configModuleGroup as configModule } from "./config.js";
import { extractModule } from "./extract.js";
import { streamModule } from "./stream.js";
const modules = [
    programModule,
    memoryModule,
    soundModule,
    systemModule,
    graphicsModule,
    ragModule,
    diskModule,
    driveModule,
    printerModule,
    configModule,
    extractModule,
    streamModule,
];
const toolMap = new Map();
for (const module of modules) {
    for (const descriptor of module.describeTools()) {
        if (toolMap.has(descriptor.name)) {
            throw new Error(`Duplicate tool name detected while registering modules: ${descriptor.name}`);
        }
        toolMap.set(descriptor.name, { module, descriptor });
    }
}
export const toolRegistry = {
    list() {
        return Array.from(toolMap.values(), (entry) => entry.descriptor);
    },
    async invoke(name, args, ctx) {
        const enrichedCtx = {
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
export function describeToolModules() {
    return modules.map((module) => ({
        domain: module.domain,
        summary: module.summary,
        defaultTags: module.defaultTags,
        workflowHints: module.workflowHints ?? [],
        tools: module.describeTools(),
    }));
}
