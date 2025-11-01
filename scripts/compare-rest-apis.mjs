#!/usr/bin/env node
/**
 * Compare Ultimate 64 REST API responses between a real device and the mock server.
 *
 * The script reads the OpenAPI document, runs a suite of scenario requests (both
 * happy-path and intentionally invalid), and records how each endpoint responds
 * on the real hardware versus the mock. Results are persisted as JSON so they
 * can be fed into further analysis (e.g. diffing, LLM suggestions).
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { Buffer } from "node:buffer";
import { performance } from "node:perf_hooks";
import YAML from "yaml";
import { startMockC64Server } from "./mockC64Server.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT_DIR, "artifacts", "rest-compare");
const OPENAPI_PATH = path.join(ROOT_DIR, "doc", "c64u", "c64-openapi.yaml");

const REAL_BASE = process.env.C64_REAL_BASE ?? "http://192.168.1.13";
const REAL_LABEL = process.env.C64_REAL_LABEL ?? "real";
const MOCK_LABEL = process.env.C64_MOCK_LABEL ?? "mock";

const REQUEST_TIMEOUT_MS = Number(process.env.C64_COMPARE_TIMEOUT_MS ?? "12000");

/**
 * Small helper to shallow pick interesting headers for comparison.
 */
const HEADER_WHITELIST = new Set([
  "content-type",
  "content-length",
  "cache-control",
  "etag",
  "last-modified",
]);

const IGNORED_OPERATIONS = new Set([
  "PUT /v1/configs:save_to_flash",
  "PUT /v1/configs:load_from_flash",
  "PUT /v1/configs:reset_to_default",
  "PUT /v1/machine:poweroff",
  "PUT /v1/machine:menu_button",
  "PUT /v1/runners:modplay",
  "POST /v1/runners:modplay",
]);

/**
 * Format helper for timestamps.
 */
function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/**
 * Fetch helper with timeout handling.
 */
