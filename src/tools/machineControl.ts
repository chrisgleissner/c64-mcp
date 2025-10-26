import { defineToolModule } from "./types.js";
import { objectSchema } from "./schema.js";
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

export const machineControlModule = defineToolModule({
  domain: "machine",
  summary: "Power, reset, pause/resume, and diagnostic controls for the C64 and Ultimate hardware.",
  resources: ["c64://context/bootstrap"],
  prompts: ["memory-debug"],
  defaultTags: ["machine", "control"],
  workflowHints: [
    "Reach for machine controls when the user mentions resets, power states, or DMA pause/resume.",
    "Explain the operational impact (e.g. soft reset vs firmware reboot) so the user knows what changed.",
  ],
  tools: [
    {
      name: "reset_c64",
      description: "Reset the C64 via Ultimate firmware. Review c64://context/bootstrap safety rules.",
      summary: "Issues a soft reset, equivalent to power cycling without cutting power.",
      inputSchema: resetArgsSchema.jsonSchema,
      tags: ["reset"],
      prerequisites: [],
      examples: [
        { name: "Soft reset", description: "Reset machine", arguments: {} },
      ],
      workflowHints: [
        "Use when the user wants a quick restart without losing power; mention that memory contents may persist.",
      ],
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
      description: "Reboot the Ultimate firmware and C64. See c64://context/bootstrap.",
      summary: "Triggers a firmware reboot, useful after configuration changes.",
      inputSchema: rebootArgsSchema.jsonSchema,
      tags: ["reboot"],
      prerequisites: [],
      examples: [
        { name: "Firmware reboot", description: "Hard reboot", arguments: {} },
      ],
      workflowHints: [
        "Choose reboot when configuration changed or hardware is stuck; warn that it will interrupt any running program.",
      ],
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
      description: "Pause the machine using DMA halt. See memory safety checklist in c64://context/bootstrap.",
      summary: "Suspends CPU execution until resumed.",
      inputSchema: pauseArgsSchema.jsonSchema,
      tags: ["pause"],
      prerequisites: [],
      examples: [
        { name: "Pause", description: "Halt CPU", arguments: {} },
      ],
      workflowHints: [
        "Pause when the user needs a stable memory snapshot; remind them to resume to continue execution.",
      ],
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
      prerequisites: ["pause"],
      examples: [
        { name: "Resume", description: "Continue CPU", arguments: {} },
      ],
      workflowHints: [
        "Call after a pause or diagnostic halt and confirm the machine is running again.",
      ],
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
      description: "Power off the machine via Ultimate firmware. See safety notes in c64://context/bootstrap.",
      summary: "Attempts a controlled shutdown through the Ultimate control interface.",
      inputSchema: poweroffArgsSchema.jsonSchema,
      tags: ["power"],
      prerequisites: [],
      examples: [
        { name: "Power off", description: "Shut down", arguments: {} },
      ],
      workflowHints: [
        "Use when the user explicitly requests power off; remind them to power on manually or via drive controls afterwards.",
      ],
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
      prerequisites: [],
      examples: [
        { name: "Menu", description: "Toggle menu", arguments: {} },
      ],
      workflowHints: [
        "Use when the user needs to open or close the Ultimate menu; suggest following up with drive operations if relevant.",
      ],
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
  ],
});
