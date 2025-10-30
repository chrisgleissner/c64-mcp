// Filesystem discovery meta tool
import type { ToolDefinition } from "../types.js";
import { objectSchema, stringSchema, arraySchema, numberSchema, optionalSchema, booleanSchema } from "../schema.js";
import { jsonResult } from "../responses.js";
import { ToolError, ToolExecutionError, toolErrorResult, unknownErrorResult } from "../errors.js";
import { promises as fs } from "node:fs";
import { resolve as resolvePath, join as joinPath, dirname } from "node:path";
import { formatTimestampSpec } from "./util.js";
import { getTasksHomeDir } from "./background.js";

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

const findAndRunProgramArgsSchema = objectSchema({
  description: "Search for a program by substring and run the first match (PRG/CRT).",
  properties: {
    root: optionalSchema(stringSchema({ description: "Root path to search", minLength: 1 }), "/"),
    nameContains: stringSchema({ description: "Substring to match", minLength: 1 }),
    extensions: optionalSchema(arraySchema(stringSchema({ description: "File extensions to include (without dot)", minLength: 1 }))),
    caseInsensitive: optionalSchema(booleanSchema({ description: "Case-insensitive name match", default: true }), true),
    sort: optionalSchema(stringSchema({ description: "Sort order for matches", enum: ["discovered", "alphabetical"] }), "discovered"),
    waitMs: optionalSchema(numberSchema({ description: "Delay after firmware run before returning", integer: true, minimum: 0, default: 0 }), 0),
    captureCandidates: optionalSchema(numberSchema({ description: "Include up to this many candidates in result", integer: true, minimum: 1, maximum: 100 }), 10),
  },
  required: ["nameContains"],
  additionalProperties: false,
});

interface FindRunStateEntry {
  root: string;
  pattern: string;
  extensions: string[];
  matched?: string;
  timestamp: string;
}

interface FindRunState {
  recentSearches: FindRunStateEntry[];
  lastRunPath?: string;
}

function extractPaths(value: unknown): string[] {
  const acc: string[] = [];
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === null || current === undefined) continue;
    if (typeof current === "string") {
      acc.push(current);
      continue;
    }
    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
      continue;
    }
    if (typeof current === "object") {
      const maybeObj = current as Record<string, unknown>;
      if (typeof maybeObj.path === "string") acc.push(maybeObj.path);
      if (Array.isArray(maybeObj.paths)) stack.push(maybeObj.paths);
      if (Array.isArray(maybeObj.entries)) stack.push(maybeObj.entries);
    }
  }
  return acc;
}

function extractExtension(candidate: string): string {
  const withoutContainer = candidate.includes("#") ? candidate.slice(candidate.indexOf("#") + 1) : candidate;
  const lastSegment = withoutContainer.split(/[\\/]/).pop() ?? withoutContainer;
  const dot = lastSegment.lastIndexOf(".");
  if (dot === -1) return "";
  return lastSegment.slice(dot + 1).toLowerCase();
}

function normalisePath(path: string, caseInsensitive: boolean): string {
  return caseInsensitive ? path.toLowerCase() : path;
}

async function loadState(statePath: string): Promise<FindRunState> {
  try {
    const text = await fs.readFile(statePath, "utf8");
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      const rawRecent = Array.isArray((parsed as any).recentSearches) ? (parsed as any).recentSearches : [];
      const recent: FindRunStateEntry[] = [];
      for (const rawEntry of rawRecent) {
        if (!rawEntry || typeof rawEntry !== "object" || typeof (rawEntry as any).pattern !== "string") continue;
        const rootValue = typeof (rawEntry as any).root === "string" ? (rawEntry as any).root : "/";
        const extensionsValue = Array.isArray((rawEntry as any).extensions)
          ? (rawEntry as any).extensions.map((ext: unknown) => String(ext))
          : [];
        const matchedValue = typeof (rawEntry as any).matched === "string" ? (rawEntry as any).matched : undefined;
        const timestampValue = typeof (rawEntry as any).timestamp === "string" ? (rawEntry as any).timestamp : formatTimestampSpec();
        recent.push({
          root: rootValue,
          pattern: String((rawEntry as any).pattern),
          extensions: extensionsValue,
          matched: matchedValue,
          timestamp: timestampValue,
        });
      }
      return {
        recentSearches: recent,
        lastRunPath: typeof (parsed as any).lastRunPath === "string" ? (parsed as any).lastRunPath : undefined,
      } satisfies FindRunState;
    }
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      // Ignore malformed state; caller will write a fresh copy
    }
  }
  return { recentSearches: [] } satisfies FindRunState;
}

