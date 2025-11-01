import { objectSchema } from "../schema.js";
import { jsonResult } from "../responses.js";
import { ToolError, toolErrorResult, unknownErrorResult } from "../errors.js";
const noArgsSchema = objectSchema({ description: "No arguments", properties: {}, additionalProperties: false });
export const tools = [
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
                const steps = [
                    { name: "version", started: Date.now() },
                    { name: "info", started: 0 },
                    { name: "readmem", started: 0 },
                ];
                let version = null;
                try {
                    steps[0].started = Date.now();
                    version = await ctx.client.version();
                    steps[0].ok = true;
                    steps[0].ended = Date.now();
                }
                catch (e) {
                    steps[0].ok = false;
                    steps[0].ended = Date.now();
                    steps[0].error = e;
                }
                let info = null;
                try {
                    steps[1].started = Date.now();
                    info = await ctx.client.info();
                    steps[1].ok = true;
                    steps[1].ended = Date.now();
                }
                catch (e) {
                    steps[1].ok = false;
                    steps[1].ended = Date.now();
                    steps[1].error = e;
                }
                let readmem = null;
                try {
                    steps[2].started = Date.now();
                    readmem = await ctx.client.readMemory("$0000", "1");
                    steps[2].ok = readmem?.success !== false;
                    steps[2].ended = Date.now();
                }
                catch (e) {
                    steps[2].ok = false;
                    steps[2].ended = Date.now();
                    steps[2].error = e;
                }
                const ended = Date.now();
                const report = {
                    isHealthy: steps.every((s) => s.ok),
                    totalLatencyMs: ended - started,
                    steps: steps.map((s) => ({ name: s.name, latencyMs: (s.ended ?? Date.now()) - s.started, ok: s.ok, error: s.ok ? undefined : (s.error instanceof Error ? s.error.message : String(s.error)) })),
                    version,
                    info,
                };
                return jsonResult(report, { success: report.isHealthy });
            }
            catch (error) {
                if (error instanceof ToolError)
                    return toolErrorResult(error);
                return unknownErrorResult(error);
            }
        },
    },
];
