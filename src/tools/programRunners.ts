import { defineToolModule } from "./types.js";
import { objectSchema, stringSchema } from "./schema.js";
import { textResult } from "./responses.js";
import { ToolExecutionError, ToolError, toolErrorResult, unknownErrorResult } from "./errors.js";

const uploadBasicArgsSchema = objectSchema({
  description: "Arguments for uploading and running a BASIC program.",
  properties: {
    program: stringSchema({
      description: "Commodore BASIC v2 program source to upload and run.",
      minLength: 1,
    }),
  },
  required: ["program"],
  additionalProperties: false,
});

export const programRunnersModule = defineToolModule({
  domain: "programs",
  summary: "Program uploaders, runners, and compilation workflows for BASIC, assembly, and PRG files.",
  resources: [
    "c64://context/bootstrap",
    "c64://specs/basic",
    "c64://specs/assembly",
  ],
  prompts: ["basic-program", "assembly-program"],
  defaultTags: ["programs", "execution"],
  tools: [
    {
      name: "upload_and_run_basic",
      description: "Upload a BASIC program to the C64 and execute it immediately.",
      summary: "Uploads Commodore BASIC v2 source and runs it via Ultimate 64 firmware.",
      inputSchema: uploadBasicArgsSchema.jsonSchema,
      relatedResources: ["c64://specs/basic", "c64://context/bootstrap"],
      relatedPrompts: ["basic-program"],
      tags: ["basic", "execution"],
      async execute(args, ctx) {
        try {
          const parsed = uploadBasicArgsSchema.parse(args);
          ctx.logger.info("Uploading BASIC program", { sourceLength: parsed.program.length });

          const result = await ctx.client.uploadAndRunBasic(parsed.program);
          if (!result.success) {
            const details =
              result.details && typeof result.details === "object"
                ? (result.details as Record<string, unknown>)
                : result.details === undefined
                  ? undefined
                  : { details: result.details };
            throw new ToolExecutionError("C64 firmware reported failure while running BASIC program", {
              details,
            });
          }

          const base = textResult("BASIC program uploaded and executed successfully.", {
            success: true,
            details: result.details ?? null,
          });

          return base;
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
