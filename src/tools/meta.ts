import { defineToolModule } from "./types.js";
import { arraySchema, booleanSchema, numberSchema, objectSchema, optionalSchema, stringSchema } from "./schema.js";
import { jsonResult } from "./responses.js";
import { ToolError, ToolExecutionError, ToolValidationError, toolErrorResult, unknownErrorResult } from "./errors.js";
import { promises as fs } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { createHash } from "node:crypto";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toRecord(details: unknown): Record<string, unknown> | undefined {
  if (details && typeof details === "object") {
    return details as Record<string, unknown>;
  }
  return undefined;
}

function normalizeErrorDetails(details: unknown): Record<string, unknown> | undefined {
  if (details === undefined || details === null) return undefined;
  if (typeof details === "object") return details as Record<string, unknown>;
  return { value: details };
}

function hexClean(input: string): string {
  const trimmed = input.trim();
  const withoutPrefix = trimmed.startsWith("$") ? trimmed.slice(1) : trimmed;
  return withoutPrefix.replace(/[\s_]/g, "").toLowerCase();
}

function hexToBytes(input: string): Uint8Array {
  const cleaned = hexClean(input);
  if (cleaned.length === 0) return new Uint8Array();
  if (cleaned.length % 2 !== 0) {
    throw new ToolValidationError("Hex string must have an even number of characters", { path: "$.bytes" });
  }
  return Uint8Array.from(Buffer.from(cleaned, "hex"));
}

function bytesToHex(bytes: Uint8Array): string {
  return `$${Buffer.from(bytes).toString("hex").toUpperCase()}`;
}

function parseAddressNumeric(value: string): number {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ToolValidationError("Address must be a non-empty string", { path: "$.address" });
  }
  const lower = value.trim().toLowerCase();
  let radix = 10;
  let literal = lower;
  if (lower.startsWith("$")) { radix = 16; literal = lower.slice(1); }
  else if (lower.startsWith("0x")) { radix = 16; literal = lower.slice(2); }
  else if (lower.startsWith("%")) { radix = 2; literal = lower.slice(1); }
  const parsed = Number.parseInt(literal, radix);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 0 || parsed > 0xFFFF) {
    throw new ToolValidationError("Invalid address value", { path: "$.address", details: { value } });
  }
  return parsed;
}

