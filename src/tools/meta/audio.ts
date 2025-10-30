import { recordAndAnalyzeAudio } from "../../audio/record_and_analyze_audio.js";
import type { ToolDefinition, ToolExecutionContext } from "../types.js";
import { jsonResult } from "../responses.js";
import { ToolExecutionError, toolErrorResult, unknownErrorResult } from "../errors.js";
import { sleep } from "./util.js";
import { objectSchema, numberSchema, optionalSchema } from "../schema.js";

const DEFAULT_DURATION_SECONDS = 1.5;
const DEFAULT_RMS_THRESHOLD = 0.02;
const DEFAULT_WAIT_MS = 150;

const silenceAndVerifyArgsSchema = objectSchema({
  description: "Arguments for the silence_and_verify meta tool",
  properties: {
    durationSeconds: optionalSchema(numberSchema({ minimum: 0.5, maximum: 10, description: "Recording length in seconds" })),
    rmsThreshold: optionalSchema(numberSchema({ minimum: 0, maximum: 1, description: "Maximum allowed RMS" })),
    waitBeforeCaptureMs: optionalSchema(numberSchema({ minimum: 0, maximum: 5000, description: "Delay before recording" })),
  },
  additionalProperties: false,
});

async function silenceSid(context: ToolExecutionContext) {
  const { client } = context;
  if (!(client && typeof (client as any).sidSilenceAll === "function")) {
    throw new ToolExecutionError("sidSilenceAll is not available on this client");
  }

  const response = await (client as any).sidSilenceAll();
  if (!response?.success) {
    throw new ToolExecutionError("Unable to silence SID", {
      details: { response },
    });
  }
}

type AnalyzeAudioFn = (options: {
  durationSeconds: number;
}) => Promise<Awaited<ReturnType<typeof recordAndAnalyzeAudio>>>;

function resolveAnalyzer(context: ToolExecutionContext): AnalyzeAudioFn {
  const { client } = context;
  if (client && typeof (client as any).recordAndAnalyzeAudio === "function") {
    return (args) => (client as any).recordAndAnalyzeAudio(args);
  }

  return recordAndAnalyzeAudio;
}

export const tools: ToolDefinition[] = [
  {
    name: "silence_and_verify",
    description:
      "Silence all SID voices, capture a short sample, and ensure the output is below an RMS threshold.",
    inputSchema: {
      type: "object",
      properties: {
        durationSeconds: {
          type: "number",
          description: "Recording length in seconds (0.5–10).",
        },
        rmsThreshold: {
          type: "number",
          description: "Maximum allowed max RMS before the check fails (0–1).",
        },
        waitBeforeCaptureMs: {
          type: "number",
          description:
            "Delay in milliseconds after silencing before recording starts (0–5000).",
        },
      },
    },
    async execute(args, context) {
      const { logger } = context;
      try {
  const parsed = silenceAndVerifyArgsSchema.parse(args ?? {});
  const durationSeconds = parsed.durationSeconds ?? DEFAULT_DURATION_SECONDS;
  const rmsThreshold = parsed.rmsThreshold ?? DEFAULT_RMS_THRESHOLD;
  const waitBeforeCaptureMs = parsed.waitBeforeCaptureMs ?? DEFAULT_WAIT_MS;

        logger?.debug?.("silence_and_verify: silencing SID");
        await silenceSid(context);

        if (waitBeforeCaptureMs > 0) {
          logger?.debug?.(
            "silence_and_verify: waiting before capture",
            { waitBeforeCaptureMs },
          );
          await sleep(waitBeforeCaptureMs);
        }

        const analyzer = resolveAnalyzer(context);
        logger?.debug?.("silence_and_verify: capturing audio", {
          durationSeconds,
        });
        const analysis = await analyzer({ durationSeconds });

        const globalMetrics = analysis?.analysis?.global_metrics ?? {};
        const averageRmsRaw = typeof globalMetrics.average_rms === "number"
          ? globalMetrics.average_rms
          : null;
        const maxRmsRaw = typeof globalMetrics.max_rms === "number"
          ? globalMetrics.max_rms
          : null;

        if (averageRmsRaw === null && maxRmsRaw === null) {
          throw new ToolExecutionError(
            "Audio analysis did not include RMS metrics",
            { details: { globalMetrics } },
          );
        }

        const averageRms = averageRmsRaw ?? maxRmsRaw ?? 0;
        const maxRms = maxRmsRaw ?? averageRmsRaw ?? 0;
        const duration = analysis?.analysis?.durationSeconds ?? durationSeconds;

        const silent = maxRms <= rmsThreshold;

        logger?.debug?.("silence_and_verify: analysis complete", {
          averageRms,
          maxRms,
          rmsThreshold,
          silent,
        });

        return jsonResult(
          {
            silent,
            durationSeconds: duration,
            waitBeforeCaptureMs,
            threshold: rmsThreshold,
            metrics: {
              averageRms,
              maxRms,
            },
          },
          {
            success: silent,
            silent,
          },
        );
      } catch (error) {
        if (error instanceof ToolExecutionError) {
          return toolErrorResult(error);
        }

        return unknownErrorResult(error);
      }
    },
  },
];