async function persistState(statePath: string, entry: FindRunStateEntry, lastRunPath: string): Promise<void> {
  const current = await loadState(statePath);
  const updated: FindRunState = {
    recentSearches: [entry, ...current.recentSearches].slice(0, 10),
    lastRunPath,
  };
  await fs.mkdir(dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(updated, null, 2), "utf8");
}

export const tools: ToolDefinition[] = [
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
      name: "find_and_run_program_by_name",
      description: "Search under a root for the first PRG/CRT whose name contains a substring and run it.",
      summary: "Finds and executes programs by name, recording recent searches for quick replay.",
      inputSchema: findAndRunProgramArgsSchema.jsonSchema,
      tags: ["files", "discover", "programs"],
      examples: [
        {
          name: "Run game",
          description: "Find the first GALAGA program under /USB0 and run it",
          arguments: { root: "/USB0", nameContains: "galaga", sort: "alphabetical" },
        },
      ],
      async execute(args, ctx) {
        try {
          const parsed = findAndRunProgramArgsSchema.parse(args ?? {});
          const root = parsed.root ?? "/";
          const caseInsensitive = parsed.caseInsensitive !== false;
          const extensions = ((parsed.extensions && parsed.extensions.length > 0) ? parsed.extensions : ["prg", "crt"]) as string[];
          const needle = caseInsensitive ? (parsed.nameContains as string).toLowerCase() : parsed.nameContains as string;
          const seen = new Set<string>();
          const candidates: string[] = [];

          for (const ext of extensions) {
            const pattern = `${root}/**/*${parsed.nameContains}*.${ext}`;
            try {
              const info = await (ctx.client as any).filesInfo(pattern);
              const paths = extractPaths(info);
              for (const raw of paths) {
                if (typeof raw !== "string" || raw.length === 0) continue;
                const normalised = normalisePath(raw, caseInsensitive);
                if (!normalised.includes(needle)) continue;
                if (seen.has(raw)) continue;
                const extCandidate = extractExtension(raw);
                if (extensions.length > 0 && !extensions.some((e) => e.toLowerCase() === extCandidate)) continue;
                seen.add(raw);
                candidates.push(raw);
              }
            } catch (err) {
              ctx.logger.warn?.("filesInfo pattern failed", { pattern, error: err instanceof Error ? err.message : String(err) });
            }
          }

          if (candidates.length === 0) {
            throw new ToolExecutionError("No matching program found", { details: { root, pattern: parsed.nameContains, extensions } });
          }

          if ((parsed.sort ?? "discovered") === "alphabetical") {
            const collator = new Intl.Collator(undefined, { sensitivity: caseInsensitive ? "base" : "variant" });
            candidates.sort((a, b) => collator.compare(a, b));
          }

          const matchedPath = candidates[0];
          const extension = extractExtension(matchedPath);
          let result: { success: boolean; details?: unknown };
          if (extension === "crt") {
            result = await (ctx.client as any).runCrtFile(matchedPath);
          } else if (extension === "prg") {
            result = await (ctx.client as any).runPrgFile(matchedPath);
          } else {
            throw new ToolExecutionError("Unsupported program extension", { details: { matchedPath, extension } });
          }

          if (!result?.success) {
            throw new ToolExecutionError("Firmware failed to run program", { details: { matchedPath, extension, response: result?.details } });
          }

          const limit = Math.min(parsed.captureCandidates ?? 10, candidates.length);
          const topCandidates = candidates.slice(0, limit);

          const stateDir = resolvePath(joinPath(getTasksHomeDir(), "meta"));
          const statePath = resolvePath(joinPath(stateDir, "find_and_run_program_by_name.json"));
          const entry: FindRunStateEntry = {
            root,
            pattern: parsed.nameContains as string,
            extensions,
            matched: matchedPath,
            timestamp: formatTimestampSpec(),
          };
          try {
            await persistState(statePath, entry, matchedPath);
          } catch (stateError) {
            ctx.logger.warn?.("Failed to persist find/run state", { error: stateError instanceof Error ? stateError.message : String(stateError) });
          }

          if ((parsed.waitMs ?? 0) > 0) {
            await new Promise((resolve) => setTimeout(resolve, parsed.waitMs ?? 0));
          }

          return jsonResult({
            root,
            pattern: parsed.nameContains,
            matchedPath,
            extension,
            candidates: topCandidates,
            statePath,
          }, { success: true });
        } catch (error) {
          if (error instanceof ToolError) return toolErrorResult(error);
          return unknownErrorResult(error);
        }
      },
    },
];
