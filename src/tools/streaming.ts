import { defineToolModule } from "./types.js";
import { objectSchema, stringSchema } from "./schema.js";
import { textResult } from "./responses.js";
import {
  ToolError,
  ToolExecutionError,
  toolErrorResult,
  unknownErrorResult,
} from "./errors.js";

type StreamKind = "video" | "audio" | "debug";

const streamIdentifierSchema = stringSchema({
  description: "Stream type to control (video/audio/debug).",
  enum: ["video", "audio", "debug"],
});

const streamStartArgsSchema = objectSchema({
  description: "Arguments for starting an Ultimate streaming session.",
  properties: {
    stream: streamIdentifierSchema,
    target: stringSchema({
      description: "Destination host:port or UDP target understood by the firmware.",
      minLength: 3,
    }),
  },
  required: ["stream", "target"],
  additionalProperties: false,
});

const streamStopArgsSchema = objectSchema({
  description: "Arguments for stopping an Ultimate streaming session.",
  properties: {
    stream: streamIdentifierSchema,
  },
  required: ["stream"],
  additionalProperties: false,
});

function toRecord(details: unknown): Record<string, unknown> | undefined {
  if (details && typeof details === "object") {
    return details as Record<string, unknown>;
  }
  return undefined;
}

export const streamingModule = defineToolModule({
  domain: "streaming",
  summary: "Long-running or streaming workflows such as audio capture or SID playback monitoring.",
  resources: [
    "c64://specs/sid",
    "c64://docs/index",
  ],
  prompts: ["sid-music"],
  defaultLifecycle: "stream",
  defaultTags: ["stream", "monitoring"],
  tools: [
    {
      name: "stream_start",
      description: "Start an Ultimate streaming session (video/audio/debug) targeting a host:port destination.",
      summary: "Validates stream arguments and forwards the request to firmware, returning status metadata.",
      inputSchema: streamStartArgsSchema.jsonSchema,
      tags: ["stream", "start"],
      async execute(args, ctx) {
        try {
          const parsed = streamStartArgsSchema.parse(args ?? {});
          ctx.logger.info("Starting Ultimate stream", {
            stream: parsed.stream,
            target: parsed.target,
          });

          const result = await ctx.client.streamStart(parsed.stream as StreamKind, parsed.target);
          if (!result.success) {
            throw new ToolExecutionError("C64 firmware reported failure while starting stream", {
              details: toRecord(result.details),
            });
          }

          return textResult(`Stream ${parsed.stream} started toward ${parsed.target}.`, {
            success: true,
            stream: parsed.stream,
            target: parsed.target,
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
      name: "stream_stop",
      description: "Stop an Ultimate streaming session (video/audio/debug).",
      summary: "Requests the firmware to stop the specified stream and returns completion metadata.",
      inputSchema: streamStopArgsSchema.jsonSchema,
      tags: ["stream", "stop"],
      async execute(args, ctx) {
        try {
          const parsed = streamStopArgsSchema.parse(args ?? {});
          ctx.logger.info("Stopping Ultimate stream", {
            stream: parsed.stream,
          });

          const result = await ctx.client.streamStop(parsed.stream as StreamKind);
          if (!result.success) {
            throw new ToolExecutionError("C64 firmware reported failure while stopping stream", {
              details: toRecord(result.details),
            });
          }

          return textResult(`Stream ${parsed.stream} stop requested.`, {
            success: true,
            stream: parsed.stream,
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