async function httpRequest(baseUrl, request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS).unref();
  const startTime = performance.now();
  let requestUrl;

  try {
    requestUrl = new URL(request.path, baseUrl);
    if (request.query) {
      for (const [key, value] of Object.entries(request.query)) {
        if (value === undefined || value === null) continue;
        requestUrl.searchParams.set(key, String(value));
      }
    }

    const headers = new Headers(request.headers ?? {});
    const init = {
      method: request.method,
      headers,
      signal: controller.signal,
    };

    if (request.body !== undefined) {
      if (request.bodyType === "json") {
        headers.set("Content-Type", "application/json");
        init.body = Buffer.from(JSON.stringify(request.body));
      } else if (request.bodyType === "text") {
        init.body = Buffer.from(String(request.body));
      } else if (request.bodyType === "binary") {
        init.body = Buffer.isBuffer(request.body)
          ? request.body
          : Buffer.from(request.body);
        if (!headers.has("Content-Type")) {
          headers.set("Content-Type", "application/octet-stream");
        }
      } else {
        init.body = request.body;
      }
    }

  const res = await fetch(requestUrl, init);
    const arrayBuffer = await res.arrayBuffer().catch(() => new ArrayBuffer(0));
    const buffer = Buffer.from(arrayBuffer);
    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();

    let bodyType = "binary";
    let body;
    if (contentType.includes("application/json")) {
      bodyType = "json";
      try {
        body = JSON.parse(buffer.toString("utf8"));
      } catch (error) {
        bodyType = "text";
        body = buffer.toString("utf8");
      }
    } else if (contentType.startsWith("text/")) {
      bodyType = "text";
      body = buffer.toString("utf8");
    } else {
      body = buffer.toString("base64");
    }

    const headersPicked = {};
    for (const [key, value] of res.headers.entries()) {
      const lower = key.toLowerCase();
      if (HEADER_WHITELIST.has(lower)) {
        headersPicked[lower] = value;
      }
    }

    return {
      url: requestUrl.toString(),
      status: res.status,
      ok: res.ok,
      headers: headersPicked,
      bodyType,
      body,
      size: buffer.length,
      latencyMs: performance.now() - startTime,
    };
  } catch (error) {
    return {
      url: (requestUrl ?? new URL(request.path, baseUrl)).toString(),
      error: {
        name: error?.name ?? "Error",
        message: error?.message ?? String(error),
      },
      latencyMs: performance.now() - startTime,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function normaliseBodyForDiff(bodyType, body) {
  if (bodyType === "json") {
    return body;
  }
  if (bodyType === "text") {
    return body;
  }
  // Binary output: keep size and first few bytes for diff readability.
  if (typeof body === "string") {
    return {
      length: Buffer.from(body, "base64").length,
      preview: body.slice(0, 32),
    };
  }
  return body;
}

function formatLatency(latencyMs) {
  if (typeof latencyMs !== "number" || Number.isNaN(latencyMs)) {
    return "latency=n/a";
  }
  return `latency=${latencyMs.toFixed(1)}ms`;
}

function describeOutcome(resp) {
  if (resp.error) {
    const message = resp.error.message ?? resp.error.name ?? "error";
    const shortMessage = message.length > 80 ? `${message.slice(0, 77)}…` : message;
    return `error=${shortMessage} ${formatLatency(resp.latencyMs)}`;
  }
  const statusPart = resp.status !== undefined ? `status=${resp.status}` : "status=n/a";
  return `${statusPart} ${formatLatency(resp.latencyMs)}`;
}

function compareResponses(real, mock) {
  const issues = [];
  if (real.error || mock.error) {
    if (!real.error || !mock.error) {
      issues.push({ kind: "error-mismatch", real: real.error ?? null, mock: mock.error ?? null });
      return issues;
    }
    if (real.error.message !== mock.error.message) {
      issues.push({
        kind: "error-message",
        real: real.error.message,
        mock: mock.error.message,
      });
    }
    return issues;
  }

  if (real.status !== mock.status) {
    issues.push({ kind: "status", real: real.status, mock: mock.status });
  }
  const realBody = normaliseBodyForDiff(real.bodyType, real.body);
  const mockBody = normaliseBodyForDiff(mock.bodyType, mock.body);

  if (JSON.stringify(real.headers) !== JSON.stringify(mock.headers)) {
    issues.push({ kind: "headers", real: real.headers, mock: mock.headers });
  }
  if (real.bodyType !== mock.bodyType) {
    issues.push({ kind: "body-type", real: real.bodyType, mock: mock.bodyType });
  } else if (JSON.stringify(realBody) !== JSON.stringify(mockBody)) {
    issues.push({ kind: "body", real: realBody, mock: mockBody });
  }

  return issues;
}

function describeRequest(request) {
  const { method, path: requestPath, query, body, bodyType } = request;
  const descriptor = { method, path: requestPath };
  if (query && Object.keys(query).length > 0) {
    descriptor.query = query;
  }
  if (body !== undefined) {
    if (bodyType === "json") {
      descriptor.body = body;
    } else if (bodyType === "text") {
      descriptor.body = body;
    } else if (bodyType === "binary") {
      descriptor.body = { length: Buffer.from(body).length };
    } else {
      descriptor.body = body;
    }
  }
  return descriptor;
}

async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

async function loadOpenApi() {
  const text = await fs.readFile(OPENAPI_PATH, "utf8");
  const spec = YAML.parse(text);
  return spec;
}

function enumerateOperations(openapi) {
  const operations = [];
  for (const [pathKey, pathItem] of Object.entries(openapi.paths ?? {})) {
    for (const method of Object.keys(pathItem)) {
      const lower = method.toLowerCase();
      if (!["get", "put", "post", "delete", "patch", "options", "head"].includes(lower)) {
        continue;
      }
      operations.push({ method: lower.toUpperCase(), path: pathKey });
    }
  }
  return operations;
}

async function gatherContext(realBase, mockBase) {
  async function fetchConfigs(base) {
    const res = await httpRequest(base, { method: "GET", path: "/v1/configs" });
    if (res.error || res.bodyType !== "json") {
      return { categories: [], itemsByCategory: {} };
    }
    const configs = res.body?.configs;
    const categories = Array.isArray(res.body?.categories)
      ? res.body.categories
      : Object.keys(configs ?? {});
    const itemsByCategory = {};
    for (const category of categories ?? []) {
      const itemMap = configs?.[category];
      if (itemMap && typeof itemMap === "object") {
        itemsByCategory[category] = Object.keys(itemMap);
      }
    }
    return { categories, itemsByCategory };
  }

  async function fetchDrives(base) {
    const res = await httpRequest(base, { method: "GET", path: "/v1/drives" });
    if (res.error || res.bodyType !== "json") {
      return [];
    }
    const drives = res.body?.drives;
    if (Array.isArray(drives)) {
      return drives.map((entry) => Object.keys(entry)[0]).filter(Boolean);
    }
    if (drives && typeof drives === "object") {
      return Object.keys(drives);
    }
    return [];
  }

  const [realConfigs, mockConfigs] = await Promise.all([
    fetchConfigs(realBase),
    fetchConfigs(mockBase),
  ]);

  const [realDrives, mockDrives] = await Promise.all([
    fetchDrives(realBase),
    fetchDrives(mockBase),
  ]);

  const sharedCategory = (realConfigs.categories ?? []).find((cat) => (mockConfigs.categories ?? []).includes(cat));
  let sharedItem;
  if (sharedCategory) {
    const realItems = realConfigs.itemsByCategory[sharedCategory] ?? [];
    const mockItems = mockConfigs.itemsByCategory[sharedCategory] ?? [];
    sharedItem = realItems.find((item) => mockItems.includes(item));
  }

  const sharedDrive = realDrives.find((drive) => mockDrives.includes(drive));

  return {
    sharedCategory: sharedCategory ?? null,
    sharedItem: sharedItem ?? null,
    sharedDrive: sharedDrive ?? null,
    realConfigs,
    mockConfigs,
    realDrives,
    mockDrives,
  };
}

function scenario(id, operations, buildRequests, options = {}) {
  const ops = Array.isArray(operations) ? operations : [operations];
  return { id, operations: ops, buildRequests, ...options };
}

function binaryZeros(length) {
  return Buffer.alloc(length, 0);
}

function createScenarios(assets) {
  return [
    scenario("version-get", "GET /v1/version", () => [
      {
        name: "success",
        method: "GET",
        path: "/v1/version",
        headers: { Accept: "application/json" },
      },
    ]),
    scenario("info-get", "GET /v1/info", () => [
      {
        name: "success",
        method: "GET",
        path: "/v1/info",
        headers: { Accept: "application/json" },
      },
    ]),
    scenario("drives-get", "GET /v1/drives", () => [
      {
        name: "success",
        method: "GET",
        path: "/v1/drives",
        headers: { Accept: "application/json" },
      },
    ]),
    scenario("configs-get", "GET /v1/configs", () => [
      {
        name: "success",
        method: "GET",
        path: "/v1/configs",
        headers: { Accept: "application/json" },
      },
    ]),
    scenario("configs-category-get", "GET /v1/configs/{category}", (ctx) => {
      if (!ctx.sharedCategory) {
        return [
          {
            name: "missing-category",
            method: "GET",
            path: `/v1/configs/DOES_NOT_EXIST`,
            headers: { Accept: "application/json" },
            note: "Shared config category not found on both endpoints; testing error path.",
          },
        ];
      }
      return [
        {
          name: "success",
          method: "GET",
          path: `/v1/configs/${encodeURIComponent(ctx.sharedCategory)}`,
          headers: { Accept: "application/json" },
        },
      ];
    }),
    scenario("configs-item-get", "GET /v1/configs/{category}/{item}", (ctx) => {
      if (!ctx.sharedCategory || !ctx.sharedItem) {
        return [
          {
            name: "missing-item",
            method: "GET",
            path: `/v1/configs/DOES_NOT_EXIST/NOPE`,
            headers: { Accept: "application/json" },
          },
        ];
      }
      return [
        {
          name: "success",
          method: "GET",
          path: `/v1/configs/${encodeURIComponent(ctx.sharedCategory)}/${encodeURIComponent(ctx.sharedItem)}`,
          headers: { Accept: "application/json" },
        },
      ];
    }),
    scenario("configs-item-put", "PUT /v1/configs/{category}/{item}", (ctx) => {
      if (!ctx.sharedCategory || !ctx.sharedItem) {
        return [
          {
            name: "invalid-category",
            method: "PUT",
            path: `/v1/configs/DOES_NOT_EXIST/NOPE`,
            query: { value: "foo" },
          },
        ];
      }
      return [
        {
          name: "set-same-value",
          method: "PUT",
          path: `/v1/configs/${encodeURIComponent(ctx.sharedCategory)}/${encodeURIComponent(ctx.sharedItem)}`,
          query: { value: "" },
          note: "Sets empty string; device typically normalises.",
        },
      ];
    }),
    scenario("configs-post", "POST /v1/configs", () => [
      {
        name: "empty-payload",
        method: "POST",
        path: "/v1/configs",
        bodyType: "json",
        body: {},
      },
    ]),
    scenario("machine-debugreg", ["GET /v1/machine:debugreg", "PUT /v1/machine:debugreg"], () => [
      {
        name: "read",
        method: "GET",
        path: "/v1/machine:debugreg",
        headers: { Accept: "application/json" },
      },
      {
        name: "write-ab",
        method: "PUT",
        path: "/v1/machine:debugreg",
        query: { value: "AB" },
      },
    ]),
    scenario("machine-readmem", "GET /v1/machine:readmem", () => [
      {
        name: "read-json",
        method: "GET",
        path: "/v1/machine:readmem",
        query: { address: "0400", length: 16 },
        headers: { Accept: "application/json" },
      },
      {
        name: "invalid-length",
        method: "GET",
        path: "/v1/machine:readmem",
        query: { address: "ZZZZ", length: 0 },
        headers: { Accept: "application/json" },
        note: "Intentionally invalid address/length to observe error parity.",
      },
    ]),
    scenario("machine-writemem-put", "PUT /v1/machine:writemem", () => [
      {
        name: "write-hex",
        method: "PUT",
        path: "/v1/machine:writemem",
        query: { address: "C000", data: "1122" },
      },
      {
        name: "invalid-data",
        method: "PUT",
        path: "/v1/machine:writemem",
        query: { address: "C000", data: "GG" },
      },
    ]),
    scenario("machine-writemem-post", "POST /v1/machine:writemem", () => [
      {
        name: "write-binary",
        method: "POST",
        path: "/v1/machine:writemem",
        query: { address: "C100" },
        bodyType: "binary",
        body: binaryZeros(32),
      },
    ]),
    scenario("machine-reset", "PUT /v1/machine:reset", () => [
      {
        name: "success",
        method: "PUT",
        path: "/v1/machine:reset",
      },
    ]),
    scenario("machine-pause-resume", ["PUT /v1/machine:pause", "PUT /v1/machine:resume"], () => [
      {
        name: "pause",
        method: "PUT",
        path: "/v1/machine:pause",
      },
      {
        name: "resume",
        method: "PUT",
        path: "/v1/machine:resume",
      },
    ]),
    scenario("runners-run_prg", ["POST /v1/runners:run_prg", "PUT /v1/runners:run_prg"], (ctx, assets) => [
      {
        name: "run-basic-prg",
        method: "POST",
        path: "/v1/runners:run_prg",
        bodyType: "binary",
        body: assets.helloPrg,
        headers: { "X-Test": "run-prg" },
      },
      {
        name: "missing-file",
        method: "PUT",
        path: "/v1/runners:run_prg",
        query: { file: "//USB0/does-not-exist.prg" },
      },
    ]),
    scenario("runners-load_prg", ["POST /v1/runners:load_prg", "PUT /v1/runners:load_prg"], (ctx, assets) => [
      {
        name: "missing-file",
        method: "PUT",
        path: "/v1/runners:load_prg",
        query: { file: "//USB0/does-not-exist.prg" },
      },
      {
        name: "upload-basic",
        method: "POST",
        path: "/v1/runners:load_prg",
        bodyType: "binary",
        body: assets.helloPrg,
        headers: { "X-Test": "load-prg" },
        note: "Uploads a small BASIC program without running it.",
      },
    ]),
    scenario("runners-run_crt", "PUT /v1/runners:run_crt", () => [
      {
        name: "missing-crt",
        method: "PUT",
        path: "/v1/runners:run_crt",
        query: { file: "//USB0/does-not-exist.crt" },
      },
    ]),
    scenario("runners-sidplay", ["PUT /v1/runners:sidplay", "POST /v1/runners:sidplay"], () => [
      {
        name: "missing-sid-file",
        method: "PUT",
        path: "/v1/runners:sidplay",
        query: { file: "//USB0/does-not-exist.sid", songnr: 0 },
      },
      {
        name: "upload-invalid-sid",
        method: "POST",
        path: "/v1/runners:sidplay",
        query: { songnr: 0 },
        bodyType: "binary",
        body: Buffer.from("INVALID"),
      },
    ]),
    scenario("streams-start-stop", ["PUT /v1/streams/{stream}:start", "PUT /v1/streams/{stream}:stop"], () => [
      {
        name: "start-video-invalid-ip",
        method: "PUT",
        path: "/v1/streams/video:start",
        query: { ip: "999.999.999.999" },
      },
      {
        name: "stop-video",
        method: "PUT",
        path: "/v1/streams/video:stop",
      },
    ]),
    scenario("drives-operations", [
      "PUT /v1/drives/{drive}:mount",
      "PUT /v1/drives/{drive}:reset",
      "PUT /v1/drives/{drive}:set_mode",
    ], (ctx) => {
      const drive = ctx.sharedDrive ?? "drive8";
      return [
        {
          name: "mount-missing-image",
          method: "PUT",
          path: `/v1/drives/${encodeURIComponent(drive)}:mount`,
          query: { image: "//USB0/does-not-exist.d64" },
        },
        {
          name: "reset-drive",
          method: "PUT",
          path: `/v1/drives/${encodeURIComponent(drive)}:reset`,
        },
        {
          name: "set-mode-invalid",
          method: "PUT",
          path: `/v1/drives/${encodeURIComponent(drive)}:set_mode`,
          query: { mode: "9999" },
        },
      ];
    }),
    scenario("files-info-invalid", "GET /v1/files/{path}:info", () => [
      {
        name: "missing-file",
        method: "GET",
        path: `/v1/files/${encodeURIComponent("Usb0/missing.prg")}:info`,
        headers: { Accept: "application/json" },
      },
    ]),
    scenario("machine-reboot", "PUT /v1/machine:reboot", () => [
      {
        name: "reboot",
        method: "PUT",
        path: "/v1/machine:reboot",
        note: "Exercises reboot endpoint; allow extra settle time after call.",
      },
    ]),
  ];
}

async function runScenario(scenarioDef, context, realBase, mockBase, outputs, assets) {
  const requests = await scenarioDef.buildRequests(context, assets);
  for (const request of requests) {
    const describedRequest = describeRequest(request);

    const [realResp, mockResp] = await Promise.all([
      httpRequest(realBase, request),
      httpRequest(mockBase, request),
    ]);

    const requestLabel = request.name ?? "anonymous";
    console.log(
      `[${scenarioDef.id}/${requestLabel}] ${REAL_LABEL}:${describeOutcome(realResp)} ${MOCK_LABEL}:${describeOutcome(mockResp)}`,
    );

    const diff = compareResponses(realResp, mockResp);

    outputs.push({
      scenarioId: scenarioDef.id,
      operations: scenarioDef.operations,
      requestName: request.name,
      request: describedRequest,
      note: request.note,
      [REAL_LABEL]: realResp,
      [MOCK_LABEL]: mockResp,
      diff,
    });

    // Allow device to settle when issuing reset/pause/resume sequences.
    if (request.path === "/v1/machine:reset" && realResp.ok) {
      await sleep(1000);
    }
    if (request.path === "/v1/machine:pause") {
      await sleep(200);
    }
    if (request.path === "/v1/machine:resume") {
      await sleep(200);
    }
    if (request.path === "/v1/machine:reboot" && realResp.ok) {
      await sleep(3000);
    }
  }
}

async function performCleanupReset(realBase, mockBase, outputs) {
  const request = { method: "PUT", path: "/v1/machine:reset", name: "cleanup" };
  const describedRequest = describeRequest(request);
  const [realResp, mockResp] = await Promise.all([
    httpRequest(realBase, request),
    httpRequest(mockBase, request),
  ]);

  console.log(
    `[cleanup/reset] ${REAL_LABEL}:${describeOutcome(realResp)} ${MOCK_LABEL}:${describeOutcome(mockResp)}`,
  );

  outputs.push({
    scenarioId: "cleanup-reset",
    operations: ["PUT /v1/machine:reset"],
    requestName: "final-reset",
    request: describedRequest,
    note: "Issued automatically after the comparison suite to return the device to READY.",
    [REAL_LABEL]: realResp,
    [MOCK_LABEL]: mockResp,
    diff: compareResponses(realResp, mockResp),
  });

  if (!realResp.error && realResp.ok) {
    await sleep(1000);
  }
}

async function main() {
  await ensureOutputDir();
  const openapi = await loadOpenApi();
  const operations = enumerateOperations(openapi);

  const mock = await startMockC64Server();
  const mockBase = mock.baseUrl;

  try {
    const assets = {
      helloPrg: await fs.readFile(path.join(ROOT_DIR, "artifacts", "demo-basic.prg")),
    };

    const scenarioList = createScenarios(assets);
    const context = await gatherContext(REAL_BASE, mockBase);
    const outputs = [];

    for (const scenarioDef of scenarioList) {
      await runScenario(scenarioDef, context, REAL_BASE, mockBase, outputs, assets);
    }

    await performCleanupReset(REAL_BASE, mockBase, outputs);

    const covered = new Set();
    for (const scenarioDef of scenarioList) {
      for (const op of scenarioDef.operations) {
        covered.add(op);
      }
    }
    const missing = operations
      .map((op) => `${op.method} ${op.path}`)
      .filter((op) => !IGNORED_OPERATIONS.has(op))
      .filter((op) => !Array.from(covered).some((coveredOp) => coveredOp.includes(op)));

    const result = {
      generatedAt: new Date().toISOString(),
      realBase: REAL_BASE,
      mockBase,
      operationsDiscovered: operations.length,
  scenariosExecuted: scenarioList.length,
      ignoredOperations: Array.from(IGNORED_OPERATIONS).sort(),
      missingOperations: Array.from(new Set(missing)).sort(),
      results: outputs,
    };

    const outPath = path.join(OUTPUT_DIR, `rest-compare-${timestamp()}.json`);
    await fs.writeFile(outPath, JSON.stringify(result, null, 2));

    console.log(`REST comparison complete. Results written to ${outPath}`);
    if (result.missingOperations.length > 0) {
      console.log("Missing operations:");
      for (const op of result.missingOperations) {
        console.log(`  - ${op}`);
      }
    }
  } finally {
    await mock.close();
  }
}

main().catch((error) => {
  console.error("REST comparison failed", error);
  process.exitCode = 1;
});
