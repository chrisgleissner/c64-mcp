import { defineToolModule } from "./types.js";
import { numberSchema, objectSchema, stringSchema } from "./schema.js";
import { textResult } from "./responses.js";
import { ToolError, ToolExecutionError, toolErrorResult, unknownErrorResult } from "./errors.js";

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

const readScreenArgsSchema = objectSchema<Record<string, never>>({
  description: "No arguments are required for reading the current screen contents.",
  properties: {},
  additionalProperties: false,
});

const readMemoryArgsSchema = objectSchema({
  description: "Parameters for reading a block of memory from the C64.",
  properties: {
    address: stringSchema({
      description: "Start address expressed as $HHHH, decimal, or a documented symbol name.",
      minLength: 1,
    }),
    length: numberSchema({
      description: "Number of bytes to read starting from the resolved address.",
      integer: true,
      minimum: 1,
      maximum: 4096,
      default: 256,
    }),
  },
  required: ["address"],
  additionalProperties: false,
});

const writeMemoryArgsSchema = objectSchema({
  description: "Parameters for writing hexadecimal bytes into C64 memory.",
  properties: {
    address: stringSchema({
      description: "Destination address expressed as $HHHH, decimal, or a documented symbol name.",
      minLength: 1,
    }),
    bytes: stringSchema({
      description: "Hex byte sequence like $AABBCC or AA BB CC to write starting at the resolved address.",
      minLength: 2,
      pattern: /^[\s_0-9A-Fa-f$]+$/,
    }),
  },
  required: ["address", "bytes"],
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
    {
      name: "read_memory",
      description: "Read a range of bytes from main memory and return the data as hexadecimal.",
      summary: "Resolves symbols, reads memory, and returns a hex dump with addressing metadata.",
    inputSchema: readMemoryArgsSchema.jsonSchema,
    relatedResources: ["c64://context/bootstrap", "c64://specs/assembly", "c64://docs/index"],
      relatedPrompts: ["memory-debug", "assembly-program"],
      tags: ["memory", "hex"],
      async execute(args, ctx) {
        try {
          const parsed = readMemoryArgsSchema.parse(args ?? {});
          ctx.logger.info("Reading C64 memory", { address: parsed.address, length: parsed.length });

          const result = await ctx.client.readMemory(parsed.address, String(parsed.length));
          if (!result.success) {
            throw new ToolExecutionError("C64 firmware reported failure while reading memory", {
              details: normaliseFailure(result.details),
            });
          }

          const detailRecord = toRecord(result.details) ?? {};
          const resolvedAddress = typeof detailRecord.address === "string" ? detailRecord.address : undefined;
          const resolvedLength = typeof detailRecord.length === "number" ? detailRecord.length : undefined;

          const addressLabel = resolvedAddress ? `$${resolvedAddress}` : parsed.address;
          const lengthLabel = resolvedLength ?? parsed.length;

          return textResult(`Read ${lengthLabel} bytes starting at ${addressLabel}.`, {
            success: true,
            address: addressLabel,
            length: lengthLabel,
            hexData: result.data ?? null,
            details: detailRecord,
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
      name: "write_memory",
      description: "Write a hexadecimal byte sequence into main memory at the specified address.",
      summary: "Resolves symbols, validates hex data, and writes bytes to RAM via Ultimate firmware.",
      inputSchema: writeMemoryArgsSchema.jsonSchema,
      relatedResources: ["c64://context/bootstrap", "c64://specs/assembly", "c64://docs/index"],
      relatedPrompts: ["memory-debug", "assembly-program"],
      tags: ["memory", "hex", "write"],
      async execute(args, ctx) {
        try {
          const parsed = writeMemoryArgsSchema.parse(args ?? {});
          ctx.logger.info("Writing C64 memory", { address: parsed.address, bytesLength: parsed.bytes.length });

          const result = await ctx.client.writeMemory(parsed.address, parsed.bytes);
          if (!result.success) {
            throw new ToolExecutionError("C64 firmware reported failure while writing memory", {
              details: normaliseFailure(result.details),
            });
          }

          const detailRecord = toRecord(result.details) ?? {};
          let resolvedAddress: string;
          if (typeof detailRecord.address === "number") {
            resolvedAddress = `$${detailRecord.address.toString(16).toUpperCase().padStart(4, "0")}`;
          } else if (typeof detailRecord.address === "string" && detailRecord.address.length > 0) {
            resolvedAddress = detailRecord.address.startsWith("$")
              ? detailRecord.address
              : `$${detailRecord.address.toUpperCase()}`;
          } else {
            resolvedAddress = parsed.address.startsWith("$") ? parsed.address : `$${parsed.address}`;
          }
          const resolvedLength = typeof detailRecord.length === "number" ? detailRecord.length : undefined;

          return textResult(`Wrote ${resolvedLength ?? "the provided"} bytes starting at ${resolvedAddress}.`, {
            success: true,
            address: resolvedAddress,
            length: resolvedLength ?? null,
            bytes: parsed.bytes,
            details: detailRecord,
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