function formatAddressHex(address: number): string {
  return address.toString(16).toUpperCase().padStart(4, "0");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Persistent background task registry

type TaskStatus = "running" | "completed" | "stopped" | "error";
interface BackgroundTask {
  id: string; // e.g. 0001_read_memory
  name: string;
  type: "background";
  operation: string;
  args: Record<string, unknown>;
  intervalMs: number;
  maxIterations?: number;
  iterations: number;
  status: TaskStatus;
  startedAt: Date;
  updatedAt: Date;
  stoppedAt?: Date | null;
  lastError?: string | null;
  nextRunAt?: Date | null;
  folder: string; // e.g. tasks/background/0001_read_memory
  _timer?: NodeJS.Timeout | null; // transient, not persisted
}

const TASKS: Map<string, BackgroundTask> = new Map();

import os from "node:os";
import { join as joinPath } from "node:path";
import { addMilliseconds } from "date-fns";

function formatTimestampSpec(date: Date = new Date()): string {
  const iso = date.toISOString(); // YYYY-MM-DDTHH:MM:SS.mmmZ
  const noMs = iso.replace(/\.\d{3}Z$/, "Z");
  return noMs.replace(/:/g, "-"); // YYYY-MM-DDTHH-MM-SSZ
}

function parseTimestampSpec(s: string | null | undefined): Date | null {
  if (!s) return null;
  const normalized = s.replace(/T(\d{2})-(\d{2})-(\d{2})Z$/, "T$1:$2:$3Z");
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

type PersistedTask = {
  id: string;
  name: string;
  type: "background";
  operation: string;
  args: Record<string, unknown>;
  intervalMs: number;
  maxIterations?: number;
  iterations: number;
  status: TaskStatus;
  startedAt: string;
  updatedAt: string;
  stoppedAt?: string | null;
  lastError?: string | null;
  nextRunAt?: string | null;
  folder: string;
};

function toPersistedTask(t: BackgroundTask): PersistedTask {
  return {
    id: t.id,
    name: t.name,
    type: t.type,
    operation: t.operation,
    args: t.args,
    intervalMs: t.intervalMs,
    maxIterations: t.maxIterations,
    iterations: t.iterations,
    status: t.status,
    startedAt: formatTimestampSpec(t.startedAt),
    updatedAt: formatTimestampSpec(t.updatedAt),
    stoppedAt: t.stoppedAt ? formatTimestampSpec(t.stoppedAt) : null,
    lastError: t.lastError ?? null,
    nextRunAt: t.nextRunAt ? formatTimestampSpec(t.nextRunAt) : null,
    folder: t.folder,
  };
}

function fromPersistedTask(p: PersistedTask): BackgroundTask {
  return {
    id: p.id,
    name: p.name,
    type: "background",
    operation: p.operation,
    args: p.args ?? {},
    intervalMs: p.intervalMs,
    maxIterations: p.maxIterations,
    iterations: p.iterations,
    status: p.status,
    startedAt: parseTimestampSpec(p.startedAt) ?? new Date(),
    updatedAt: parseTimestampSpec(p.updatedAt) ?? new Date(),
    stoppedAt: parseTimestampSpec(p.stoppedAt ?? null),
    lastError: p.lastError ?? null,
    nextRunAt: parseTimestampSpec(p.nextRunAt ?? null),
    folder: p.folder,
    _timer: null,
  };
}

function getTasksHomeDir(): string {
  const overrideFile = process.env.C64_TASK_STATE_FILE ? resolvePath(String(process.env.C64_TASK_STATE_FILE)) : null;
  if (overrideFile) {
    return dirname(overrideFile);
  }
  return resolvePath(joinPath(os.homedir(), ".c64bridge"));
}

function getTaskStateFilePath(): string {
  const override = process.env.C64_TASK_STATE_FILE;
  if (override) return resolvePath(String(override));
  return resolvePath(joinPath(getTasksHomeDir(), "tasks.json"));
}

function getBackgroundTaskFolderRelative(id: string): string {
  return `tasks/background/${id}`;
}

function getBackgroundTaskFolderAbsolute(id: string): string {
  return resolvePath(joinPath(getTasksHomeDir(), getBackgroundTaskFolderRelative(id)));
}
let TASKS_LOADED = false;

async function ensureTasksLoaded(): Promise<void> {
  if (TASKS_LOADED) return;
  TASKS_LOADED = true;
  try {
    const text = await fs.readFile(getTaskStateFilePath(), "utf8");
    const parsed = JSON.parse(text);
    if (parsed && Array.isArray(parsed.tasks)) {
      for (const pt of parsed.tasks as PersistedTask[]) {
        const t = fromPersistedTask(pt);
        TASKS.set(t.name, t);
      }
    }
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      const path = getTaskStateFilePath();
      await fs.mkdir(dirname(path), { recursive: true });
      await fs.writeFile(path, JSON.stringify({ tasks: [] }, null, 2), "utf8");
    }
  }
}

async function writeTaskJson(task: BackgroundTask): Promise<void> {
  const folderAbs = getBackgroundTaskFolderAbsolute(task.id);
  const resultRelative = `${task.folder}/result.json`;
  const pt = toPersistedTask(task);
  const data = { ...pt, resultPath: resultRelative } as const;
  await fs.mkdir(folderAbs, { recursive: true });
  await fs.writeFile(resolvePath(folderAbs, "task.json"), JSON.stringify(data, null, 2), "utf8");
}

async function ensureResultAndLog(task: BackgroundTask): Promise<void> {
  const folderAbs = getBackgroundTaskFolderAbsolute(task.id);
  await fs.mkdir(folderAbs, { recursive: true });
  const resultPath = resolvePath(folderAbs, "result.json");
  const logPath = resolvePath(folderAbs, "log.txt");
  try {
    await fs.access(resultPath);
  } catch {
    const initial = {
      id: task.id,
      type: "task",
      name: task.operation,
      created: formatTimestampSpec(task.startedAt),
      status: task.status,
      iterations: task.iterations,
    } as Record<string, unknown>;
    await fs.writeFile(resultPath, JSON.stringify(initial, null, 2), "utf8");
  }
  try {
    await fs.access(logPath);
  } catch {
    await fs.writeFile(logPath, "", "utf8");
  }
}

async function appendTaskLog(task: BackgroundTask, message: string): Promise<void> {
  const logPath = resolvePath(getBackgroundTaskFolderAbsolute(task.id), "log.txt");
  const ts = formatTimestampSpec(task.updatedAt ?? task.startedAt ?? new Date());
  await fs.appendFile(logPath, `[${ts}] ${message}\n`, "utf8");
}

async function persistTasks(): Promise<void> {
  try {
    const path = getTaskStateFilePath();
    await fs.mkdir(dirname(path), { recursive: true });
    const data = Array.from(TASKS.values()).map((t) => toPersistedTask(t));
    await fs.writeFile(path, JSON.stringify({ tasks: data }, null, 2), "utf8");
    // Keep per-task files up to date
    for (const t of TASKS.values()) {
      await writeTaskJson(t);
      await ensureResultAndLog(t);
    }
  } catch {
    // ignore
  }
}

function runOperation(op: string, args: Record<string, unknown>, ctx: Parameters<typeof metaModule.invoke>[2]) {
  switch (op) {
    case "read_memory": {
      const address = String((args as any).address ?? "$0400");
      const length = String((args as any).length ?? "16");
      return ctx.client.readMemory(address, length);
    }
    case "read_screen": {
      return ctx.client.readScreen();
    }
    case "menu_button": {
      return ctx.client.menuButton();
    }
    default:
      return Promise.resolve({ success: true });
  }
}

function scheduleNextRun(task: BackgroundTask, ctx: Parameters<typeof metaModule.invoke>[2]): void {
  if (task.status !== "running") return;
  const delay = Math.max(0, task.intervalMs);
  task.nextRunAt = addMilliseconds(new Date(), delay);
  task._timer = setTimeout(async () => {
    if (task.status !== "running") return;
    try {
      await runOperation(task.operation, task.args, ctx);
      task.iterations += 1;
      task.updatedAt = new Date();
      if (task.maxIterations && task.iterations >= task.maxIterations) {
        task.status = "completed";
        task.stoppedAt = new Date();
        task._timer = null;
        await appendTaskLog(task, `completed iterations=${task.iterations}`);
        await persistTasks();
        return;
      }
      await appendTaskLog(task, `iteration=${task.iterations}`);
      await persistTasks();
      scheduleNextRun(task, ctx);
    } catch (err) {
      task.status = "error";
      task.lastError = err instanceof Error ? err.message : String(err);
      task.stoppedAt = new Date();
      task._timer = null;
      await appendTaskLog(task, `error: ${task.lastError}`);
      await persistTasks();
    }
  }, delay);
}

function stopTask(task: BackgroundTask): void {
  if (task._timer) {
    clearTimeout(task._timer);
  }
  task._timer = null;
  task.status = task.status === "completed" ? task.status : "stopped";
  task.stoppedAt = new Date();
}

const noArgsSchema = objectSchema<Record<string, never>>({ description: "No arguments", properties: {}, additionalProperties: false });

const waitForScreenTextArgsSchema = objectSchema({
  description: "Poll screen until text or regex matches, or timeout elapses.",
  properties: {
    pattern: stringSchema({ description: "Substring or regex to find", minLength: 1 }),
    isRegex: optionalSchema(booleanSchema({ description: "Interpret pattern as regular expression", default: false }), false),
    caseInsensitive: optionalSchema(booleanSchema({ description: "Case-insensitive search", default: true }), true),
    timeoutMs: optionalSchema(numberSchema({ description: "Overall timeout in milliseconds", integer: true, minimum: 1, default: 3000 }), 3000),
    intervalMs: optionalSchema(numberSchema({ description: "Poll interval in milliseconds", integer: true, minimum: 1, default: 100 }), 100),
  },
  required: ["pattern"],
  additionalProperties: false,
});

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

const startBackgroundTaskArgsSchema = objectSchema({
  description: "Start a named background task that invokes a simple operation at fixed intervals.",
  properties: {
    name: stringSchema({ description: "Unique task name", minLength: 1 }),
    operation: stringSchema({ description: "Operation name (e.g., read_memory, read_screen)", minLength: 1 }),
    arguments: optionalSchema(objectSchema({ description: "Operation-specific arguments", properties: {}, additionalProperties: true }), {} as any),
    intervalMs: optionalSchema(numberSchema({ description: "Interval milliseconds", integer: true, minimum: 1, default: 1000 }), 1000),
    maxIterations: optionalSchema(numberSchema({ description: "Maximum number of iterations (omit for indefinite)", integer: true, minimum: 1 }), undefined),
  },
  required: ["name", "operation"],
  additionalProperties: false,
});

const stopBackgroundTaskArgsSchema = objectSchema({
  description: "Stop a background task by name.",
  properties: { name: stringSchema({ description: "Task name", minLength: 1 }) },
  required: ["name"],
  additionalProperties: false,
});

const listBackgroundTasksArgsSchema = noArgsSchema;
const stopAllBackgroundTasksArgsSchema = noArgsSchema;

const findPathsByNameArgsSchema = objectSchema({
  description: "Find device paths with names containing a substring. Uses firmware wildcard file info.",
  properties: {
    root: optionalSchema(stringSchema({ description: "Root path to search (host)" }), "/"),
    nameContains: stringSchema({ description: "Substring to match", minLength: 1 }),
    extensions: optionalSchema(arraySchema(stringSchema({ description: "Extension filter without dot", minLength: 1 }))),
    maxResults: optionalSchema(numberSchema({ description: "Maximum results", integer: true, minimum: 1, default: 50 }), 50),
    caseInsensitive: optionalSchema(booleanSchema({ description: "Case-insensitive name match", default: true }), true),
  },
  required: ["nameContains"],
  additionalProperties: false,
});

const memoryDumpToFileArgsSchema = objectSchema({
  description: "Dump a memory range to a file in hex or binary, with optional pause/resume.",
  properties: {
    address: stringSchema({ description: "Start address ($HHHH or decimal)", minLength: 1 }),
    length: numberSchema({ description: "Number of bytes to dump", integer: true, minimum: 1, maximum: 65536 }),
    outputPath: stringSchema({ description: "Destination file path", minLength: 1 }),
    format: optionalSchema(stringSchema({ description: "Output format: hex|binary", enum: ["hex", "binary"], default: "hex" as any }), "hex" as any),
    chunkSize: optionalSchema(numberSchema({ description: "Chunk size for reads", integer: true, minimum: 1, maximum: 4096, default: 512 }), 512),
    pauseDuringRead: optionalSchema(booleanSchema({ description: "Pause/resume around dump", default: true }), true),
    retries: optionalSchema(numberSchema({ description: "Retries per chunk on failure", integer: true, minimum: 0, default: 1 }), 1),
  },
  required: ["address", "length", "outputPath"],
  additionalProperties: false,
});

const configSnapshotAndRestoreArgsSchema = objectSchema({
  description: "Snapshot or restore full device configuration. Snapshot writes versioned JSON.",
  properties: {
    action: stringSchema({ description: "One of: snapshot|restore|diff", enum: ["snapshot", "restore", "diff"] }),
    path: stringSchema({ description: "Snapshot file path", minLength: 1 }),
    applyToFlash: optionalSchema(booleanSchema({ description: "Save configuration to flash after restore", default: false }), false),
  },
  required: ["action", "path"],
  additionalProperties: false,
});

export const metaModule = defineToolModule({
  domain: "meta",
  summary: "High-level meta tools that orchestrate multiple MCP actions.",
  resources: ["c64://context/bootstrap", "c64://specs/assembly"],
  defaultTags: ["meta", "orchestration"],
  workflowHints: [
    "Use meta tools to reduce round-trips by composing several steps into one.",
  ],
  tools: [
    {
      name: "firmware_info_and_healthcheck",
      description: "Fetch firmware version and info, probe zero-page read, and return readiness with latencies.",
      summary: "Returns a structured readiness report and endpoint latencies.",
      inputSchema: noArgsSchema.jsonSchema,
      tags: ["diagnostics"],
      examples: [{ name: "Healthcheck", description: "Basic firmware readiness", arguments: {} }],
      async execute(args, ctx) {
        try {
          noArgsSchema.parse(args ?? {});
          const started = Date.now();
          const steps: Array<{ name: string; started: number; ended?: number; ok?: boolean; error?: unknown }> = [
            { name: "version", started: Date.now() },
            { name: "info", started: 0 },
            { name: "readmem", started: 0 },
          ];

          let version: unknown = null;
          try {
            steps[0]!.started = Date.now();
            version = await (ctx.client as any).version();
            steps[0]!.ok = true; steps[0]!.ended = Date.now();
          } catch (e) { steps[0]!.ok = false; steps[0]!.ended = Date.now(); steps[0]!.error = e; }

          let info: unknown = null;
          try {
            steps[1]!.started = Date.now();
            info = await (ctx.client as any).info();
            steps[1]!.ok = true; steps[1]!.ended = Date.now();
          } catch (e) { steps[1]!.ok = false; steps[1]!.ended = Date.now(); steps[1]!.error = e; }

          let readmem: unknown = null;
          try {
            steps[2]!.started = Date.now();
            readmem = await (ctx.client as any).readMemory("$0000", "1");
            steps[2]!.ok = (readmem as any)?.success !== false; steps[2]!.ended = Date.now();
          } catch (e) { steps[2]!.ok = false; steps[2]!.ended = Date.now(); steps[2]!.error = e; }

          const ended = Date.now();
          const report = {
            isHealthy: steps.every((s) => s.ok),
            totalLatencyMs: ended - started,
            steps: steps.map((s) => ({ name: s.name, latencyMs: (s.ended ?? Date.now()) - s.started, ok: s.ok, error: s.ok ? undefined : (s.error instanceof Error ? s.error.message : String(s.error)) })),
            version,
            info,
          };
          return jsonResult(report, { success: report.isHealthy });
        } catch (error) {
          if (error instanceof ToolError) return toolErrorResult(error);
          return unknownErrorResult(error);
        }
      },
    },
    {
      name: "wait_for_screen_text",
      description: "Poll screen until a regex or substring matches, within a timeout.",
      summary: "Screen poll with regex/text match and timing.",
      inputSchema: waitForScreenTextArgsSchema.jsonSchema,
      tags: ["screen", "assert"],
      examples: [{ name: "Wait for READY.", description: "Find boot prompt", arguments: { pattern: "READY.", isRegex: false, timeoutMs: 1000, intervalMs: 50 } }],
      async execute(args, ctx) {
        try {
          const parsed = waitForScreenTextArgsSchema.parse(args ?? {});
          const start = Date.now();
          const flags = parsed.caseInsensitive ? "i" : undefined;
          const regex = parsed.isRegex
            ? new RegExp(parsed.pattern, flags)
            : new RegExp(escapeRegex(parsed.pattern), flags);

          while (Date.now() - start < (parsed.timeoutMs ?? 3000)) {
            const screen = await (ctx.client as any).readScreen();
            const match = screen.match(regex);
            if (match && match.index !== undefined) {
              return jsonResult({
                matched: true,
                match: {
                  index: match.index,
                  length: match[0]?.length ?? 0,
                  text: match[0] ?? "",
                },
                elapsedMs: Date.now() - start,
              }, { success: true });
            }
            await sleep(Math.max(1, parsed.intervalMs ?? 100));
          }
          throw new ToolExecutionError("Timeout waiting for screen text", { details: { pattern: parsed.pattern, timeoutMs: parsed.timeoutMs } });
        } catch (error) {
          if (error instanceof ToolError) return toolErrorResult(error);
          return unknownErrorResult(error);
        }
      },
    },
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

          const paused = await (ctx.client as any).pause();
          if (!paused.success) {
            throw new ToolExecutionError("C64 firmware reported failure while pausing", { details: normalizeErrorDetails(paused.details) });
          }

          let preReadHex: string | undefined;
          try {
            const pre = await (ctx.client as any).readMemory(parsed.address, String(Math.max(1, readLen)));
            if (!pre.success) {
              throw new ToolExecutionError("C64 firmware reported failure while reading memory", { details: normalizeErrorDetails(pre.details) });
            }
            preReadHex = (pre.data as string) ?? "$";
            const preBytes = hexToBytes(preReadHex);

            if (verifyLen > 0) {
              const errors: Array<{ offset: number; expected: string; actual: string; mask?: string }> = [];
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

            const write = await (ctx.client as any).writeMemory(parsed.address, bytesToHex(writeBytes));
            if (!write.success) {
              throw new ToolExecutionError("C64 firmware reported failure while writing memory", { details: normalizeErrorDetails(write.details) });
            }

            const post = await (ctx.client as any).readMemory(parsed.address, String(Math.max(1, writeBytes.length)));
            if (!post.success) {
              throw new ToolExecutionError("C64 firmware reported failure while reading back memory", { details: normalizeErrorDetails(post.details) });
            }
            const postBytes = hexToBytes((post.data as string) ?? "$");

            const diffs: Array<{ offset: number; before: string; after: string; expected?: string }> = [];
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
              postRead: (post.data as string) ?? "",
            }, { success: true });
          } finally {
            await (ctx.client as any).resume();
          }
        } catch (error) {
          if (error instanceof ToolError) return toolErrorResult(error);
          return unknownErrorResult(error);
        }
      },
    },
    {
      name: "start_background_task",
      description: "Start a background task that runs an operation at a fixed interval for N iterations or indefinitely.",
      summary: "Schedules a recurring operation and tracks its status.",
      inputSchema: startBackgroundTaskArgsSchema.jsonSchema,
      tags: ["background", "scheduler"],
      async execute(args, ctx) {
        try {
          await ensureTasksLoaded();
          const parsed = startBackgroundTaskArgsSchema.parse(args ?? {});
          const now = new Date();
          const existing = TASKS.get(parsed.name);
          if (existing && existing.status === "running") {
            throw new ToolValidationError("Task with this name is already running", { path: "$.name" });
          }

          // Determine next global counter by scanning existing registry entries
          const allTasks = Array.from(TASKS.values());
          const currentMax = allTasks.reduce((max, t) => {
            const match = /^([0-9]{4})_/.exec(t.id);
            const n = match ? Number(match[1]) : 0;
            return Number.isFinite(n) && n > max ? n : max;
          }, 0);

          const newCounter = String(currentMax + 1).padStart(4, "0");
          const newId = `${newCounter}_${parsed.name}`;

          const task: BackgroundTask = {
            id: existing && existing.status !== "running" ? existing.id : newId,
            name: parsed.name,
            type: "background",
            operation: parsed.operation,
            args: (parsed.arguments as Record<string, unknown>) ?? {},
            intervalMs: parsed.intervalMs ?? (existing?.intervalMs ?? 1000),
            maxIterations: parsed.maxIterations,
            iterations: 0,
            status: "running",
            startedAt: now,
            updatedAt: now,
            stoppedAt: null,
            lastError: null,
            nextRunAt: null,
            folder: getBackgroundTaskFolderRelative(existing && existing.status !== "running" ? existing.id : newId),
            _timer: null,
          };

          TASKS.set(task.name, task);
          // Ensure per-task structure and seed files
          await fs.mkdir(getBackgroundTaskFolderAbsolute(task.id), { recursive: true });
          await writeTaskJson(task);
          await ensureResultAndLog(task);
          await appendTaskLog(task, "started");
          scheduleNextRun(task, ctx);
          await persistTasks();
          return jsonResult({ started: true, task: { id: task.id, name: task.name, operation: task.operation, intervalMs: task.intervalMs, maxIterations: task.maxIterations ?? null, folder: task.folder } }, { success: true });
        } catch (error) {
          if (error instanceof ToolError) return toolErrorResult(error);
          return unknownErrorResult(error);
        }
      },
    },
    {
      name: "stop_background_task",
      description: "Stop a named background task.",
      summary: "Stops a running task and marks it as stopped.",
      inputSchema: stopBackgroundTaskArgsSchema.jsonSchema,
      tags: ["background", "scheduler"],
      async execute(args) {
        try {
          await ensureTasksLoaded();
          const parsed = stopBackgroundTaskArgsSchema.parse(args ?? {});
          const task = TASKS.get(parsed.name);
          if (!task) {
            // Idempotent stop: report success even if task does not exist anymore
            return jsonResult({ stopped: false, name: parsed.name, notFound: true }, { success: true });
          }
          stopTask(task);
          await appendTaskLog(task, "stopped");
          await persistTasks();
          return jsonResult({ stopped: true, name: task.name, status: task.status }, { success: true });
        } catch (error) {
          if (error instanceof ToolError) return toolErrorResult(error);
          return unknownErrorResult(error);
        }
      },
    },
    {
      name: "list_background_tasks",
      description: "List known background tasks and their status.",
      summary: "Returns current registry entries.",
      inputSchema: listBackgroundTasksArgsSchema.jsonSchema,
      tags: ["background", "scheduler"],
      async execute(args) {
        try {
          await ensureTasksLoaded();
          listBackgroundTasksArgsSchema.parse(args ?? {});
          const tasks = Array.from(TASKS.values()).map((t) => ({
            id: t.id,
            name: t.name,
            type: t.type,
            status: t.status,
            iterations: t.iterations,
            intervalMs: t.intervalMs,
            maxIterations: t.maxIterations ?? null,
            nextRunAt: t.nextRunAt ? formatTimestampSpec(t.nextRunAt) : null,
            startedAt: formatTimestampSpec(t.startedAt),
            updatedAt: formatTimestampSpec(t.updatedAt),
            stoppedAt: t.stoppedAt ? formatTimestampSpec(t.stoppedAt) : null,
            lastError: t.lastError ?? null,
            folder: t.folder,
          }));
          return jsonResult({ tasks }, { success: true, count: tasks.length });
        } catch (error) {
          if (error instanceof ToolError) return toolErrorResult(error);
          return unknownErrorResult(error);
        }
      },
    },
    {
      name: "stop_all_background_tasks",
      description: "Stop all active background tasks.",
      summary: "Stops every running task and clears timers.",
      inputSchema: stopAllBackgroundTasksArgsSchema.jsonSchema,
      tags: ["background", "scheduler"],
      async execute(args) {
        try {
          await ensureTasksLoaded();
          stopAllBackgroundTasksArgsSchema.parse(args ?? {});
          for (const task of TASKS.values()) {
            stopTask(task);
            await appendTaskLog(task, "stopped");
          }
          await persistTasks();
          return jsonResult({ stoppedAll: true, count: TASKS.size }, { success: true });
        } catch (error) {
          if (error instanceof ToolError) return toolErrorResult(error);
          return unknownErrorResult(error);
        }
      },
    },
    {
      name: "find_paths_by_name",
      description: "Return device paths whose names contain a substring; supports simple extension filters and wildcard-aware firmware search.",
      summary: "Container-aware discovery wrapper using firmware file wildcard search.",
      inputSchema: findPathsByNameArgsSchema.jsonSchema,
      tags: ["files", "discover"],
      async execute(args, ctx) {
        try {
          const parsed = findPathsByNameArgsSchema.parse(args ?? {});
          const root = parsed.root ?? "/";
          const needle = parsed.caseInsensitive ? (parsed.nameContains as string).toLowerCase() : (parsed.nameContains as string);

          const exts = (parsed.extensions ?? []) as string[];
          const patterns: string[] = exts.length > 0
            ? exts.map((e) => `${root}/**/*${parsed.nameContains}*.${e}`)
            : [`${root}/**/*${parsed.nameContains}*`];

          const seen = new Set<string>();
          const results: string[] = [];
          for (const pattern of patterns) {
            const info = await (ctx.client as any).filesInfo(pattern);
            if (Array.isArray(info)) {
              for (const p of info) {
                if (typeof p !== "string") continue;
                const name = parsed.caseInsensitive ? p.toLowerCase() : p;
                if (name.includes(needle) && !seen.has(p)) {
                  seen.add(p);
                  results.push(p);
                  if (results.length >= (parsed.maxResults ?? 50)) break;
                }
              }
            } else if (info && typeof info === "object" && Array.isArray((info as any).paths)) {
              for (const p of (info as any).paths) {
                if (typeof p !== "string") continue;
                const name = parsed.caseInsensitive ? p.toLowerCase() : p;
                if (name.includes(needle) && !seen.has(p)) {
                  seen.add(p);
                  results.push(p);
                  if (results.length >= (parsed.maxResults ?? 50)) break;
                }
              }
            }
            if (results.length >= (parsed.maxResults ?? 50)) break;
          }
          return jsonResult({ root, pattern: parsed.nameContains, results }, { success: true, count: results.length });
        } catch (error) {
          if (error instanceof ToolError) return toolErrorResult(error);
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
          const length = parsed.length as number;
          const chunk = Math.min(Math.max(1, parsed.chunkSize ?? 512), 4096);
          const pause = parsed.pauseDuringRead !== false;
          const outputPath = resolvePath(String(parsed.outputPath));
          const outDir = dirname(outputPath);
          await fs.mkdir(outDir, { recursive: true });

          if (pause) {
            const res = await (ctx.client as any).pause();
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
              let lastErr: unknown = null;
              while (!success && attempts <= (parsed.retries ?? 1)) {
                attempts += 1;
                try {
                  const r = await (ctx.client as any).readMemory(`$${formatAddressHex(addr)}`, String(take));
                  if (!r.success || typeof r.data !== "string") {
                    throw new ToolExecutionError("Firmware returned failure for chunk", { details: normalizeErrorDetails(r.details) });
                  }
                  const bytes = hexToBytes(r.data);
                  Buffer.from(bytes).copy(buf, offset, 0, take);
                  success = true;
                } catch (e) {
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
            } else {
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
          } finally {
            if (pause) {
              await (ctx.client as any).resume();
            }
          }
        } catch (error) {
          if (error instanceof ToolError) return toolErrorResult(error);
          return unknownErrorResult(error);
        }
      },
    },
    {
      name: "config_snapshot_and_restore",
      description: "Read all configuration categories and write a versioned snapshot, or restore from a snapshot; supports diff mode.",
      summary: "Snapshot/restore configuration with simple diff reporting.",
      inputSchema: configSnapshotAndRestoreArgsSchema.jsonSchema,
      tags: ["config", "snapshot"],
      async execute(args, ctx) {
        try {
          const parsed = configSnapshotAndRestoreArgsSchema.parse(args ?? {});
          const action = parsed.action as string;
          const path = resolvePath(String(parsed.path));
          await fs.mkdir(dirname(path), { recursive: true });

          if (action === "snapshot") {
            const [version, info, cats] = await Promise.all([
              (ctx.client as any).version(),
              (ctx.client as any).info(),
              (ctx.client as any).configsList(),
            ]);
            const categories: string[] = Array.isArray((cats as any)?.categories)
              ? (cats as any).categories
              : [];
            const data: Record<string, unknown> = {};
            for (const category of categories) {
              try {
                const v = await (ctx.client as any).configGet(category as any);
                data[category as any] = v;
              } catch (e) {
                data[category as any] = { _error: e instanceof Error ? e.message : String(e) };
              }
            }
            const snapshot = {
              createdAt: new Date().toISOString(),
              version,
              info,
              categories: data,
            };
            await fs.writeFile(path, JSON.stringify(snapshot, null, 2), "utf8");
            return jsonResult({ path, categoryCount: Object.keys(data).length }, { success: true });
          }

          if (action === "restore") {
            const text = await fs.readFile(path, "utf8");
            const snapshot = JSON.parse(text);
            if (!snapshot || typeof snapshot !== "object" || typeof snapshot.categories !== "object") {
              throw new ToolValidationError("Invalid snapshot file", { path: "$.path" });
            }
            const payload = snapshot.categories as Record<string, object>;
            const result = await (ctx.client as any).configBatchUpdate(payload);
            if (!result.success) {
              throw new ToolExecutionError("Batch update failed", { details: normalizeErrorDetails(result.details) });
            }
            if (parsed.applyToFlash) {
              await (ctx.client as any).configSaveToFlash();
            }
            return jsonResult({ restored: true, categories: Object.keys(payload).length }, { success: true });
          }

          const text = await fs.readFile(path, "utf8");
          const snapshot = JSON.parse(text);
          const cats = await (ctx.client as any).configsList();
          const categories: string[] = Array.isArray((cats as any)?.categories)
            ? (cats as any).categories
            : [];
          const current: Record<string, unknown> = {};
          for (const c of categories) {
            current[c] = await (ctx.client as any).configGet(c as any);
          }
          const diff: Record<string, Record<string, { expected: unknown; actual: unknown }>> = {};
          const snapCats: Record<string, unknown> = snapshot.categories ?? {};
          for (const [cat, snapVal] of Object.entries(snapCats)) {
            const curVal = current[cat];
            if (JSON.stringify(snapVal) !== JSON.stringify(curVal)) {
              diff[cat] = { _changed: { expected: snapVal, actual: curVal } } as any;
            }
          }
          return jsonResult({ diff }, { success: true, changed: Object.keys(diff).length });
        } catch (error) {
          if (error instanceof ToolError) return toolErrorResult(error);
          return unknownErrorResult(error);
        }
      },
    },
  ],
});
