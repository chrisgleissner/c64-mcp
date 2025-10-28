// Artifact bundling meta tool
import type { ToolDefinition } from "../types.js";
import { objectSchema, stringSchema, arraySchema, numberSchema, optionalSchema, booleanSchema } from "../schema.js";
import { jsonResult } from "../responses.js";
import { ToolError, toolErrorResult, unknownErrorResult } from "../errors.js";
import { promises as fs } from "node:fs";
import { resolve as resolvePath, join as joinPath } from "node:path";

const bundleRunArtifactsArgsSchema = objectSchema({
  description: "Gather screen capture, memory snapshot, and debugreg into a structured bundle.",
  properties: {
    runId: stringSchema({ description: "Unique identifier for this run", minLength: 1 }),
    outputPath: stringSchema({ description: "Output directory for artifacts bundle", minLength: 1 }),
    captureScreen: optionalSchema(booleanSchema({ description: "Capture screen content", default: true }), true),
    memoryRanges: optionalSchema(arraySchema(objectSchema({
      description: "Memory range to snapshot",
      properties: {
        address: stringSchema({ description: "Start address", minLength: 1 }),
        length: numberSchema({ description: "Length in bytes", integer: true, minimum: 1 }),
      },
      required: ["address", "length"],
      additionalProperties: false,
    }))),
    captureDebugReg: optionalSchema(booleanSchema({ description: "Capture debugreg state", default: true }), true),
  },
  required: ["runId", "outputPath"],
  additionalProperties: false,
});

export const tools: ToolDefinition[] = [
  {
    name: "bundle_run_artifacts",
    description: "Gather screen capture, memory snapshots, and debugreg into a structured bundle for a run.",
    summary: "Artifact bundling for run analysis and debugging.",
    inputSchema: bundleRunArtifactsArgsSchema.jsonSchema,
    tags: ["orchestration", "artifacts", "debugging"],
    examples: [
      {
        name: "Bundle artifacts",
        description: "Capture screen and memory for run analysis",
        arguments: { runId: "demo_001", outputPath: "/tmp/artifacts", memoryRanges: [{ address: "$0400", length: 1000 }] },
      },
    ],
    async execute(args, ctx) {
      try {
        const parsed = bundleRunArtifactsArgsSchema.parse(args ?? {});
        const runId = parsed.runId as string;
        const outputPath = resolvePath(String(parsed.outputPath));
        const captureScreen = parsed.captureScreen !== false;
        const captureDebugReg = parsed.captureDebugReg !== false;
        const memoryRanges = (parsed.memoryRanges ?? []) as Array<{ address: string; length: number }>;

        await fs.mkdir(outputPath, { recursive: true });
        const runPath = resolvePath(joinPath(outputPath, runId));
        await fs.mkdir(runPath, { recursive: true });

        const artifacts: Record<string, string> = {};

        // Capture screen
        if (captureScreen) {
          const screen = await (ctx.client as any).readScreen();
          const screenPath = resolvePath(joinPath(runPath, "screen.txt"));
          await fs.writeFile(screenPath, screen, "utf8");
          artifacts.screen = screenPath;
        }

        // Capture memory ranges
        if (memoryRanges.length > 0) {
          const memoryPath = resolvePath(joinPath(runPath, "memory"));
          await fs.mkdir(memoryPath, { recursive: true });
          for (let i = 0; i < memoryRanges.length; i++) {
            const range = memoryRanges[i]!;
            const result = await (ctx.client as any).readMemory(range.address, String(range.length));
            const rangePath = resolvePath(joinPath(memoryPath, `range_${i}_${range.address}.hex`));
            await fs.writeFile(rangePath, result.data ?? "", "utf8");
            artifacts[`memory_range_${i}`] = rangePath;
          }
        }

        // Capture debugreg
        if (captureDebugReg) {
          const debugreg = await (ctx.client as any).debugregRead();
          const debugPath = resolvePath(joinPath(runPath, "debugreg.json"));
          await fs.writeFile(debugPath, JSON.stringify(debugreg, null, 2), "utf8");
          artifacts.debugreg = debugPath;
        }

        // Write manifest
        const manifestPath = resolvePath(joinPath(runPath, "manifest.json"));
        const manifest = {
          runId,
          createdAt: new Date().toISOString(),
          artifacts,
        };
        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

        return jsonResult({ runId, runPath, artifacts }, { success: true });
      } catch (error) {
        if (error instanceof ToolError) return toolErrorResult(error);
        return unknownErrorResult(error);
      }
    },
  },
];
