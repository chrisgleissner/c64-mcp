import { objectSchema, stringSchema, numberSchema, optionalSchema, booleanSchema } from "../schema.js";
import { jsonResult } from "../responses.js";
import { ToolError, ToolExecutionError, ToolValidationError, toolErrorResult, unknownErrorResult } from "../errors.js";
import { promises as fs } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { createHash } from "node:crypto";
import { normalizeErrorDetails } from "./util.js";
function hexClean(input) {
    const trimmed = input.trim();
    const withoutPrefix = trimmed.startsWith("$") ? trimmed.slice(1) : trimmed;
    return withoutPrefix.replace(/[\s_]/g, "").toLowerCase();
}
function hexToBytes(input) {
    const cleaned = hexClean(input);
    if (cleaned.length === 0)
        return new Uint8Array();
    if (cleaned.length % 2 !== 0) {
        throw new ToolValidationError("Hex string must have an even number of characters", { path: "$.bytes" });
    }
    return Uint8Array.from(Buffer.from(cleaned, "hex"));
}
function bytesToHex(bytes) {
    return `$${Buffer.from(bytes).toString("hex").toUpperCase()}`;
}
function parseAddressNumeric(value) {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new ToolValidationError("Address must be a non-empty string", { path: "$.address" });
    }
    const lower = value.trim().toLowerCase();
    let radix = 10;
    let literal = lower;
    if (lower.startsWith("$")) {
        radix = 16;
        literal = lower.slice(1);
    }
    else if (lower.startsWith("0x")) {
        radix = 16;
        literal = lower.slice(2);
    }
    else if (lower.startsWith("%")) {
        radix = 2;
        literal = lower.slice(1);
    }
    const parsed = Number.parseInt(literal, radix);
    if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 0 || parsed > 0xFFFF) {
        throw new ToolValidationError("Invalid address value", { path: "$.address", details: { value } });
    }
    return parsed;
}
function formatAddressHex(address) {
    return address.toString(16).toUpperCase().padStart(4, "0");
}
const verifyAndWriteMemoryArgsSchema = objectSchema({
    description: "Pause → read → optional verify → write → read-back → resume.",
    properties: {
        address: stringSchema({ description: "Start address ($HHHH or decimal)", minLength: 1 }),
        bytes: stringSchema({ description: "Hex string of bytes to write, e.g. $AABBCC", minLength: 2, pattern: /^[\s_0-9A-Fa-f$]+$/ }),
        expected: optionalSchema(stringSchema({ description: "Expected pre-write bytes (hex)", minLength: 2, pattern: /^[\s_0-9A-Fa-f$]+$/ })),
        mask: optionalSchema(stringSchema({ description: "Verification mask bytes (hex)", minLength: 2, pattern: /^[\s_0-9A-Fa-f$]+$/ })),
        abortOnMismatch: optionalSchema(booleanSchema({ description: "Abort write when verification fails", default: true }), true),
    },
    required: ["address", "bytes"],
    additionalProperties: false,
});
const memoryDumpToFileArgsSchema = objectSchema({
    description: "Dump a memory range to a file in hex or binary, with optional pause/resume.",
    properties: {
        address: stringSchema({ description: "Start address ($HHHH or decimal)", minLength: 1 }),
        length: numberSchema({ description: "Number of bytes to dump", integer: true, minimum: 1, maximum: 65536 }),
        outputPath: stringSchema({ description: "Destination file path", minLength: 1 }),
        format: optionalSchema(stringSchema({ description: "Output format: hex|binary", enum: ["hex", "binary"], default: "hex" }), "hex"),
        chunkSize: optionalSchema(numberSchema({ description: "Chunk size for reads", integer: true, minimum: 1, maximum: 4096, default: 512 }), 512),
        pauseDuringRead: optionalSchema(booleanSchema({ description: "Pause/resume around dump", default: true }), true),
        retries: optionalSchema(numberSchema({ description: "Retries per chunk on failure", integer: true, minimum: 0, default: 1 }), 1),
    },
    required: ["address", "length", "outputPath"],
    additionalProperties: false,
});
export const tools = [
    {
        name: "verify_and_write_memory",
        description: "Pause → read → verify (optional) → write → read-back → resume. Aborts on mismatch unless override.",
        summary: "Safe memory write with pre/post verification and diff report.",
        inputSchema: verifyAndWriteMemoryArgsSchema.jsonSchema,
        tags: ["memory", "write", "verify"],
        examples: [
            { name: "Write bytes", description: "Verify then write two bytes", arguments: { address: "$0400", expected: "$0000", bytes: "$AA55" } },
        ],
        async execute(args, ctx) {
            try {
                const parsed = verifyAndWriteMemoryArgsSchema.parse(args ?? {});
                const writeBytes = hexToBytes(parsed.bytes);
                const expectedBytes = parsed.expected ? hexToBytes(parsed.expected) : new Uint8Array();
                const maskBytes = parsed.mask ? hexToBytes(parsed.mask) : undefined;
                const verifyLen = expectedBytes.length;
                const readLen = Math.max(writeBytes.length, verifyLen);
                const paused = await ctx.client.pause();
                if (!paused.success) {
                    throw new ToolExecutionError("C64 firmware reported failure while pausing", { details: normalizeErrorDetails(paused.details) });
                }
                let preReadHex;
                try {
                    const pre = await ctx.client.readMemory(parsed.address, String(Math.max(1, readLen)));
                    if (!pre.success) {
                        throw new ToolExecutionError("C64 firmware reported failure while reading memory", { details: normalizeErrorDetails(pre.details) });
                    }
                    preReadHex = pre.data ?? "$";
                    const preBytes = hexToBytes(preReadHex);
                    if (verifyLen > 0) {
                        const errors = [];
                        for (let i = 0; i < verifyLen; i += 1) {
                            const actual = preBytes[i] ?? 0x00;
                            const expected = expectedBytes[i] ?? 0x00;
                            const mask = maskBytes ? (maskBytes[i] ?? 0xFF) : 0xFF;
                            if ((actual & mask) !== (expected & mask)) {
                                errors.push({ offset: i, expected: `$${expected.toString(16).toUpperCase().padStart(2, "0")}`, actual: `$${actual.toString(16).toUpperCase().padStart(2, "0")}`, mask: maskBytes ? `$${(mask).toString(16).toUpperCase().padStart(2, "0")}` : undefined });
                            }
                        }
                        if (errors.length > 0 && (parsed.abortOnMismatch ?? true)) {
                            throw new ToolExecutionError("Verification failed before write", { details: { mismatches: errors, address: parsed.address } });
                        }
                    }
                    const write = await ctx.client.writeMemory(parsed.address, bytesToHex(writeBytes));
                    if (!write.success) {
                        throw new ToolExecutionError("C64 firmware reported failure while writing memory", { details: normalizeErrorDetails(write.details) });
                    }
                    const post = await ctx.client.readMemory(parsed.address, String(Math.max(1, writeBytes.length)));
                    if (!post.success) {
                        throw new ToolExecutionError("C64 firmware reported failure while reading back memory", { details: normalizeErrorDetails(post.details) });
                    }
                    const postBytes = hexToBytes(post.data ?? "$");
                    const diffs = [];
                    const preBytesAgain = hexToBytes(preReadHex ?? "$");
                    for (let i = 0; i < writeBytes.length; i += 1) {
                        const before = preBytesAgain[i] ?? 0x00;
                        const after = postBytes[i] ?? 0x00;
                        const exp = writeBytes[i] ?? 0x00;
                        if (after !== exp) {
                            diffs.push({ offset: i, before: `$${before.toString(16).toUpperCase().padStart(2, "0")}`, after: `$${after.toString(16).toUpperCase().padStart(2, "0")}`, expected: `$${exp.toString(16).toUpperCase().padStart(2, "0")}` });
                        }
                    }
                    if (diffs.length > 0) {
                        throw new ToolExecutionError("Post-write verification failed", { details: { address: parsed.address, diffs } });
                    }
                    return jsonResult({
                        address: parsed.address,
                        wrote: bytesToHex(writeBytes),
                        preRead: preReadHex,
                        postRead: post.data ?? "",
                    }, { success: true });
                }
                finally {
                    await ctx.client.resume();
                }
            }
            catch (error) {
                if (error instanceof ToolError)
                    return toolErrorResult(error);
                return unknownErrorResult(error);
            }
        },
    },
    {
        name: "memory_dump_to_file",
        description: "Chunked memory dump with retries; optional pause/resume; writes hex or binary and a manifest.",
        summary: "Safe large-range memory dump to disk with checksum.",
        inputSchema: memoryDumpToFileArgsSchema.jsonSchema,
        tags: ["memory", "dump", "file"],
        async execute(args, ctx) {
            try {
                const parsed = memoryDumpToFileArgsSchema.parse(args ?? {});
                const startAddr = parseAddressNumeric(parsed.address);
                const length = parsed.length;
                const chunk = Math.min(Math.max(1, parsed.chunkSize ?? 512), 4096);
                const pause = parsed.pauseDuringRead !== false;
                const outputPath = resolvePath(String(parsed.outputPath));
                const outDir = dirname(outputPath);
                await fs.mkdir(outDir, { recursive: true });
                if (pause) {
                    const res = await ctx.client.pause();
                    if (!res.success) {
                        throw new ToolExecutionError("Pause failed before dump", { details: normalizeErrorDetails(res.details) });
                    }
                }
                const buf = Buffer.allocUnsafe(length);
                let offset = 0;
                try {
                    while (offset < length) {
                        const remaining = length - offset;
                        const take = Math.min(chunk, remaining);
                        const addr = (startAddr + offset) & 0xFFFF;
                        if (addr + take > 0x10000) {
                            throw new ToolExecutionError("Dump would wrap past end of address space", { details: { address: `$${formatAddressHex(addr)}`, remaining: take } });
                        }
                        let attempts = 0;
                        let success = false;
                        let lastErr = null;
                        while (!success && attempts <= (parsed.retries ?? 1)) {
                            attempts += 1;
                            try {
                                const r = await ctx.client.readMemory(`$${formatAddressHex(addr)}`, String(take));
                                if (!r.success || typeof r.data !== "string") {
                                    throw new ToolExecutionError("Firmware returned failure for chunk", { details: normalizeErrorDetails(r.details) });
                                }
                                const bytes = hexToBytes(r.data);
                                Buffer.from(bytes).copy(buf, offset, 0, take);
                                success = true;
                            }
                            catch (e) {
                                lastErr = e;
                                if (attempts > (parsed.retries ?? 1)) {
                                    throw e;
                                }
                            }
                        }
                        if (!success) {
                            throw lastErr ?? new Error("Unknown failure while dumping memory");
                        }
                        offset += take;
                    }
                    if (String(parsed.format).toLowerCase() === "binary") {
                        await fs.writeFile(outputPath, buf);
                    }
                    else {
                        const hex = Buffer.from(buf).toString("hex").toUpperCase();
                        await fs.writeFile(outputPath, hex, "utf8");
                    }
                    const checksum = createHash("sha256").update(buf).digest("hex").toUpperCase();
                    const manifest = {
                        address: `$${formatAddressHex(startAddr)}`,
                        length,
                        chunkSize: chunk,
                        format: (parsed.format ?? "hex").toString().toLowerCase(),
                        checksum,
                        outputPath,
                        createdAt: new Date().toISOString(),
                    };
                    await fs.writeFile(`${outputPath}.json`, JSON.stringify(manifest, null, 2), "utf8");
                    return jsonResult({ manifest }, { success: true });
                }
                finally {
                    if (pause) {
                        await ctx.client.resume();
                    }
                }
            }
            catch (error) {
                if (error instanceof ToolError)
                    return toolErrorResult(error);
                return unknownErrorResult(error);
            }
        },
    },
];
