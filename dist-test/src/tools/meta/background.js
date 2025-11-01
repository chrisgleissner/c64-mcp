import { objectSchema, stringSchema, numberSchema, optionalSchema } from "../schema.js";
import { jsonResult } from "../responses.js";
import { ToolError, ToolValidationError, toolErrorResult, unknownErrorResult } from "../errors.js";
import { promises as fs } from "node:fs";
import { dirname, resolve as resolvePath, join as joinPath } from "node:path";
import os from "node:os";
import { addMilliseconds } from "date-fns";
import { formatTimestampSpec, parseTimestampSpec } from "./util.js";
const TASKS = new Map();
function normaliseOperation(op) {
    switch (op) {
        case "read_memory":
            return "read";
        case "write_memory":
            return "write";
        default:
            return op;
    }
}
function toPersistedTask(t) {
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
function fromPersistedTask(p) {
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
function getTasksHomeDir() {
    const overrideFile = process.env.C64_TASK_STATE_FILE ? resolvePath(String(process.env.C64_TASK_STATE_FILE)) : null;
    if (overrideFile) {
        return dirname(overrideFile);
    }
    return resolvePath(joinPath(os.homedir(), ".c64bridge"));
}
function getTaskStateFilePath() {
    const override = process.env.C64_TASK_STATE_FILE;
    if (override)
        return resolvePath(String(override));
    return resolvePath(joinPath(getTasksHomeDir(), "tasks.json"));
}
function getBackgroundTaskFolderRelative(id) {
    return `tasks/background/${id}`;
}
function getBackgroundTaskFolderAbsolute(id) {
    return resolvePath(joinPath(getTasksHomeDir(), getBackgroundTaskFolderRelative(id)));
}
let TASKS_LOADED = false;
async function ensureTasksLoaded() {
    if (TASKS_LOADED)
        return;
    TASKS_LOADED = true;
    try {
        const text = await fs.readFile(getTaskStateFilePath(), "utf8");
        const parsed = JSON.parse(text);
        if (parsed && Array.isArray(parsed.tasks)) {
            for (const pt of parsed.tasks) {
                const t = fromPersistedTask(pt);
                TASKS.set(t.name, t);
            }
        }
    }
    catch (error) {
        if (error?.code === "ENOENT") {
            const path = getTaskStateFilePath();
            await fs.mkdir(dirname(path), { recursive: true });
            await fs.writeFile(path, JSON.stringify({ tasks: [] }, null, 2), "utf8");
        }
    }
}
async function writeTaskJson(task) {
    const folderAbs = getBackgroundTaskFolderAbsolute(task.id);
    const resultRelative = `${task.folder}/result.json`;
    const pt = toPersistedTask(task);
    const data = { ...pt, resultPath: resultRelative };
    await fs.mkdir(folderAbs, { recursive: true });
    await fs.writeFile(resolvePath(folderAbs, "task.json"), JSON.stringify(data, null, 2), "utf8");
}
async function ensureResultAndLog(task) {
    const folderAbs = getBackgroundTaskFolderAbsolute(task.id);
    await fs.mkdir(folderAbs, { recursive: true });
    const resultPath = resolvePath(folderAbs, "result.json");
    const logPath = resolvePath(folderAbs, "log.txt");
    try {
        await fs.access(resultPath);
    }
    catch {
        const initial = {
            id: task.id,
            type: "task",
            name: task.operation,
            created: formatTimestampSpec(task.startedAt),
            status: task.status,
            iterations: task.iterations,
        };
        await fs.writeFile(resultPath, JSON.stringify(initial, null, 2), "utf8");
    }
    try {
        await fs.access(logPath);
    }
    catch {
        await fs.writeFile(logPath, "", "utf8");
    }
}
async function appendTaskLog(task, message) {
    const logPath = resolvePath(getBackgroundTaskFolderAbsolute(task.id), "log.txt");
    const ts = formatTimestampSpec(task.updatedAt ?? task.startedAt ?? new Date());
    await fs.appendFile(logPath, `[${ts}] ${message}\n`, "utf8");
}
async function persistTasks() {
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
    }
    catch {
        // ignore
    }
}
function runOperation(op, args, ctx) {
    switch (normaliseOperation(op)) {
        case "read": {
            const address = String(args.address ?? "$0400");
            const length = String(args.length ?? "16");
            return ctx.client.readMemory(address, length);
        }
        case "write": {
            const address = String(args.address ?? "$0400");
            const bytes = String(args.bytes ?? "$00");
            return ctx.client.writeMemory(address, bytes);
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
function scheduleNextRun(task, ctx) {
    if (task.status !== "running")
        return;
    const delay = Math.max(0, task.intervalMs);
    task.nextRunAt = addMilliseconds(new Date(), delay);
    task._timer = setTimeout(async () => {
        if (task.status !== "running")
            return;
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
        }
        catch (err) {
            task.status = "error";
            task.lastError = err instanceof Error ? err.message : String(err);
            task.stoppedAt = new Date();
            task._timer = null;
            await appendTaskLog(task, `error: ${task.lastError}`);
            await persistTasks();
        }
    }, delay);
}
function stopTask(task) {
    if (task._timer) {
        clearTimeout(task._timer);
    }
    task._timer = null;
    task.status = task.status === "completed" ? task.status : "stopped";
    task.stoppedAt = new Date();
}
const noArgsSchema = objectSchema({ description: "No arguments", properties: {}, additionalProperties: false });
const startBackgroundTaskArgsSchema = objectSchema({
    description: "Start a named background task that invokes a simple operation at fixed intervals.",
    properties: {
        name: stringSchema({ description: "Unique task name", minLength: 1 }),
        operation: stringSchema({ description: "Operation name (e.g., read, read_screen)", minLength: 1 }),
        arguments: optionalSchema(objectSchema({ description: "Operation-specific arguments", properties: {}, additionalProperties: true }), {}),
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
export const tools = [
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
                const task = {
                    id: existing && existing.status !== "running" ? existing.id : newId,
                    name: parsed.name,
                    type: "background",
                    operation: parsed.operation,
                    args: parsed.arguments ?? {},
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
            }
            catch (error) {
                if (error instanceof ToolError)
                    return toolErrorResult(error);
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
            }
            catch (error) {
                if (error instanceof ToolError)
                    return toolErrorResult(error);
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
            }
            catch (error) {
                if (error instanceof ToolError)
                    return toolErrorResult(error);
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
            }
            catch (error) {
                if (error instanceof ToolError)
                    return toolErrorResult(error);
                return unknownErrorResult(error);
            }
        },
    },
];
export { getTasksHomeDir };
