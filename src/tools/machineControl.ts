import { defineToolModule } from "./types.js";
import {
  objectSchema,
  stringSchema,
} from "./schema.js";
import { textResult } from "./responses.js";
import {
  ToolError,
  ToolExecutionError,
  toolErrorResult,
  unknownErrorResult,
} from "./errors.js";

function createNoArgsSchema(description: string) {
  return objectSchema<Record<string, never>>({
    description,
    properties: {},
    additionalProperties: false,
  });
}

function toRecord(details: unknown): Record<string, unknown> | undefined {
  if (details && typeof details === "object") {
    return details as Record<string, unknown>;
  }
  return undefined;
}

function normaliseFailure(details: unknown): Record<string, unknown> | undefined {
  if (details === undefined || details === null) {
    return undefined;
  }
  if (typeof details === "object") {
    return details as Record<string, unknown>;
  }
  return { value: details };
}

const resetArgsSchema = createNoArgsSchema("No arguments required to reset the C64.");
const rebootArgsSchema = createNoArgsSchema("No arguments required to reboot the C64 firmware.");
const pauseArgsSchema = createNoArgsSchema("No arguments required to pause the machine via DMA.");
const resumeArgsSchema = createNoArgsSchema("No arguments required to resume the machine after a pause.");
const poweroffArgsSchema = createNoArgsSchema("No arguments required to power off the machine.");
const menuButtonArgsSchema = createNoArgsSchema("No arguments required to toggle the Ultimate menu button.");
const versionArgsSchema = createNoArgsSchema("Fetch the firmware/API version information.");
const infoArgsSchema = createNoArgsSchema("Fetch hardware information and health details.");
const debugReadArgsSchema = createNoArgsSchema("No arguments required to read the debug register.");

const debugWriteArgsSchema = objectSchema({
  description: "Write a hex byte into the Ultimate debug register ($D7FF).",
  properties: {
    value: stringSchema({
      description: "Hex value (00-FF) to write to the debug register.",
      minLength: 1,
      maxLength: 2,
      pattern: /^[0-9A-Fa-f]{1,2}$/,
    }),
  },
  required: ["value"],
  additionalProperties: false,
});

