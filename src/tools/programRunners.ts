import { assemblyToPrg, AssemblyError } from "../assemblyConverter.js";
import { basicToPrg } from "../basicConverter.js";
import { defineToolModule, type ToolRunResult } from "./types.js";
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

const BASIC_MAX_LINE = 63999;

type BasicRuntimeError = {
  readonly line: number;
  readonly type?: string;
  readonly raw: string;
};

type BasicAutoFixChange = {
  readonly line: number;
  readonly notes: readonly string[];
};

type BasicAutoFixResult = {
  readonly program: string;
  readonly changes: readonly BasicAutoFixChange[];
};

type StructuredRuntimeError = {
  readonly line: number;
  readonly type?: string;
  readonly text: string;
};

function parseBasicRuntimeErrors(screen: string): readonly BasicRuntimeError[] {
  const errors: BasicRuntimeError[] = [];
  const seen = new Set<number>();
  const rows = screen.replace(/\r\n?/g, "\n").split("\n");

  for (const row of rows) {
    if (!row || !row.toUpperCase().includes("ERROR IN")) {
      continue;
    }

    const match = /ERROR\s+IN\s+(\d{1,5})/i.exec(row);
    if (!match) {
      continue;
    }

    const lineNumber = Number.parseInt(match[1] ?? "", 10);
    if (!Number.isInteger(lineNumber) || lineNumber < 1 || lineNumber > BASIC_MAX_LINE) {
      continue;
    }
    if (seen.has(lineNumber)) {
      continue;
    }
    seen.add(lineNumber);

    const typeMatch = /\?([A-Z ?]+?)\s+ERROR\s+IN/i.exec(row.toUpperCase());
    const type = typeMatch?.[1]?.trim().replace(/\s+/g, " ") || undefined;

    errors.push({
      line: lineNumber,
      type,
      raw: row.trim(),
    });
  }

  return errors;
}

function attemptAutoFixBasicProgram(
  program: string,
  errors: readonly BasicRuntimeError[],
): BasicAutoFixResult | undefined {
  if (errors.length === 0) {
    return undefined;
  }

  const normalized = program.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const indexByLine = new Map<number, number>();

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    if (!rawLine) {
      continue;
    }
    const match = /^\s*(\d+)\s*(.*)$/u.exec(rawLine);
    if (!match) {
      continue;
    }
    const lineNumber = Number.parseInt(match[1] ?? "", 10);
    if (!Number.isInteger(lineNumber)) {
      continue;
    }
    if (!indexByLine.has(lineNumber)) {
      indexByLine.set(lineNumber, index);
    }
  }

  const changes: BasicAutoFixChange[] = [];

  for (const error of errors) {
    const index = indexByLine.get(error.line);
    if (index === undefined) {
      continue;
    }

    const rawLine = lines[index] ?? "";
    const match = /^\s*(\d+)\s*(.*)$/u.exec(rawLine);
    if (!match) {
      continue;
    }

    const lineNumber = Number.parseInt(match[1] ?? "", 10);
    let content = match[2] ?? "";
    const notes: string[] = [];

    const quoteAdjusted = content.replace(/""/g, "");
    const quoteCount = (quoteAdjusted.match(/"/g) ?? []).length;
    if (quoteCount % 2 !== 0) {
      content = `${content}"`;
      notes.push('appended missing closing quote (")');
    }

    const sanitized = stripRemarks(stripStrings(content));
    const openParens = (sanitized.match(/\(/g) ?? []).length;
    const closeParens = (sanitized.match(/\)/g) ?? []).length;
    if (openParens > closeParens) {
      const deficit = openParens - closeParens;
      content = `${content}${")".repeat(deficit)}`;
      notes.push(`appended ${deficit} closing parenthesis${deficit > 1 ? "es" : ""}`);
    }

    if (notes.length > 0) {
      const updated = content.length > 0 ? `${lineNumber} ${content}` : `${lineNumber}`;
      lines[index] = updated;
      changes.push({
        line: lineNumber,
        notes,
      });
    }
  }

  if (changes.length === 0) {
    return undefined;
  }

  return {
    program: lines.join("\n"),
    changes,
  };
}

function stripStrings(content: string): string {
  let result = "";
  let inString = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index]!;
    if (char === '"') {
      if (inString && content[index + 1] === '"') {
        index += 1;
        continue;
      }
      inString = !inString;
      continue;
    }

    if (!inString) {
      result += char;
    }
  }

  return result;
}

function stripRemarks(content: string): string {
  const upper = content.toUpperCase();
  const remIndex = upper.search(/(^|:)\s*REM\b/);
  if (remIndex >= 0) {
    return content.slice(0, remIndex);
  }
  return content;
}

function normalizeRuntimeErrors(errors: readonly BasicRuntimeError[]): readonly StructuredRuntimeError[] {
  return errors.map((error) => ({
    line: error.line,
    ...(error.type ? { type: error.type } : {}),
    text: error.raw,
  }));
}

