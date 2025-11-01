/*
 * sidplayfp Runner Utility for converting SID files to WAV output.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
export class SidplayExecutionError extends Error {
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
        this.name = "SidplayExecutionError";
        this.command = options.command;
        this.exitCode = options.exitCode;
        this.stderrFirst = first;
        this.stderrLast = last;
        this.wavExists = options.wavExists;
        this.wavSize = options.wavSize;
    }
}
function resolveMode(input) {
    const envMode = (process.env.SIDPLAY_MODE || "").toLowerCase();
    const raw = (input || envMode || "ntsc").toLowerCase();
    return raw === "pal" ? "pal" : "ntsc";
}
function resolveLimitCycles(input) {
    const fromEnv = Number(process.env.SIDPLAY_LIMIT_CYCLES);
    if (Number.isFinite(fromEnv) && fromEnv > 0)
        return Math.floor(fromEnv);
    if (typeof input === "number" && input > 0)
        return Math.floor(input);
    return 120000000;
}
function resolveBinary(input) {
    return process.env.SIDPLAY_BINARY || process.env.SIDPLAYFP_BINARY || input || "sidplayfp";
}
function which(binary) {
    const hasSep = binary.includes("/") || binary.includes("\\");
    const pathExts = process.platform === "win32"
        ? (process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";").map((ext) => ext.startsWith(".") ? ext : `.${ext}`)
        : [""];
    const tryResolve = (base) => {
        for (const ext of pathExts) {
            const candidate = ext ? `${base}${ext}` : base;
            try {
                if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
                    return candidate;
                }
            }
            catch { }
        }
        return null;
    };
    if (hasSep) {
        return tryResolve(binary);
    }
    const envPath = process.env.PATH || "";
    for (const dir of envPath.split(path.delimiter)) {
        if (!dir)
            continue;
        const resolved = tryResolve(path.join(dir, binary));
        if (resolved)
            return resolved;
    }
    return null;
}
function ensureParentDir(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir))
        fs.mkdirSync(dir, { recursive: true });
}
const PAL_CLOCK = 985248;
const NTSC_CLOCK = 1022727;
function cyclesToSeconds(cycles, mode) {
    const clock = mode === "pal" ? PAL_CLOCK : NTSC_CLOCK;
    return Math.max(1, Math.ceil(cycles / clock));
}
function buildSidplayArgs(params, seconds) {
    const args = [];
    if (params.mode === "pal") {
        args.push("-vp");
    }
    else {
        args.push("-vn");
    }
    args.push("-f44100");
    args.push("-p16");
    args.push(`-t${seconds}`);
    args.push(`-w${params.wavPath}`);
    if (typeof params.tune === "number" && Number.isFinite(params.tune)) {
        const tuneIdx = Math.max(1, Math.floor(params.tune));
        args.push(`-o${tuneIdx}`);
    }
    args.push(params.sidPath);
    return args;
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
function quoteArg(a) {
    if (/^[A-Za-z0-9_\-\.\/]+$/.test(a))
        return a;
    return `'${a.replace(/'/g, "'\\''")}'`;
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
    const binaryPath = which(full.binary);
    if (!binaryPath) {
        const installHint = `sidplayfp not found. Install via e.g. \n` +
            `  sudo apt-get install sidplayfp\n` +
            `  brew install sidplayfp\n` +
            `  choco install sidplayfp\n`;
        const msg = Buffer.from(`${full.binary} not found in PATH.\n${installHint}`);
        throw new SidplayExecutionError({
            message: "sidplayfp binary is not installed",
            command: full.binary,
            exitCode: 127,
            stderr: msg,
            wavExists: false,
            wavSize: 0,
        });
    }
    const seconds = cyclesToSeconds(full.limitCycles, full.mode);
    const args = buildSidplayArgs(full, seconds);
    const display = [binaryPath, ...args.map(quoteArg)].join(" ");
    const stdoutChunks = [];
    const stderrChunks = [];
    const exitCode = await new Promise((resolve) => {
        const child = spawn(binaryPath, args, { stdio: ["ignore", "pipe", "pipe"] });
        child.stdout?.on("data", (c) => stdoutChunks.push(Buffer.from(c)));
        child.stderr?.on("data", (c) => stderrChunks.push(Buffer.from(c)));
        child.on("error", (err) => {
            const enoent = (err && typeof err === "object" && "code" in err && err.code === "ENOENT");
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
        throw new SidplayExecutionError({
            message: "sidplayfp failed (non-zero exit code)",
            command: display,
            exitCode,
            stderr: stderrBuf,
            wavExists,
            wavSize,
        });
    }
    if (!wavExists || wavSize === 0) {
        throw new SidplayExecutionError({
            message: "sidplayfp did not produce a WAV file",
            command: display,
            exitCode,
            stderr: stderrBuf,
            wavExists,
            wavSize,
        });
    }
    const header = fs.readFileSync(full.wavPath);
    const info = parseWavHeader(header);
    if (info.audioFormat !== 1 || info.sampleRate !== 44100 || info.bitsPerSample !== 16) {
        throw new SidplayExecutionError({
            message: `Unexpected WAV format (expected PCM 16-bit @ 44100 Hz); got format=${info.audioFormat}, bits=${info.bitsPerSample}, rate=${info.sampleRate}`,
            command: display,
            exitCode,
            stderr: stderrBuf,
            wavExists,
            wavSize,
        });
    }
    return {
        command: display,
        exitCode: exitCode ?? 0,
        stdout,
        stderr,
        wavPath: full.wavPath,
        wavInfo: info,
    };
}
