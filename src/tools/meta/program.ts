// Program testing and orchestration meta tools
import type { ToolDefinition } from "../types.js";
import { objectSchema, stringSchema, arraySchema, numberSchema, optionalSchema, booleanSchema } from "../schema.js";
import { jsonResult } from "../responses.js";
import { ToolError, ToolExecutionError, toolErrorResult, unknownErrorResult } from "../errors.js";
import { promises as fs } from "node:fs";
import { resolve as resolvePath, join as joinPath } from "node:path";
import { sleep, formatTimestampSpec } from "./util.js";
import { getTasksHomeDir } from "./background.js";

const programShuffleArgsSchema = objectSchema({
  description: "Discover PRG/CRT files under root path, run each for a duration, capture screen, then reset.",
  properties: {
    root: optionalSchema(stringSchema({ description: "Root path to search for programs", minLength: 1 }), "/"),
    extensions: optionalSchema(arraySchema(stringSchema({ description: "File extensions to include (without dot)", minLength: 1 })), ["prg", "crt"] as any),
    durationMs: optionalSchema(numberSchema({ description: "Duration to run each program in milliseconds", integer: true, minimum: 1, default: 5000 }), 5000),
    captureScreen: optionalSchema(booleanSchema({ description: "Capture screen after each run", default: true }), true),
    maxPrograms: optionalSchema(numberSchema({ description: "Maximum number of programs to run", integer: true, minimum: 1, default: 10 }), 10),
    outputPath: optionalSchema(stringSchema({ description: "Output directory for run logs and captures", minLength: 1 })),
    resetDelayMs: optionalSchema(numberSchema({ description: "Delay after reset operations to allow the platform to settle.", integer: true, minimum: 0, maximum: 1000, default: 100 }), 100),
  },
  required: [],
  additionalProperties: false,
});

const batchRunWithAssertionsArgsSchema = objectSchema({
  description: "Run programs with post-conditions; produce junit-like results.",
  properties: {
    programs: arraySchema(objectSchema({
      description: "Program to run with assertions",
      properties: {
        path: stringSchema({ description: "Program path (PRG or CRT)", minLength: 1 }),
        assertions: optionalSchema(arraySchema(objectSchema({
          description: "Assertion to check after run",
          properties: {
            type: stringSchema({ description: "Assertion type", enum: ["screen_contains", "memory_equals", "sid_silent"] }),
            pattern: optionalSchema(stringSchema({ description: "Pattern for screen_contains", minLength: 1 })),
            address: optionalSchema(stringSchema({ description: "Address for memory_equals", minLength: 1 })),
            expected: optionalSchema(stringSchema({ description: "Expected value (hex)", minLength: 1 })),
          },
          required: ["type"],
          additionalProperties: false,
        }))),
      },
      required: ["path"],
      additionalProperties: false,
    })),
    continueOnError: optionalSchema(booleanSchema({ description: "Continue running programs after assertion failure", default: false }), false),
    durationMs: optionalSchema(numberSchema({ description: "Duration to run each program before assertions", integer: true, minimum: 1, default: 2000 }), 2000),
    outputPath: optionalSchema(stringSchema({ description: "Output directory for test results", minLength: 1 })),
    resetDelayMs: optionalSchema(numberSchema({ description: "Delay after reset operations to allow the platform to settle.", integer: true, minimum: 0, maximum: 1000, default: 100 }), 100),
  },
  required: ["programs"],
  additionalProperties: false,
});

