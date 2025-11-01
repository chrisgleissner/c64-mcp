/*
 * VICE Runner Utility (x64sc) with optional xvfb-run wrapper for headless CI
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
export class ViceExecutionError extends Error {
    constructor(options) {
        const first = options.stderr.subarray(0, 1000).toString("utf8");
        const last = options.stderr.length > 1000
            ? options.stderr.subarray(options.stderr.length - 1000).toString("utf8")
            : "";
        super(`${options.message}\n` +
            `command: ${options.command}\n` +
            `exitCode: ${String(options.exitCode)}\n` +
            `stderr(first 1000):\n${first}\n` +
            (last ? `stderr(last 1000):\n${last}\n` : "") +
            `wav: exists=${options.wavExists}, size=${options.wavSize}`);
        this.name = "ViceExecutionError";
        this.command = options.command;
        this.exitCode = options.exitCode;
        this.stderrFirst = first;
        this.stderrLast = last;
        this.wavExists = options.wavExists;
        this.wavSize = options.wavSize;
    }
}
function resolveMode(input) {
    const envMode = (process.env.VICE_MODE || "").toLowerCase();
    const raw = (input || envMode || "ntsc").toLowerCase();
    return raw === "pal" ? "pal" : "ntsc";
}
function resolveLimitCycles(input) {
    const fromEnv = Number(process.env.VICE_LIMIT_CYCLES);
    if (Number.isFinite(fromEnv) && fromEnv > 0)
        return Math.floor(fromEnv);
    if (typeof input === "number" && input > 0)
        return Math.floor(input);
    return 120000000;
}
function resolveBinary(input) {
    return process.env.VICE_BINARY || input || "x64sc";
}
function which(binary) {
    const hasSep = binary.includes("/") || binary.includes("\\");
    if (hasSep) {
        try {
            if (fs.existsSync(binary))
                return binary;
        }
        catch { }
        return null;
    }
    const envPath = process.env.PATH || "";
    for (const dir of envPath.split(path.delimiter)) {
        if (!dir)
            continue;
        const candidate = path.join(dir, binary);
        try {
            if (fs.existsSync(candidate))
                return candidate;
        }
        catch { }
    }
    return null;
}
function shouldUseXvfb() {
    if (process.env.FORCE_XVFB === "1")
        return true;
    const ciValue = (process.env.CI || "").toLowerCase();
    return ciValue === "true" || ciValue === "1" || ciValue === "yes";
}
function ensureParentDir(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
}
function buildViceArgs(params) {
    const args = [
        `-${params.mode}`,
        "-sounddev", "wav",
        "-soundarg", `output=${params.wavPath}`,
        "-soundarg", "bits=16",
        "-soundrate", "44100",
        "-soundvol", "100",
        "-limitcycles", String(params.limitCycles),
    ];
    if (typeof params.tune === "number" && Number.isFinite(params.tune)) {
        args.push("-tune", String(Math.floor(params.tune)));
    }
    args.push(params.sidPath);
    return args;
}
function buildCommand(binary, args) {
    const useXvfb = shouldUseXvfb();
    if (useXvfb) {
        const file = "xvfb-run";
        const wrappedArgs = ["-a", binary, ...args];
        const display = [file, ...wrappedArgs.map(quoteArg)].join(" ");
        return { file, args: wrappedArgs, display };
    }
    const display = [binary, ...args.map(quoteArg)].join(" ");
    return { file: binary, args, display };
}
function quoteArg(a) {
    if (/^[A-Za-z0-9_\-\.\/]+$/.test(a))
        return a;
    return `'${a.replace(/'/g, "'\\''")}'`;
}
function parseWavHeader(buffer) {
    if (buffer.length < 44)
        throw new Error("WAV too small");
    if (buffer.toString("ascii", 0, 4) !== "RIFF")
        throw new Error("WAV missing RIFF header");
    if (buffer.toString("ascii", 8, 12) !== "WAVE")
        throw new Error("WAV missing WAVE header");
    let offset = 12;
    let fmt = null;
    let dataBytes = 0;
    while (offset + 8 <= buffer.length) {
        const id = buffer.toString("ascii", offset, offset + 4);
        const size = buffer.readUInt32LE(offset + 4);
        offset += 8;
        if (id === "fmt ") {
            const audioFormat = buffer.readUInt16LE(offset + 0);
            const numChannels = buffer.readUInt16LE(offset + 2);
            const sampleRate = buffer.readUInt32LE(offset + 4);
            const bitsPerSample = buffer.readUInt16LE(offset + 14);
            fmt = { audioFormat, numChannels, sampleRate, bitsPerSample, dataBytes: 0 };
        }
        else if (id === "data") {
            dataBytes = size;
        }
        offset += size;
    }
    if (!fmt)
        throw new Error("WAV missing fmt chunk");
    if (dataBytes <= 0)
        throw new Error("WAV missing data chunk");
    fmt.dataBytes = dataBytes;
    return fmt;
}
export async function runSidToWav(params) {
    const mode = resolveMode(params.mode);
    const limitCycles = resolveLimitCycles(params.limitCycles);
    const binary = resolveBinary(params.binary);
    if (!params.sidPath)
        throw new Error("sidPath is required");
    if (!params.wavPath)
        throw new Error("wavPath is required");
    if (!fs.existsSync(params.sidPath))
        throw new Error(`SID not found: ${params.sidPath}`);
    ensureParentDir(params.wavPath);
    const full = {
        sidPath: params.sidPath,
        wavPath: params.wavPath,
        mode,
        limitCycles,
        tune: typeof params.tune === "number" ? params.tune : undefined,
        binary,
    };
    // Validate binary availability to produce clearer 127 semantics even when wrapped by xvfb-run
    const binaryPath = which(full.binary);
    if (!binaryPath) {
        const msg = Buffer.from(`${full.binary} not found in PATH`);
        throw new ViceExecutionError({
            message: "VICE binary is not installed",
            command: full.binary,
            exitCode: 127,
            stderr: msg,
            wavExists: false,
            wavSize: 0,
        });
    }
    const args = buildViceArgs({ ...full });
    const cmd = buildCommand(binaryPath, args);
    const stdoutChunks = [];
    const stderrChunks = [];
    const exitCode = await new Promise((resolve) => {
        const child = spawn(cmd.file, cmd.args, { stdio: ["ignore", "pipe", "pipe"] });
        child.stdout?.on("data", (c) => stdoutChunks.push(Buffer.from(c)));
        child.stderr?.on("data", (c) => stderrChunks.push(Buffer.from(c)));
        child.on("error", (err) => {
            // Map ENOENT to 127-like semantics
            const enoent = (err && typeof err === "object" && "code" in err && err.code === "ENOENT");
            // Push a hint into stderr buffer
            const hint = Buffer.from(String(err?.message || err || "spawn error"));
            stderrChunks.push(hint);
            resolve(enoent ? 127 : 1);
        });
        child.on("close", (code) => resolve(code ?? 1));
    });
    const stdout = Buffer.concat(stdoutChunks).toString("utf8");
    const stderrBuf = Buffer.concat(stderrChunks);
    const stderr = stderrBuf.toString("utf8");
    const wavExists = fs.existsSync(full.wavPath);
    const wavStat = wavExists ? fs.statSync(full.wavPath) : null;
    const wavSize = wavStat?.size ?? 0;
    if (exitCode !== 0) {
        throw new ViceExecutionError({
            message: "VICE failed (non-zero exit code)",
            command: cmd.display,
            exitCode,
            stderr: stderrBuf,
            wavExists,
            wavSize,
        });
    }
    if (!wavExists || wavSize === 0) {
        throw new ViceExecutionError({
            message: "VICE did not produce a WAV file",
            command: cmd.display,
            exitCode,
            stderr: stderrBuf,
            wavExists,
            wavSize,
        });
    }
    const header = fs.readFileSync(full.wavPath);
    const info = parseWavHeader(header);
    if (info.audioFormat !== 1 || info.sampleRate !== 44100 || info.bitsPerSample !== 16) {
        throw new ViceExecutionError({
            message: `Unexpected WAV format (expected PCM 16-bit @ 44100 Hz); got format=${info.audioFormat}, bits=${info.bitsPerSample}, rate=${info.sampleRate}`,
            command: cmd.display,
            exitCode,
            stderr: stderrBuf,
            wavExists,
            wavSize,
        });
    }
    return {
        command: cmd.display,
        exitCode: exitCode ?? 0,
        stdout,
        stderr,
        wavPath: full.wavPath,
        wavInfo: info,
    };
}