function structuredExecutionError(
  message: string,
  data: Record<string, unknown>,
): ToolRunResult {
  return {
    content: [
      {
        type: "text",
        text: message,
      },
    ],
    metadata: {
      error: {
        kind: "execution",
        details: data,
      },
    },
    structuredContent: {
      type: "json",
      data,
    },
    isError: true,
  };
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
      description: "Upload a BASIC program to the C64 and execute it immediately. Refer to c64://specs/basic for syntax and device I/O.",
      summary: "Uploads Commodore BASIC v2 source and runs it via Ultimate 64 firmware.",
      inputSchema: uploadBasicArgsSchema.jsonSchema,
      relatedResources: ["c64://specs/basic", "c64://context/bootstrap"],
      relatedPrompts: ["basic-program"],
      tags: ["basic", "execution"],
      prerequisites: ["read_screen"],
      examples: [
        {
          name: "Hello loop",
          description: "Print HELLO in a loop",
          arguments: { program: "10 PRINT \"HELLO\"\n20 GOTO 10" },
        },
      ],
      workflowHints: [
        "Invoke right after you generate BASIC source so it runs on the C64 without extra user steps.",
        "Ensure the program includes line numbers and uppercase keywords before calling the tool.",
      ],
      supportedPlatforms: ["c64u", "vice"] as const,
      async execute(args, ctx) {
        try {
          const parsed = uploadBasicArgsSchema.parse(args);
          ctx.logger.info("Uploading BASIC program", { sourceLength: parsed.program.length });

          const originalProgram = parsed.program;

          // Compute PRG locally to expose structured metadata
          let activeProgram = originalProgram;
          let prg = basicToPrg(activeProgram);
          let entryAddress = prg.readUInt16LE(0);

          const runBasic = async (source: string) => ctx.client.uploadAndRunBasic(source);

          let result = await runBasic(activeProgram);
          if (!result.success) {
            throw new ToolExecutionError("C64 firmware reported failure while running BASIC program", {
              details: extractFailureDetails(result.details),
            });
          }

          let screenOutput: string | undefined;
          try {
            screenOutput = await ctx.client.readScreen();
          } catch (screenError) {
            ctx.logger.warn("Unable to read screen after BASIC execution", toRecord(screenError));
          }

          let autoFixInfo:
            | {
                readonly changes: readonly BasicAutoFixChange[];
                readonly originalErrors: readonly BasicRuntimeError[];
              }
            | undefined;

          if (screenOutput) {
            const errors = parseBasicRuntimeErrors(screenOutput);
            if (errors.length > 0) {
              ctx.logger.warn("Detected BASIC runtime errors", {
                errors: errors.map((error) => ({ line: error.line, type: error.type })),
              });

              const normalizedErrors = normalizeRuntimeErrors(errors);
              const fixAttempt = attemptAutoFixBasicProgram(activeProgram, errors);
              if (!fixAttempt) {
                const data = {
                  kind: "basic_runtime_error" as const,
                  programSource: originalProgram,
                  errors: normalizedErrors,
                  ...(screenOutput ? { screen: screenOutput } : {}),
                  autoFix: {
                    attempted: false,
                  },
                };
                return structuredExecutionError("Detected BASIC runtime errors after execution.", data);
              }

              ctx.logger.info("Attempting BASIC auto-fix", {
                changes: fixAttempt.changes.map((change) => ({
                  line: change.line,
                  notes: change.notes,
                })),
              });

              const retryResult = await ctx.client.uploadAndRunBasic(fixAttempt.program);
              if (!retryResult.success) {
                const data = {
                  kind: "basic_runtime_error" as const,
                  programSource: originalProgram,
                  errors: normalizedErrors,
                  ...(screenOutput ? { screen: screenOutput } : {}),
                  autoFix: {
                    attempted: true,
                    changes: fixAttempt.changes,
                    programSource: fixAttempt.program,
                    failure: {
                      reason: "firmware_failure",
                      details: extractFailureDetails(retryResult.details),
                    },
                  },
                };
                return structuredExecutionError(
                  "Auto-fix failed due to firmware error while re-running BASIC program.",
                  data,
                );
              }

              let retryScreen: string | undefined;
              try {
                retryScreen = await ctx.client.readScreen();
              } catch (retryScreenError) {
                ctx.logger.warn("Unable to read screen after BASIC auto-fix execution", toRecord(retryScreenError));
              }

              const remainingErrors = retryScreen ? parseBasicRuntimeErrors(retryScreen) : [];
              if (remainingErrors.length > 0) {
                const data = {
                  kind: "basic_runtime_error" as const,
                  programSource: originalProgram,
                  errors: normalizedErrors,
                  ...(screenOutput ? { screen: screenOutput } : {}),
                  autoFix: {
                    attempted: true,
                    changes: fixAttempt.changes,
                    programSource: fixAttempt.program,
                    resultingErrors: normalizeRuntimeErrors(remainingErrors),
                    ...(retryScreen ? { screen: retryScreen } : {}),
                  },
                };
                return structuredExecutionError(
                  "BASIC program still reports errors after auto-fix attempt.",
                  data,
                );
              }

              activeProgram = fixAttempt.program;
              prg = basicToPrg(activeProgram);
              entryAddress = prg.readUInt16LE(0);
              result = retryResult;
              screenOutput = retryScreen;
              autoFixInfo = {
                changes: fixAttempt.changes,
                originalErrors: errors,
              };
            }
          }

          const message = autoFixInfo
            ? "Detected BASIC errors on execution; applied auto-fix and re-ran successfully."
            : "BASIC program uploaded and executed successfully.";

          const metadata = {
            success: true,
            details: result.details ?? null,
            ...(screenOutput ? { screen: screenOutput } : {}),
            ...(autoFixInfo
              ? {
                  autoFix: {
                    applied: true,
                    changes: autoFixInfo.changes,
                    originalErrors: autoFixInfo.originalErrors,
                  },
                }
              : {}),
          };

          const data = {
            kind: "upload_and_run_basic" as const,
            format: "prg" as const,
            entryAddress,
            prgSize: prg.length,
            resources: ["c64://specs/basic", "c64://context/bootstrap"],
            ...(screenOutput ? { screen: screenOutput } : {}),
            ...(autoFixInfo
              ? {
                  autoFix: {
                    changes: autoFixInfo.changes,
                    originalErrors: autoFixInfo.originalErrors,
                  },
                }
              : {}),
          };

          const base = textResult(message, metadata);
          return { ...base, structuredContent: { type: "json", data } };
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
      description: "Assemble 6502/6510 source code, upload the PRG, and run it immediately. See c64://specs/assembly.",
      summary: "Compiles assembly to a PRG and executes it on the C64 via Ultimate 64 firmware.",
      inputSchema: uploadAsmArgsSchema.jsonSchema,
      relatedResources: ["c64://specs/assembly", "c64://context/bootstrap"],
      relatedPrompts: ["assembly-program"],
      tags: ["assembly", "execution"],
      prerequisites: ["read_screen"],
      examples: [
        {
          name: "Set screen char",
          description: "Write 1 to $0400 then RTS",
          arguments: { program: ".org $0801\nstart: lda #$01\n sta $0400\n rts" },
        },
      ],
      workflowHints: [
        "Use when the user requests to run new 6502 code; surface any assembler diagnostics in your reply.",
        "Mention the entry routine or important addresses after execution so the user can continue debugging.",
      ],
      supportedPlatforms: ["c64u", "vice"] as const,
      async execute(args, ctx) {
        try {
          const parsed = uploadAsmArgsSchema.parse(args);
          ctx.logger.info("Uploading assembly program", { sourceLength: parsed.program.length });

          // Assemble locally to expose structured metadata
          const prg = assemblyToPrg(parsed.program);
          const entryAddress = prg.readUInt16LE(0);

          const result = await ctx.client.uploadAndRunAsm(parsed.program);
          if (!result.success) {
            return toolErrorResult(
              new ToolExecutionError("C64 firmware reported failure while running assembly program", {
                details: extractFailureDetails(result.details),
              }),
            );
          }

          const data = {
            kind: "upload_and_run_asm" as const,
            format: "prg" as const,
            entryAddress,
            prgSize: prg.length,
            resources: ["c64://specs/assembly", "c64://context/bootstrap"],
          };
          const base = textResult("Assembly program assembled, uploaded, and executed successfully.", {
            success: true,
            details: result.details ?? null,
          });
          return { ...base, structuredContent: { type: "json", data } };
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
      prerequisites: ["drives_list"],
      examples: [
        {
          name: "Load PRG from USB",
          description: "Load without running",
          arguments: { path: "//USB0/demo.prg" },
        },
      ],
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

          const data = {
            kind: "load_prg_file" as const,
            format: "prg" as const,
            path: parsed.path,
            entryAddress: null as number | null,
            resources: ["c64://context/bootstrap"],
          };
          const base = textResult(`PRG ${parsed.path} loaded into memory.`, {
            success: true,
            path: parsed.path,
            details: toRecord(result.details) ?? null,
          });
          return { ...base, structuredContent: { type: "json", data } };
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
      prerequisites: ["drives_list"],
      examples: [
        {
          name: "Run PRG from USB",
          description: "Load and RUN",
          arguments: { path: "//USB0/demo.prg" },
        },
      ],
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

          const data = {
            kind: "run_prg_file" as const,
            format: "prg" as const,
            path: parsed.path,
            entryAddress: null as number | null,
            resources: ["c64://context/bootstrap"],
          };
          const base = textResult(`PRG ${parsed.path} loaded and executed.`, {
            success: true,
            path: parsed.path,
            details: toRecord(result.details) ?? null,
          });
          return { ...base, structuredContent: { type: "json", data } };
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
      prerequisites: ["drives_list"],
      examples: [
        {
          name: "Start CRT",
          description: "Mount and run game.crt",
          arguments: { path: "//USB0/game.crt" },
        },
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

          const data = {
            kind: "run_crt_file" as const,
            format: "crt" as const,
            path: parsed.path,
            entryAddress: null as number | null,
            resources: ["c64://context/bootstrap"],
          };
          const base = textResult(`CRT ${parsed.path} mounted and started.`, {
            success: true,
            path: parsed.path,
            details: toRecord(result.details) ?? null,
          });
          return { ...base, structuredContent: { type: "json", data } };
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
