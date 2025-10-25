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

function toRecord(details: unknown): Record<string, unknown> | undefined {
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

const prgFileArgsSchema = objectSchema({
  description: "Arguments for loading or running a PRG that already exists on the Ultimate filesystem.",
  properties: {
    path: stringSchema({
      description: "Absolute or Ultimate filesystem path to the PRG file (e.g. //USB0/demo.prg).",
      minLength: 1,
    }),
  },
  required: ["path"],
  additionalProperties: false,
});

const crtFileArgsSchema = objectSchema({
  description: "Arguments for running a CRT image stored on the Ultimate filesystem.",
  properties: {
    path: stringSchema({
      description: "Absolute or Ultimate filesystem path to the CRT file (e.g. //USB0/game.crt).",
      minLength: 1,
    }),
  },
  required: ["path"],
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
  workflowHints: [
    "Choose BASIC or assembly uploaders based on the language you just generated for the user.",
    "Prefer PRG or CRT runners when the user supplies an Ultimate filesystem path instead of source text.",
  ],
  tools: [
    {
      name: "upload_and_run_basic",
      description: "Upload a BASIC program to the C64 and execute it immediately.",
      summary: "Uploads Commodore BASIC v2 source and runs it via Ultimate 64 firmware.",
      inputSchema: uploadBasicArgsSchema.jsonSchema,
      relatedResources: ["c64://specs/basic", "c64://context/bootstrap"],
      relatedPrompts: ["basic-program"],
      tags: ["basic", "execution"],
      workflowHints: [
        "Invoke right after you generate BASIC source so it runs on the C64 without extra user steps.",
        "Ensure the program includes line numbers and uppercase keywords before calling the tool.",
      ],
      supportedPlatforms: ["c64u", "vice"] as const,
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
      workflowHints: [
        "Use when the user requests to run new 6502 code; surface any assembler diagnostics in your reply.",
        "Mention the entry routine or important addresses after execution so the user can continue debugging.",
      ],
      supportedPlatforms: ["c64u", "vice"] as const,
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
    {
      name: "load_prg_file",
      description: "Load a PRG into C64 memory without executing it.",
      summary: "Instructs the Ultimate firmware to transfer a PRG into memory without RUN.",
      inputSchema: prgFileArgsSchema.jsonSchema,
      relatedResources: ["c64://context/bootstrap"],
      tags: ["programs", "file"],
      workflowHints: [
        "Stage PRG files without running when the user wants to inspect memory first.",
        "Confirm the Ultimate filesystem path (e.g. //USB0/demo.prg) is accessible before invoking.",
      ],
      async execute(args, ctx) {
        try {
          const parsed = prgFileArgsSchema.parse(args ?? {});
          ctx.logger.info("Loading PRG file", { path: parsed.path });

          const result = await ctx.client.loadPrgFile(parsed.path);
          if (!result.success) {
            throw new ToolExecutionError("C64 firmware reported failure while loading PRG", {
              details: extractFailureDetails(result.details),
            });
          }

          return textResult(`PRG ${parsed.path} loaded into memory.`, {
            success: true,
            path: parsed.path,
            details: toRecord(result.details) ?? null,
          });
        } catch (error) {
          if (error instanceof ToolError) {
            return toolErrorResult(error);
          }
          return unknownErrorResult(error);
        }
      },
    },
    {
      name: "run_prg_file",
      description: "Run a PRG located on the Ultimate filesystem without uploading source.",
      summary: "Loads and executes a PRG file residing on attached storage.",
      inputSchema: prgFileArgsSchema.jsonSchema,
      relatedResources: ["c64://context/bootstrap"],
      tags: ["programs", "execution", "file"],
      workflowHints: [
        "Call when the user provides a PRG path and expects immediate execution without compiling.",
        "Mention that firmware issues a RUN so the user knows the machine state changed.",
      ],
    supportedPlatforms: ["c64u", "vice"] as const,
      async execute(args, ctx) {
        try {
          const parsed = prgFileArgsSchema.parse(args ?? {});
          ctx.logger.info("Running PRG file", { path: parsed.path });

          const result = await ctx.client.runPrgFile(parsed.path);
          if (!result.success) {
            throw new ToolExecutionError("C64 firmware reported failure while running PRG", {
              details: extractFailureDetails(result.details),
            });
          }

          return textResult(`PRG ${parsed.path} loaded and executed.`, {
            success: true,
            path: parsed.path,
            details: toRecord(result.details) ?? null,
          });
        } catch (error) {
          if (error instanceof ToolError) {
            return toolErrorResult(error);
          }
          return unknownErrorResult(error);
        }
      },
    },
    {
      name: "run_crt_file",
      description: "Run a cartridge image stored on the Ultimate filesystem.",
      summary: "Mounts and autostarts the specified CRT file through the firmware.",
      inputSchema: crtFileArgsSchema.jsonSchema,
      relatedResources: ["c64://context/bootstrap"],
      tags: ["programs", "cartridge"],
      workflowHints: [
        "Use for cartridge images and remind the user that the machine will reset into the CRT.",
        "Suggest capturing the screen afterwards if they need to verify the cartridge booted.",
      ],
      async execute(args, ctx) {
        try {
          const parsed = crtFileArgsSchema.parse(args ?? {});
          ctx.logger.info("Running CRT file", { path: parsed.path });

          const result = await ctx.client.runCrtFile(parsed.path);
          if (!result.success) {
            throw new ToolExecutionError("C64 firmware reported failure while running CRT", {
              details: extractFailureDetails(result.details),
            });
          }

          return textResult(`CRT ${parsed.path} mounted and started.`, {
            success: true,
            path: parsed.path,
            details: toRecord(result.details) ?? null,
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
