// Filesystem discovery meta tool
import type { ToolDefinition } from "../types.js";
import { objectSchema, stringSchema, arraySchema, numberSchema, optionalSchema, booleanSchema } from "../schema.js";
import { jsonResult } from "../responses.js";
import { ToolError, toolErrorResult, unknownErrorResult } from "../errors.js";

const findPathsByNameArgsSchema = objectSchema({
  description: "Find device paths with names containing a substring. Uses firmware wildcard file info.",
  properties: {
    root: optionalSchema(stringSchema({ description: "Root path to search (host)" }), "/"),
    nameContains: stringSchema({ description: "Substring to match", minLength: 1 }),
    extensions: optionalSchema(arraySchema(stringSchema({ description: "Extension filter without dot", minLength: 1 }))),
    maxResults: optionalSchema(numberSchema({ description: "Maximum results", integer: true, minimum: 1, default: 50 }), 50),
    caseInsensitive: optionalSchema(booleanSchema({ description: "Case-insensitive name match", default: true }), true),
  },
  required: ["nameContains"],
  additionalProperties: false,
});

export const tools: ToolDefinition[] = [
  {
    name: "find_paths_by_name",
    description: "Return device paths whose names contain a substring; supports simple extension filters and wildcard-aware firmware search.",
    summary: "Container-aware discovery wrapper using firmware file wildcard search.",
    inputSchema: findPathsByNameArgsSchema.jsonSchema,
    tags: ["files", "discover"],
    async execute(args, ctx) {
      try {
        const parsed = findPathsByNameArgsSchema.parse(args ?? {});
        const root = parsed.root ?? "/";
        const needle = parsed.caseInsensitive ? (parsed.nameContains as string).toLowerCase() : (parsed.nameContains as string);

        const exts = (parsed.extensions ?? []) as string[];
        const patterns: string[] = exts.length > 0
          ? exts.map((e) => `${root}/**/*${parsed.nameContains}*.${e}`)
          : [`${root}/**/*${parsed.nameContains}*`];

        const seen = new Set<string>();
        const results: string[] = [];
        for (const pattern of patterns) {
          const info = await (ctx.client as any).filesInfo(pattern);
          if (Array.isArray(info)) {
            for (const p of info) {
              if (typeof p !== "string") continue;
              const name = parsed.caseInsensitive ? p.toLowerCase() : p;
              if (name.includes(needle) && !seen.has(p)) {
                seen.add(p);
                results.push(p);
                if (results.length >= (parsed.maxResults ?? 50)) break;
              }
            }
          } else if (info && typeof info === "object" && Array.isArray((info as any).paths)) {
            for (const p of (info as any).paths) {
              if (typeof p !== "string") continue;
              const name = parsed.caseInsensitive ? p.toLowerCase() : p;
              if (name.includes(needle) && !seen.has(p)) {
                seen.add(p);
                results.push(p);
                if (results.length >= (parsed.maxResults ?? 50)) break;
              }
            }
          }
          if (results.length >= (parsed.maxResults ?? 50)) break;
        }
        return jsonResult({ root, pattern: parsed.nameContains, results }, { success: true, count: results.length });
      } catch (error) {
        if (error instanceof ToolError) return toolErrorResult(error);
        return unknownErrorResult(error);
      }
    },
  },
];