export const machineControlModule = defineToolModule({
  domain: "machine",
  summary: "Power, reset, pause/resume, and diagnostic controls for the C64 and Ultimate hardware.",
  resources: ["c64://context/bootstrap"],
  prompts: ["memory-debug"],
  defaultTags: ["machine", "control"],
  tools: [
    {
      name: "reset_c64",
      description: "Reset the C64 via Ultimate firmware.",
      summary: "Issues a soft reset, equivalent to power cycling without cutting power.",
      inputSchema: resetArgsSchema.jsonSchema,
      tags: ["reset"],
      async execute(args, ctx) {
        try {
          resetArgsSchema.parse(args ?? {});
          ctx.logger.info("Resetting C64");

          const result = await ctx.client.reset();
          if (!result.success) {
            throw new ToolExecutionError("C64 firmware reported failure while resetting", {
              details: normaliseFailure(result.details),
            });
          }

          const details = toRecord(result.details) ?? {};

          return textResult("C64 reset command issued successfully.", {
            success: true,
            details,
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
      name: "reboot_c64",
      description: "Reboot the Ultimate firmware and C64.",
      summary: "Triggers a firmware reboot, useful after configuration changes.",
      inputSchema: rebootArgsSchema.jsonSchema,
      tags: ["reboot"],
      async execute(args, ctx) {
        try {
          rebootArgsSchema.parse(args ?? {});
          ctx.logger.info("Rebooting C64");

          const result = await ctx.client.reboot();
          if (!result.success) {
            throw new ToolExecutionError("C64 firmware reported failure while rebooting", {
              details: normaliseFailure(result.details),
            });
          }

          const details = toRecord(result.details) ?? {};

          return textResult("C64 reboot command issued successfully.", {
            success: true,
            details,
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
      name: "pause",
      description: "Pause the machine using DMA halt.",
      summary: "Suspends CPU execution until resumed.",
      inputSchema: pauseArgsSchema.jsonSchema,
      tags: ["pause"],
      async execute(args, ctx) {
        try {
          pauseArgsSchema.parse(args ?? {});
          ctx.logger.info("Pausing C64 execution");

          const result = await ctx.client.pause();
          if (!result.success) {
            throw new ToolExecutionError("C64 firmware reported failure while pausing", {
              details: normaliseFailure(result.details),
            });
          }

          const details = toRecord(result.details) ?? {};

          return textResult("C64 execution paused.", {
            success: true,
            details,
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
      name: "resume",
      description: "Resume the machine after a DMA pause.",
      summary: "Releases the DMA halt so the CPU can continue.",
      inputSchema: resumeArgsSchema.jsonSchema,
      tags: ["resume"],
      async execute(args, ctx) {
        try {
          resumeArgsSchema.parse(args ?? {});
          ctx.logger.info("Resuming C64 execution");

          const result = await ctx.client.resume();
          if (!result.success) {
            throw new ToolExecutionError("C64 firmware reported failure while resuming", {
              details: normaliseFailure(result.details),
            });
          }

          const details = toRecord(result.details) ?? {};

          return textResult("C64 execution resumed.", {
            success: true,
            details,
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
      name: "poweroff",
      description: "Power off the machine via Ultimate firmware.",
      summary: "Attempts a controlled shutdown through the Ultimate control interface.",
      inputSchema: poweroffArgsSchema.jsonSchema,
      tags: ["power"],
      async execute(args, ctx) {
        try {
          poweroffArgsSchema.parse(args ?? {});
          ctx.logger.info("Powering off C64");

          const result = await ctx.client.poweroff();
          if (!result.success) {
            throw new ToolExecutionError("C64 firmware reported failure while powering off", {
              details: normaliseFailure(result.details),
            });
          }

          const details = toRecord(result.details) ?? {};

          return textResult("Power off command acknowledged.", {
            success: true,
            details,
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
      name: "menu_button",
      description: "Toggle the Ultimate 64 menu button.",
      summary: "Simulates the on-device menu button for navigation or exit.",
      inputSchema: menuButtonArgsSchema.jsonSchema,
      tags: ["menu"],
      async execute(args, ctx) {
        try {
          menuButtonArgsSchema.parse(args ?? {});
          ctx.logger.info("Toggling Ultimate menu button");

          const result = await ctx.client.menuButton();
          if (!result.success) {
            throw new ToolExecutionError("C64 firmware reported failure while toggling menu button", {
              details: normaliseFailure(result.details),
            });
          }

          const details = toRecord(result.details) ?? {};

          return textResult("Menu button command sent.", {
            success: true,
            details,
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
      name: "version",
      description: "Retrieve firmware and API version information.",
      summary: "Calls the Ultimate REST API version endpoint and returns the JSON payload.",
      inputSchema: versionArgsSchema.jsonSchema,
      tags: ["diagnostics"],
      async execute(args, ctx) {
        try {
          versionArgsSchema.parse(args ?? {});
          ctx.logger.info("Fetching Ultimate firmware version");

          const details = await ctx.client.version();
          return textResult("Retrieved Ultimate firmware version information.", {
            success: true,
            details,
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
      name: "info",
      description: "Retrieve hardware information and status from the Ultimate.",
      summary: "Calls the Ultimate REST API info endpoint for diagnostics data.",
      inputSchema: infoArgsSchema.jsonSchema,
      tags: ["diagnostics"],
      async execute(args, ctx) {
        try {
          infoArgsSchema.parse(args ?? {});
          ctx.logger.info("Fetching Ultimate hardware info");

          const details = await ctx.client.info();
          return textResult("Retrieved Ultimate hardware information.", {
            success: true,
            details,
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
      name: "debugreg_read",
      description: "Read the Ultimate debug register ($D7FF).",
      summary: "Returns the current hex value stored in the debug register.",
      inputSchema: debugReadArgsSchema.jsonSchema,
      tags: ["debug"],
      async execute(args, ctx) {
        try {
          debugReadArgsSchema.parse(args ?? {});
          ctx.logger.info("Reading Ultimate debug register");

          const result = await ctx.client.debugregRead();
          if (!result.success) {
            throw new ToolExecutionError("C64 firmware reported failure while reading debug register", {
              details: normaliseFailure(result.details),
            });
          }

          const details = toRecord(result.details) ?? {};
          const value = typeof result.value === "string" ? result.value.toUpperCase() : null;

          return textResult(`Debug register value: ${value ?? "(unknown)"}.`, {
            success: true,
            value,
            details,
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
      name: "debugreg_write",
      description: "Write a value into the Ultimate debug register ($D7FF).",
      summary: "Validates hex input and forwards it to the firmware.",
      inputSchema: debugWriteArgsSchema.jsonSchema,
      tags: ["debug"],
      async execute(args, ctx) {
        try {
          const parsed = debugWriteArgsSchema.parse(args ?? {});
          const value = parsed.value.toUpperCase();
          ctx.logger.info("Writing Ultimate debug register", { value });

          const result = await ctx.client.debugregWrite(value);
          if (!result.success) {
            throw new ToolExecutionError("C64 firmware reported failure while writing debug register", {
              details: normaliseFailure(result.details),
            });
          }

          const details = toRecord(result.details) ?? {};

          return textResult(`Debug register written with ${value}.`, {
            success: true,
            value,
            details,
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
