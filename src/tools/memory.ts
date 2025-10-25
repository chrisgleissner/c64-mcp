import { defineToolModule } from "./types.js";
import { objectSchema } from "./schema.js";
import { textResult } from "./responses.js";
import { ToolError, toolErrorResult, unknownErrorResult } from "./errors.js";

const readScreenArgsSchema = objectSchema<Record<string, never>>({
  description: "No arguments are required for reading the current screen contents.",
  properties: {},
  additionalProperties: false,
});

export const memoryModule = defineToolModule({
  domain: "memory",
  summary: "Screen, main memory, and low-level inspection utilities.",
  resources: [
    "c64://context/bootstrap",
    "c64://specs/basic",
    "c64://specs/assembly",
  ],
  prompts: ["memory-debug", "basic-program", "assembly-program"],
  defaultTags: ["memory", "debug"],
  tools: [
    {
      name: "read_screen",
      description: "Read the current text screen (40x25) and return its ASCII representation.",
      summary: "Fetches screen RAM, converts from PETSCII, and returns the printable output.",
      inputSchema: readScreenArgsSchema.jsonSchema,
      relatedResources: ["c64://context/bootstrap", "c64://specs/basic"],
      relatedPrompts: ["memory-debug", "basic-program", "assembly-program"],
      tags: ["screen", "memory"],
      async execute(args, ctx) {
        try {
          readScreenArgsSchema.parse(args ?? {});
          ctx.logger.info("Reading C64 screen contents");

          const screen = await ctx.client.readScreen();

          return textResult(`Current screen contents:\n${screen}`, {
            success: true,
            screen,
            length: screen.length,
          });
        } catch (error) {
          if (error instanceof ToolError) {
            return toolErrorResult(error);
          }
          return unknownErrorResult(error);
        }
      },
    },
  ],
});
