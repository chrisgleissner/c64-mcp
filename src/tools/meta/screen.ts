// Screen-related meta tools
import type { ToolDefinition } from "../types.js";
import { objectSchema, stringSchema, numberSchema, optionalSchema, booleanSchema } from "../schema.js";
import { jsonResult } from "../responses.js";
import { ToolError, ToolExecutionError, toolErrorResult, unknownErrorResult } from "../errors.js";
import { sleep } from "./util.js";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const waitForScreenTextArgsSchema = objectSchema({
  description: "Poll screen until text or regex matches, or timeout elapses.",
  properties: {
    pattern: stringSchema({ description: "Substring or regex to find", minLength: 1 }),
    isRegex: optionalSchema(booleanSchema({ description: "Interpret pattern as regular expression", default: false }), false),
    caseInsensitive: optionalSchema(booleanSchema({ description: "Case-insensitive search", default: true }), true),
    timeoutMs: optionalSchema(numberSchema({ description: "Overall timeout in milliseconds", integer: true, minimum: 1, default: 3000 }), 3000),
    intervalMs: optionalSchema(numberSchema({ description: "Poll interval in milliseconds", integer: true, minimum: 1, default: 100 }), 100),
  },
  required: ["pattern"],
  additionalProperties: false,
});

export const tools: ToolDefinition[] = [
  {
    name: "wait_for_screen_text",
    description: "Poll screen until a regex or substring matches, within a timeout.",
    summary: "Screen poll with regex/text match and timing.",
    inputSchema: waitForScreenTextArgsSchema.jsonSchema,
    tags: ["screen", "assert"],
    examples: [{ name: "Wait for READY.", description: "Find boot prompt", arguments: { pattern: "READY.", isRegex: false, timeoutMs: 1000, intervalMs: 50 } }],
    async execute(args, ctx) {
      try {
        const parsed = waitForScreenTextArgsSchema.parse(args ?? {});
        const start = Date.now();
        const flags = parsed.caseInsensitive ? "i" : undefined;
        const regex = parsed.isRegex
          ? new RegExp(parsed.pattern, flags)
          : new RegExp(escapeRegex(parsed.pattern), flags);

        while (Date.now() - start < (parsed.timeoutMs ?? 3000)) {
          const screen = await (ctx.client as any).readScreen();
          const match = screen.match(regex);
          if (match && match.index !== undefined) {
            return jsonResult({
              matched: true,
              match: {
                index: match.index,
                length: match[0]?.length ?? 0,
                text: match[0] ?? "",
              },
              elapsedMs: Date.now() - start,
            }, { success: true });
          }
          await sleep(Math.max(1, parsed.intervalMs ?? 100));
        }
        throw new ToolExecutionError("Timeout waiting for screen text", { details: { pattern: parsed.pattern, timeoutMs: parsed.timeoutMs } });
      } catch (error) {
        if (error instanceof ToolError) return toolErrorResult(error);
        return unknownErrorResult(error);
      }
    },
  },
];
