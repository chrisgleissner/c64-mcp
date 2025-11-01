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
export const tools = [
    {
        name: "config_snapshot_and_restore",
        description: "Read all configuration categories and write a versioned snapshot, or restore from a snapshot; supports diff mode.",
        summary: "Snapshot/restore configuration with simple diff reporting.",
        inputSchema: configSnapshotAndRestoreArgsSchema.jsonSchema,
        tags: ["config", "snapshot"],
        async execute(args, ctx) {
            try {
                const parsed = configSnapshotAndRestoreArgsSchema.parse(args ?? {});
                const action = parsed.action;
                const path = resolvePath(String(parsed.path));
                await fs.mkdir(dirname(path), { recursive: true });
                if (action === "snapshot") {
                    const [version, info, cats] = await Promise.all([
                        ctx.client.version(),
                        ctx.client.info(),
                        ctx.client.configsList(),
                    ]);
                    const categories = Array.isArray(cats?.categories)
                        ? cats.categories
                        : [];
                    const data = {};
                    for (const category of categories) {
                        try {
                            const v = await ctx.client.configGet(category);
                            data[category] = v;
                        }
                        catch (e) {
                            data[category] = { _error: e instanceof Error ? e.message : String(e) };
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
                    const payload = snapshot.categories;
                    const result = await ctx.client.configBatchUpdate(payload);
                    if (!result.success) {
                        throw new ToolExecutionError("Batch update failed", { details: normalizeErrorDetails(result.details) });
                    }
                    if (parsed.applyToFlash) {
                        await ctx.client.configSaveToFlash();
                    }
                    return jsonResult({ restored: true, categories: Object.keys(payload).length }, { success: true });
                }
                const text = await fs.readFile(path, "utf8");
                const snapshot = JSON.parse(text);
                const cats = await ctx.client.configsList();
                const categories = Array.isArray(cats?.categories)
                    ? cats.categories
                    : [];
                const current = {};
                for (const c of categories) {
                    current[c] = await ctx.client.configGet(c);
                }
                const diff = {};
                const snapCats = snapshot.categories ?? {};
                for (const [cat, snapVal] of Object.entries(snapCats)) {
                    const curVal = current[cat];
                    if (JSON.stringify(snapVal) !== JSON.stringify(curVal)) {
                        diff[cat] = { _changed: { expected: snapVal, actual: curVal } };
                    }
                }
                return jsonResult({ diff }, { success: true, changed: Object.keys(diff).length });
            }
            catch (error) {
                if (error instanceof ToolError)
                    return toolErrorResult(error);
                return unknownErrorResult(error);
            }
        },
    },
];
