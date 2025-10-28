// Configuration snapshot and restore meta tool
import type { ToolDefinition } from "../types.js";
import { objectSchema, stringSchema, optionalSchema, booleanSchema } from "../schema.js";
import { jsonResult } from "../responses.js";
import { ToolError, ToolExecutionError, ToolValidationError, toolErrorResult, unknownErrorResult } from "../errors.js";
import { promises as fs } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { normalizeErrorDetails } from "./util.js";

const configSnapshotAndRestoreArgsSchema = objectSchema({
  description: "Snapshot or restore full device configuration. Snapshot writes versioned JSON.",
  properties: {
    action: stringSchema({ description: "One of: snapshot|restore|diff", enum: ["snapshot", "restore", "diff"] }),
    path: stringSchema({ description: "Snapshot file path", minLength: 1 }),
    applyToFlash: optionalSchema(booleanSchema({ description: "Save configuration to flash after restore", default: false }), false),
  },
  required: ["action", "path"],
  additionalProperties: false,
});

export const tools: ToolDefinition[] = [
  {
    name: "config_snapshot_and_restore",
    description: "Read all configuration categories and write a versioned snapshot, or restore from a snapshot; supports diff mode.",
    summary: "Snapshot/restore configuration with simple diff reporting.",
    inputSchema: configSnapshotAndRestoreArgsSchema.jsonSchema,
    tags: ["config", "snapshot"],
    async execute(args, ctx) {
      try {
        const parsed = configSnapshotAndRestoreArgsSchema.parse(args ?? {});
        const action = parsed.action as string;
        const path = resolvePath(String(parsed.path));
        await fs.mkdir(dirname(path), { recursive: true });

        if (action === "snapshot") {
          const [version, info, cats] = await Promise.all([
            (ctx.client as any).version(),
            (ctx.client as any).info(),
            (ctx.client as any).configsList(),
          ]);
          const categories: string[] = Array.isArray((cats as any)?.categories)
            ? (cats as any).categories
            : [];
          const data: Record<string, unknown> = {};
          for (const category of categories) {
            try {
              const v = await (ctx.client as any).configGet(category as any);
              data[category as any] = v;
            } catch (e) {
              data[category as any] = { _error: e instanceof Error ? e.message : String(e) };
            }
          }
          const snapshot = {
            createdAt: new Date().toISOString(),
            version,
            info,
            categories: data,
          };
          await fs.writeFile(path, JSON.stringify(snapshot, null, 2), "utf8");
          return jsonResult({ path, categoryCount: Object.keys(data).length }, { success: true });
        }

        if (action === "restore") {
          const text = await fs.readFile(path, "utf8");
          const snapshot = JSON.parse(text);
          if (!snapshot || typeof snapshot !== "object" || typeof snapshot.categories !== "object") {
            throw new ToolValidationError("Invalid snapshot file", { path: "$.path" });
          }
          const payload = snapshot.categories as Record<string, object>;
          const result = await (ctx.client as any).configBatchUpdate(payload);
          if (!result.success) {
            throw new ToolExecutionError("Batch update failed", { details: normalizeErrorDetails(result.details) });
          }
          if (parsed.applyToFlash) {
            await (ctx.client as any).configSaveToFlash();
          }
          return jsonResult({ restored: true, categories: Object.keys(payload).length }, { success: true });
        }

        const text = await fs.readFile(path, "utf8");
        const snapshot = JSON.parse(text);
        const cats = await (ctx.client as any).configsList();
        const categories: string[] = Array.isArray((cats as any)?.categories)
          ? (cats as any).categories
          : [];
        const current: Record<string, unknown> = {};
        for (const c of categories) {
          current[c] = await (ctx.client as any).configGet(c as any);
        }
        const diff: Record<string, Record<string, { expected: unknown; actual: unknown }>> = {};
        const snapCats: Record<string, unknown> = snapshot.categories ?? {};
        for (const [cat, snapVal] of Object.entries(snapCats)) {
          const curVal = current[cat];
          if (JSON.stringify(snapVal) !== JSON.stringify(curVal)) {
            diff[cat] = { _changed: { expected: snapVal, actual: curVal } } as any;
          }
        }
        return jsonResult({ diff }, { success: true, changed: Object.keys(diff).length });
      } catch (error) {
        if (error instanceof ToolError) return toolErrorResult(error);
        return unknownErrorResult(error);
      }
    },
  },
];
