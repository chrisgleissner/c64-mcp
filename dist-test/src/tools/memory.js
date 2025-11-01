import { Buffer } from "node:buffer";
import { defineToolModule, OPERATION_DISCRIMINATOR, } from "./types.js";
import { booleanSchema, numberSchema, objectSchema, optionalSchema, stringSchema } from "./schema.js";
import { textResult } from "./responses.js";
import { ToolError, ToolExecutionError, ToolValidationError, toolErrorResult, unknownErrorResult, } from "./errors.js";
function toRecord(details) {
    if (details && typeof details === "object") {
        return details;
    }
    return undefined;
}
function normaliseFailure(details) {
    if (details === undefined || details === null) {
        return undefined;
    }
    if (typeof details === "object") {
        return details;
    }
    return { value: details };
}
function cleanHex(input) {
    const trimmed = input.trim();
    const withoutPrefix = trimmed.startsWith("$") ? trimmed.slice(1) : trimmed;
    return withoutPrefix.replace(/[\s_]/g, "").toUpperCase();
}
function parseHexInternal(value, path) {
    const cleaned = cleanHex(value);
    if (cleaned.length % 2 !== 0) {
        throw new ToolValidationError("Hex string must have an even number of characters", {
            path,
            details: { value },
        });
    }
    if (cleaned.length === 0) {
        return { bytes: new Uint8Array(), canonical: "$" };
    }
    const bytes = Uint8Array.from(Buffer.from(cleaned, "hex"));
    return { bytes, canonical: `$${cleaned}` };
}
function parseUserHex(value, path) {
    return parseHexInternal(value, path);
}
function parseFirmwareHex(value, stage) {
    if (typeof value !== "string") {
        throw new ToolExecutionError(`Firmware returned invalid ${stage} hex data`, {
            details: { value },
        });
    }
    try {
        return parseHexInternal(value, stage);
    }
    catch (error) {
        if (error instanceof ToolValidationError) {
            throw new ToolExecutionError(`Firmware returned malformed ${stage} hex data`, {
                details: { value },
            });
        }
        throw error;
    }
}
function formatByte(value) {
    return `$${value.toString(16).toUpperCase().padStart(2, "0")}`;
}
function resolveAddressLabel(details, fallback) {
    if (typeof details.address === "number") {
        return `$${details.address.toString(16).toUpperCase().padStart(4, "0")}`;
    }
    if (typeof details.address === "string" && details.address.length > 0) {
        return details.address.startsWith("$")
            ? details.address
            : `$${details.address.toUpperCase()}`;
    }
    return fallback.startsWith("$") ? fallback : `$${fallback}`;
}
function resolveLength(details) {
    return typeof details.length === "number" ? details.length : undefined;
}
const readScreenArgsSchema = objectSchema({
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
        verify: booleanSchema({
            description: "When true, pause and verify the write by reading back the affected range.",
            default: false,
        }),
        expected: optionalSchema(stringSchema({
            description: "Optional hex data expected before the write (verifies before writing).",
            minLength: 2,
            pattern: /^[\s_0-9A-Fa-f$]+$/,
        })),
        mask: optionalSchema(stringSchema({
            description: "Optional verification mask (hex); only bits set in the mask are compared.",
            minLength: 2,
            pattern: /^[\s_0-9A-Fa-f$]+$/,
        })),
        abortOnMismatch: booleanSchema({
            description: "Abort the write when the pre-write verification fails.",
            default: true,
        }),
    },
    required: ["address", "bytes"],
    additionalProperties: false,
});
function stripOperationDiscriminator(value) {
    const { [OPERATION_DISCRIMINATOR]: _ignored, ...rest } = value;
    return rest;
}
async function executeReadScreen(rawArgs, ctx) {
    try {
        readScreenArgsSchema.parse(rawArgs ?? {});
        ctx.logger.info("Reading C64 screen contents");
        const screen = await ctx.client.readScreen();
        return textResult(`Current screen contents:\n${screen}`, {
            success: true,
            screen,
            length: screen.length,
        });
    }
    catch (error) {
        if (error instanceof ToolError) {
            return toolErrorResult(error);
        }
        return unknownErrorResult(error);
    }
}
async function executeReadMemory(rawArgs, ctx) {
    try {
        const parsed = readMemoryArgsSchema.parse(rawArgs ?? {});
        ctx.logger.info("Reading C64 memory", { address: parsed.address, length: parsed.length });
        const result = await ctx.client.readMemory(parsed.address, String(parsed.length));
        if (!result.success) {
            throw new ToolExecutionError("C64 firmware reported failure while reading memory", {
                details: normaliseFailure(result.details),
            });
        }
        const detailRecord = toRecord(result.details) ?? {};
        const resolvedAddress = resolveAddressLabel(detailRecord, parsed.address);
        const resolvedLength = resolveLength(detailRecord) ?? parsed.length;
        return textResult(`Read ${resolvedLength} bytes starting at ${resolvedAddress}.`, {
            success: true,
            address: resolvedAddress,
            length: resolvedLength,
            hexData: result.data ?? null,
            details: detailRecord,
        });
    }
    catch (error) {
        if (error instanceof ToolError) {
            return toolErrorResult(error);
        }
        return unknownErrorResult(error);
    }
}
async function executeWriteMemory(rawArgs, ctx) {
    try {
        const parsed = writeMemoryArgsSchema.parse(rawArgs ?? {});
        ctx.logger.info("Writing C64 memory", { address: parsed.address, bytesLength: parsed.bytes.length });
        const writeInfo = parseUserHex(parsed.bytes, "$.bytes");
        const expectedInfo = parsed.expected ? parseUserHex(parsed.expected, "$.expected") : undefined;
        const maskInfo = parsed.mask ? parseUserHex(parsed.mask, "$.mask") : undefined;
        const shouldVerify = parsed.verify || Boolean(expectedInfo) || Boolean(maskInfo);
        if (!shouldVerify) {
            const result = await ctx.client.writeMemory(parsed.address, writeInfo.canonical);
            if (!result.success) {
                throw new ToolExecutionError("C64 firmware reported failure while writing memory", {
                    details: normaliseFailure(result.details),
                });
            }
            const detailRecord = toRecord(result.details) ?? {};
            const resolvedAddress = resolveAddressLabel(detailRecord, parsed.address);
            const resolvedLength = resolveLength(detailRecord);
            return textResult(`Wrote ${resolvedLength ?? "the provided"} bytes starting at ${resolvedAddress}.`, {
                success: true,
                address: resolvedAddress,
                length: resolvedLength ?? null,
                bytes: writeInfo.canonical,
                details: detailRecord,
            });
        }
        let paused = false;
        try {
            const pauseResult = await ctx.client.pause();
            if (!pauseResult.success) {
                throw new ToolExecutionError("C64 firmware reported failure while pausing", {
                    details: normaliseFailure(pauseResult.details),
                });
            }
            paused = true;
            const expectedBytes = expectedInfo?.bytes ?? new Uint8Array();
            const maskBytes = maskInfo?.bytes;
            const readLength = Math.max(1, Math.max(writeInfo.bytes.length, expectedBytes.length));
            const preRead = await ctx.client.readMemory(parsed.address, String(readLength));
            if (!preRead.success) {
                throw new ToolExecutionError("C64 firmware reported failure while reading memory", {
                    details: normaliseFailure(preRead.details),
                });
            }
            const preInfo = parseFirmwareHex(preRead.data ?? "$", "pre-read");
            const preMismatches = [];
            if (expectedBytes.length > 0) {
                for (let i = 0; i < expectedBytes.length; i += 1) {
                    const actual = preInfo.bytes[i] ?? 0x00;
                    const expected = expectedBytes[i] ?? 0x00;
                    const mask = maskBytes ? maskBytes[i] ?? 0xFF : 0xFF;
                    if ((actual & mask) !== (expected & mask)) {
                        preMismatches.push({
                            offset: i,
                            expected: formatByte(expected),
                            actual: formatByte(actual),
                            ...(maskBytes ? { mask: formatByte(mask) } : {}),
                        });
                    }
                }
                if (preMismatches.length > 0 && parsed.abortOnMismatch !== false) {
                    throw new ToolExecutionError("Verification failed before write", {
                        details: { mismatches: preMismatches, address: parsed.address },
                    });
                }
            }
            const writeResult = await ctx.client.writeMemory(parsed.address, writeInfo.canonical);
            if (!writeResult.success) {
                throw new ToolExecutionError("C64 firmware reported failure while writing memory", {
                    details: normaliseFailure(writeResult.details),
                });
            }
            const postRead = await ctx.client.readMemory(parsed.address, String(Math.max(1, writeInfo.bytes.length)));
            if (!postRead.success) {
                throw new ToolExecutionError("C64 firmware reported failure while reading back memory", {
                    details: normaliseFailure(postRead.details),
                });
            }
            const postInfo = parseFirmwareHex(postRead.data ?? "$", "post-read");
            const diffs = [];
            for (let i = 0; i < writeInfo.bytes.length; i += 1) {
                const before = preInfo.bytes[i] ?? 0x00;
                const after = postInfo.bytes[i] ?? 0x00;
                const expected = writeInfo.bytes[i] ?? 0x00;
                if (after !== expected) {
                    diffs.push({
                        offset: i,
                        before: formatByte(before),
                        after: formatByte(after),
                        expected: formatByte(expected),
                    });
                }
            }
            if (diffs.length > 0) {
                throw new ToolExecutionError("Post-write verification failed", {
                    details: { address: parsed.address, diffs },
                });
            }
            const detailRecord = toRecord(writeResult.details) ?? {};
            const resolvedAddress = resolveAddressLabel(detailRecord, parsed.address);
            const resolvedLength = resolveLength(detailRecord);
            const verificationMetadata = {
                written: writeInfo.canonical,
                preRead: preInfo.canonical,
                postRead: postInfo.canonical,
                readLength,
            };
            if (expectedInfo) {
                verificationMetadata.expected = expectedInfo.canonical;
            }
            if (maskInfo) {
                verificationMetadata.mask = maskInfo.canonical;
            }
            if (preMismatches.length > 0) {
                verificationMetadata.preReadMismatches = preMismatches;
            }
            return textResult(`Wrote ${resolvedLength ?? "the provided"} bytes starting at ${resolvedAddress} (verified).`, {
                success: true,
                address: resolvedAddress,
                length: resolvedLength ?? null,
                bytes: writeInfo.canonical,
                details: detailRecord,
                verified: true,
                verification: verificationMetadata,
            });
        }
        finally {
            if (paused) {
                try {
                    const resumeResult = await ctx.client.resume();
                    if (!resumeResult.success) {
                        ctx.logger.warn("C64 resume reported failure after write", {
                            details: normaliseFailure(resumeResult.details),
                        });
                    }
                }
                catch (resumeError) {
                    ctx.logger.warn("Failed to resume C64 after write", {
                        error: resumeError instanceof Error ? {
                            name: resumeError.name,
                            message: resumeError.message,
                        } : { value: resumeError },
                    });
                }
            }
        }
    }
    catch (error) {
        if (error instanceof ToolError) {
            return toolErrorResult(error);
        }
        return unknownErrorResult(error);
    }
}
export const memoryOperationHandlers = {
    read: async (args, ctx) => executeReadMemory(stripOperationDiscriminator(args), ctx),
    write: async (args, ctx) => executeWriteMemory(stripOperationDiscriminator(args), ctx),
    read_screen: async (args, ctx) => executeReadScreen(stripOperationDiscriminator(args), ctx),
};
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
    workflowHints: [
        "Pair memory operations with documentation snippets so addresses and symbols stay meaningful to the user.",
        "Confirm intent before mutating RAM and explain how the change affects the running program.",
    ],
    tools: [
        {
            name: "read_screen",
            description: "Read the current text screen (40x25) and return its ASCII representation. For PETSCII details, see c64://specs/basic.",
            summary: "Fetches screen RAM, converts from PETSCII, and returns the printable output.",
            inputSchema: readScreenArgsSchema.jsonSchema,
            relatedResources: ["c64://context/bootstrap", "c64://specs/basic"],
            relatedPrompts: ["memory-debug", "basic-program", "assembly-program"],
            tags: ["screen", "memory"],
            prerequisites: [],
            examples: [
                {
                    name: "Capture screen",
                    description: "Read current 40x25 text",
                    arguments: {},
                },
            ],
            workflowHints: [
                "Call after running a program when the user asks to see what is on screen; echo the captured text back to them.",
            ],
            async execute(args, ctx) {
                return executeReadScreen(args, ctx);
            },
        },
        {
            name: "read",
            description: "Read a range of bytes from main memory and return the data as hexadecimal. Consult c64://specs/assembly and docs index.",
            summary: "Resolves symbols, reads memory, and returns a hex dump with addressing metadata.",
            inputSchema: readMemoryArgsSchema.jsonSchema,
            relatedResources: ["c64://context/bootstrap", "c64://specs/assembly", "c64://docs/index"],
            relatedPrompts: ["memory-debug", "assembly-program"],
            tags: ["memory", "hex"],
            prerequisites: ["pause"],
            examples: [
                {
                    name: "Read screen memory",
                    description: "Read 8 bytes at $0400",
                    arguments: { address: "$0400", length: 8 },
                },
            ],
            workflowHints: [
                "Resolve symbol names before calling so you can explain the chosen address in the response.",
                "Keep reads at or below 4096 bytes; split larger requests into multiple calls if needed.",
            ],
            async execute(args, ctx) {
                return executeReadMemory(args, ctx);
            },
        },
        {
            name: "write",
            description: "Write a hexadecimal byte sequence into main memory at the specified address. See c64://context/bootstrap for safety rules.",
            summary: "Resolves symbols, validates hex data, and writes bytes to RAM via Ultimate firmware.",
            inputSchema: writeMemoryArgsSchema.jsonSchema,
            relatedResources: ["c64://context/bootstrap", "c64://specs/assembly", "c64://docs/index"],
            relatedPrompts: ["memory-debug", "assembly-program"],
            tags: ["memory", "hex", "write"],
            prerequisites: ["pause", "read"],
            examples: [
                {
                    name: "Write to screen",
                    description: "Write $AA55 at $0400",
                    arguments: { address: "$0400", bytes: "$AA55" },
                },
            ],
            workflowHints: [
                "Double-check with the user before writing memory and describe the exact bytes you applied.",
                "Consider reading the region first so they can compare before and after states.",
            ],
            async execute(args, ctx) {
                return executeWriteMemory(args, ctx);
            },
        },
    ],
});