export const tools: ToolDefinition[] = [
  {
    name: "program_shuffle",
    description: "Discover and run PRG/CRT programs under a root path, capturing screens and resetting between runs.",
    summary: "Automated program testing workflow with screen captures and run logs.",
    inputSchema: programShuffleArgsSchema.jsonSchema,
    tags: ["orchestration", "programs", "testing"],
    examples: [{ name: "Shuffle games", description: "Run all PRG files in /games", arguments: { root: "/games", durationMs: 3000, maxPrograms: 5 } }],
    async execute(args, ctx) {
      try {
        const parsed = programShuffleArgsSchema.parse(args ?? {});
        const root = parsed.root ?? "/";
        const extensions = (parsed.extensions ?? ["prg", "crt"]) as string[];
        const durationMs = parsed.durationMs ?? 5000;
        const maxPrograms = parsed.maxPrograms ?? 10;
        const captureScreen = parsed.captureScreen !== false;
  const resetDelayMs = parsed.resetDelayMs ?? 100;
        
        // Discover programs
        const programs: string[] = [];
        for (const ext of extensions) {
          const pattern = `${root}/**/*.${ext}`;
          try {
            const info = await (ctx.client as any).filesInfo(pattern);
            const paths = Array.isArray(info) ? info : (Array.isArray((info as any)?.paths) ? (info as any).paths : []);
            for (const p of paths) {
              if (typeof p === "string" && programs.length < maxPrograms) {
                programs.push(p);
              }
            }
          } catch (e) {
            // Ignore discovery errors for individual patterns
          }
        }

        if (programs.length === 0) {
          throw new ToolExecutionError("No programs found", { details: { root, extensions } });
        }

        // Prepare output directory
        const outputPath = parsed.outputPath 
          ? resolvePath(String(parsed.outputPath))
          : resolvePath(joinPath(getTasksHomeDir(), `shuffle_${Date.now()}`));
        await fs.mkdir(outputPath, { recursive: true });

        const results: Array<{ path: string; started: string; ended: string; durationMs: number; screen?: string; error?: string }> = [];

        // Run each program
        for (const programPath of programs.slice(0, maxPrograms)) {
          const started = new Date();
          let screen: string | undefined;
          let error: string | undefined;

          try {
            const ext = programPath.toLowerCase().split(".").pop();
            if (ext === "prg") {
              await (ctx.client as any).runPrgFile(programPath);
            } else if (ext === "crt") {
              await (ctx.client as any).runCrtFile(programPath);
            }

            await sleep(durationMs);

            if (captureScreen) {
              screen = await (ctx.client as any).readScreen();
            }
          } catch (e) {
            error = e instanceof Error ? e.message : String(e);
          } finally {
            // Reset
            try {
              await (ctx.client as any).reset();
              if (resetDelayMs > 0) {
                await sleep(resetDelayMs);
              }
            } catch (e) {
              // Ignore reset errors
            }
          }

          const ended = new Date();
          results.push({
            path: programPath,
            started: formatTimestampSpec(started),
            ended: formatTimestampSpec(ended),
            durationMs: ended.getTime() - started.getTime(),
            screen,
            error,
          });
        }

        // Write log
        const logPath = resolvePath(joinPath(outputPath, "shuffle.json"));
        await fs.writeFile(logPath, JSON.stringify({ programs: results, summary: { total: results.length, errors: results.filter(r => r.error).length } }, null, 2), "utf8");

        return jsonResult({ outputPath, programs: results.length, errors: results.filter(r => r.error).length, logPath }, { success: true });
      } catch (error) {
        if (error instanceof ToolError) return toolErrorResult(error);
        return unknownErrorResult(error);
      }
    },
  },
  {
    name: "batch_run_with_assertions",
    description: "Run multiple programs with post-condition assertions; produce junit-like results.",
    summary: "Automated testing workflow with assertions and structured reporting.",
    inputSchema: batchRunWithAssertionsArgsSchema.jsonSchema,
    tags: ["orchestration", "testing", "assertions"],
    examples: [
      {
        name: "Test programs",
        description: "Run programs with screen assertions",
        arguments: {
          programs: [
            { path: "/games/demo.prg", assertions: [{ type: "screen_contains", pattern: "READY." }] },
          ],
          continueOnError: true,
        },
      },
    ],
    async execute(args, ctx) {
      try {
        const parsed = batchRunWithAssertionsArgsSchema.parse(args ?? {});
        const programs = parsed.programs as Array<{ path: string; assertions?: Array<{ type: string; pattern?: string; address?: string; expected?: string }> }>;
        const continueOnError = parsed.continueOnError ?? false;
        const durationMs = parsed.durationMs ?? 2000;
  const resetDelayMs = parsed.resetDelayMs ?? 100;

        const outputPath = parsed.outputPath
          ? resolvePath(String(parsed.outputPath))
          : resolvePath(joinPath(getTasksHomeDir(), `batch_${Date.now()}`));
        await fs.mkdir(outputPath, { recursive: true });

        const results: Array<{ path: string; status: "pass" | "fail" | "error"; assertions: Array<{ type: string; status: "pass" | "fail"; message?: string }>; error?: string }> = [];

        for (const program of programs) {
          const started = new Date();
          const assertionResults: Array<{ type: string; status: "pass" | "fail"; message?: string }> = [];
          let status: "pass" | "fail" | "error" = "pass";
          let error: string | undefined;

          try {
            // Run program
            const ext = program.path.toLowerCase().split(".").pop();
            if (ext === "prg") {
              await (ctx.client as any).runPrgFile(program.path);
            } else if (ext === "crt") {
              await (ctx.client as any).runCrtFile(program.path);
            }

            await sleep(durationMs);

            // Check assertions
            const assertions = program.assertions ?? [];
            for (const assertion of assertions) {
              if (assertion.type === "screen_contains") {
                const screen = await (ctx.client as any).readScreen();
                const pattern = assertion.pattern ?? "";
                const matched = screen.includes(pattern);
                assertionResults.push({
                  type: assertion.type,
                  status: matched ? "pass" : "fail",
                  message: matched ? undefined : `Screen does not contain "${pattern}"`,
                });
                if (!matched) status = "fail";
              } else if (assertion.type === "memory_equals") {
                const addr = assertion.address ?? "$0400";
                const expected = assertion.expected ?? "$00";
                const result = await (ctx.client as any).readMemory(addr, "1");
                const actual = result.data ?? "$00";
                const matched = actual.toLowerCase() === expected.toLowerCase();
                assertionResults.push({
                  type: assertion.type,
                  status: matched ? "pass" : "fail",
                  message: matched ? undefined : `Memory at ${addr} is ${actual}, expected ${expected}`,
                });
                if (!matched) status = "fail";
              } else if (assertion.type === "sid_silent") {
                // Check SID gate bits are off (simple check)
                const result = await (ctx.client as any).readMemory("$D404", "1");
                const gate1 = parseInt((result.data ?? "$00").slice(1), 16) & 0x01;
                const isSilent = gate1 === 0;
                assertionResults.push({
                  type: assertion.type,
                  status: isSilent ? "pass" : "fail",
                  message: isSilent ? undefined : "SID voice 1 gate is on",
                });
                if (!isSilent) status = "fail";
              }
            }
          } catch (e) {
            status = "error";
            error = e instanceof Error ? e.message : String(e);
          } finally {
            // Reset
            try {
              await (ctx.client as any).reset();
              if (resetDelayMs > 0) {
                await sleep(resetDelayMs);
              }
            } catch (e) {
              // Ignore reset errors
            }
          }

          results.push({
            path: program.path,
            status,
            assertions: assertionResults,
            error,
          });

          if (status !== "pass" && !continueOnError) {
            break;
          }
        }

        // Write junit-like report
        const reportPath = resolvePath(joinPath(outputPath, "results.json"));
        const summary = {
          total: results.length,
          passed: results.filter(r => r.status === "pass").length,
          failed: results.filter(r => r.status === "fail").length,
          errors: results.filter(r => r.status === "error").length,
        };
        await fs.writeFile(reportPath, JSON.stringify({ summary, results }, null, 2), "utf8");

        return jsonResult({ outputPath, summary, reportPath }, { success: summary.failed === 0 && summary.errors === 0 });
      } catch (error) {
        if (error instanceof ToolError) return toolErrorResult(error);
        return unknownErrorResult(error);
      }
    },
  },
];
