import { AssemblyError } from "../assemblyConverter.js";
import { defineToolModule } from "./types.js";
import { objectSchema, stringSchema } from "./schema.js";
import { textResult } from "./responses.js";
import {
  ToolExecutionError,
  ToolError,
  ToolValidationError,
  toolErrorResult,
  unknownErrorResult,
} from "./errors.js";

function extractFailureDetails(details: unknown): Record<string, unknown> | undefined {
  if (details === undefined || details === null) {
    return undefined;
  }
  if (typeof details === "object") {
    return details as Record<string, unknown>;
  }
  return { value: details };
}

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

const uploadAsmArgsSchema = objectSchema({
  description: "Arguments for uploading and running a 6502/6510 assembly program.",
  properties: {
    program: stringSchema({
      description: "Assembly source that will be assembled to a PRG and executed.",
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
            throw new ToolExecutionError("C64 firmware reported failure while running BASIC program", {
              details: extractFailureDetails(result.details),
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
    {
      name: "upload_and_run_asm",
      description: "Assemble 6502/6510 source code, upload the PRG, and run it immediately.",
      summary: "Compiles assembly to a PRG and executes it on the C64 via Ultimate 64 firmware.",
      inputSchema: uploadAsmArgsSchema.jsonSchema,
      relatedResources: ["c64://specs/assembly", "c64://context/bootstrap"],
      relatedPrompts: ["assembly-program"],
      tags: ["assembly", "execution"],
      async execute(args, ctx) {
        try {
          const parsed = uploadAsmArgsSchema.parse(args);
          ctx.logger.info("Uploading assembly program", { sourceLength: parsed.program.length });

          const result = await ctx.client.uploadAndRunAsm(parsed.program);
          if (!result.success) {
            throw new ToolExecutionError("C64 firmware reported failure while running assembly program", {
              details: extractFailureDetails(result.details),
            });
          }

          return textResult("Assembly program assembled, uploaded, and executed successfully.", {
            success: true,
            details: result.details ?? null,
          });
        } catch (error) {
          if (error instanceof ToolError) {
            return toolErrorResult(error);
          }
          if (error instanceof AssemblyError) {
            const { file, line } = error.location;
            const validationError = new ToolValidationError("Assembly failed", {
              details: {
                file,
                line,
                message: error.message,
              },
              cause: error,
            });
            return toolErrorResult(validationError);
          }
          return unknownErrorResult(error);
        }
      },
    },
  ],
});
