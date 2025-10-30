import { compileSidwaveToPrg, compileSidwaveToSid } from "../../sidwaveCompiler.js";
import { parseSidwave } from "../../sidwave.js";
import { recordAndAnalyzeAudio } from "../../audio/record_and_analyze_audio.js";
import type { ToolDefinition, ToolExecutionContext } from "../types.js";
import { jsonResult } from "../responses.js";
import { ToolExecutionError, toolErrorResult, unknownErrorResult } from "../errors.js";
import { sleep } from "./util.js";
import { booleanSchema, numberSchema, objectSchema, optionalSchema, stringSchema } from "../schema.js";

const DEFAULT_SILENCE_DURATION_SECONDS = 1.5;
const DEFAULT_RMS_THRESHOLD = 0.02;
const DEFAULT_SILENCE_WAIT_MS = 150;
const DEFAULT_ANALYSIS_DURATION_SECONDS = 3;
const DEFAULT_PLAYBACK_WAIT_MS = 500;
const DEFAULT_POST_SILENCE_WAIT_MS = 200;

const silenceAndVerifyArgsSchema = objectSchema({
  description: "Arguments for the silence_and_verify meta tool",
  properties: {
    durationSeconds: optionalSchema(numberSchema({ description: "Recording length in seconds for the silence probe.", minimum: 0.5, maximum: 10 }), DEFAULT_SILENCE_DURATION_SECONDS),
    rmsThreshold: optionalSchema(numberSchema({ description: "Maximum allowed RMS to consider the capture silent.", minimum: 0, maximum: 1 }), DEFAULT_RMS_THRESHOLD),
    waitBeforeCaptureMs: optionalSchema(numberSchema({ description: "Delay in milliseconds after silencing before recording starts.", minimum: 0, maximum: 5000 }), DEFAULT_SILENCE_WAIT_MS),
  },
  additionalProperties: false,
});

const musicCompilePlayAnalyzeArgsSchema = objectSchema({
  description: "Compile a SIDWAVE score, play it, then record and analyze the audio output.",
  properties: {
    sidwave: optionalSchema(stringSchema({ description: "SIDWAVE source in YAML or JSON format.", minLength: 1 })),
    cpg: optionalSchema(stringSchema({ description: "Legacy CPG input format.", minLength: 1 })),
    output: optionalSchema(stringSchema({ description: "Playback artifact format.", enum: ["prg", "sid"], default: "prg" }), "prg"),
    waitBeforeCaptureMs: optionalSchema(numberSchema({ description: "Delay between starting playback and beginning analysis capture (milliseconds).", minimum: 0, maximum: 5000 }), DEFAULT_PLAYBACK_WAIT_MS),
    analysisDurationSeconds: optionalSchema(numberSchema({ description: "Audio capture length in seconds.", minimum: 0.5, maximum: 20 }), DEFAULT_ANALYSIS_DURATION_SECONDS),
    expectedSidwave: optionalSchema(stringSchema({ description: "Optional expected SIDWAVE used to refine analysis comparisons.", minLength: 1 })),
    verifySilenceBefore: optionalSchema(booleanSchema({ description: "Run silence verification before playback to ensure a quiet baseline.", default: true }), true),
    verifySilenceAfter: optionalSchema(booleanSchema({ description: "Run silence verification after playback to ensure voices are released.", default: true }), true),
    silenceDurationSeconds: optionalSchema(numberSchema({ description: "Audio capture length used for silence verification.", minimum: 0.5, maximum: 10 }), DEFAULT_SILENCE_DURATION_SECONDS),
    silenceRmsThreshold: optionalSchema(numberSchema({ description: "RMS threshold applied to silence verification captures.", minimum: 0, maximum: 1 }), DEFAULT_RMS_THRESHOLD),
    postSilenceWaitMs: optionalSchema(numberSchema({ description: "Delay between main analysis capture and the post-playback silence check (milliseconds).", minimum: 0, maximum: 5000 }), DEFAULT_POST_SILENCE_WAIT_MS),
  },
  additionalProperties: false,
});

type AnalyzeAudioParams = {
  durationSeconds: number;
  expectedSidwave?: string | Record<string, unknown>;
};

type AnalyzeAudioFn = (options: AnalyzeAudioParams) => Promise<Awaited<ReturnType<typeof recordAndAnalyzeAudio>>>;

interface SilenceCheckOptions {
  durationSeconds: number;
  rmsThreshold: number;
  waitBeforeCaptureMs: number;
  label?: string;
}

interface SilenceCheckResult {
  silent: boolean;
  durationSeconds: number;
  metrics: {
    averageRms: number;
    maxRms: number;
  };
  analysis: Awaited<ReturnType<typeof recordAndAnalyzeAudio>>;
}

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

function resolveAnalyzer(context: ToolExecutionContext): AnalyzeAudioFn {
  const { client } = context;
  if (client && typeof (client as any).recordAndAnalyzeAudio === "function") {
    return (args) => (client as any).recordAndAnalyzeAudio(args);
  }

  return recordAndAnalyzeAudio;
}

function normalizeSidwaveInput(input?: string | Record<string, unknown>): string | Record<string, unknown> | undefined {
  if (typeof input === "string") {
    const trimmed = input.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (input && typeof input === "object") {
    return input;
  }
  return undefined;
}

function extractRmsMetrics(globalMetrics: Record<string, unknown>): { average: number | null; max: number | null } {
  const average = typeof globalMetrics.average_rms === "number" ? globalMetrics.average_rms : null;
  const max = typeof globalMetrics.max_rms === "number" ? globalMetrics.max_rms : null;
  return { average, max };
}

async function performSilenceCheck(
  context: ToolExecutionContext,
  analyzer: AnalyzeAudioFn,
  options: SilenceCheckOptions,
): Promise<SilenceCheckResult> {
  const { logger } = context;
  const label = options.label ?? "silence";

  logger?.debug?.("silence_and_verify: running silence check", {
    stage: label,
    durationSeconds: options.durationSeconds,
    rmsThreshold: options.rmsThreshold,
    waitBeforeCaptureMs: options.waitBeforeCaptureMs,
  });

  await silenceSid(context);

  if (options.waitBeforeCaptureMs > 0) {
    await sleep(options.waitBeforeCaptureMs);
  }

  const analysis = await analyzer({ durationSeconds: options.durationSeconds });
  const metrics = extractRmsMetrics((analysis?.analysis?.global_metrics ?? {}) as Record<string, unknown>);

  if (metrics.average === null && metrics.max === null) {
    throw new ToolExecutionError("Audio analysis did not include RMS metrics", {
      details: { globalMetrics: analysis?.analysis?.global_metrics ?? {} },
    });
  }

  const averageRms = metrics.average ?? metrics.max ?? 0;
  const maxRms = metrics.max ?? metrics.average ?? 0;
  const silent = maxRms <= options.rmsThreshold;

  logger?.debug?.("silence_and_verify: silence check metrics", {
    stage: label,
    averageRms,
    maxRms,
    rmsThreshold: options.rmsThreshold,
    silent,
  });

  return {
    silent,
    durationSeconds: analysis?.analysis?.durationSeconds ?? options.durationSeconds,
    metrics: {
      averageRms,
      maxRms,
    },
    analysis,
  };
}

function normaliseDetails(details: unknown): Record<string, unknown> | null {
  if (details === null || details === undefined) {
    return null;
  }
  if (typeof details === "object") {
    return { ...(details as Record<string, unknown>) };
  }
  return { value: details };
}

export const tools: ToolDefinition[] = [
  {
    name: "silence_and_verify",
    description:
      "Silence all SID voices, capture a short sample, and ensure the output is below an RMS threshold.",
    inputSchema: silenceAndVerifyArgsSchema.jsonSchema,
    async execute(args, context) {
      try {
        const parsed = silenceAndVerifyArgsSchema.parse(args ?? {});
        const durationSeconds = parsed.durationSeconds ?? DEFAULT_SILENCE_DURATION_SECONDS;
        const rmsThreshold = parsed.rmsThreshold ?? DEFAULT_RMS_THRESHOLD;
        const waitBeforeCaptureMs = parsed.waitBeforeCaptureMs ?? DEFAULT_SILENCE_WAIT_MS;

        const analyzer = resolveAnalyzer(context);
        const check = await performSilenceCheck(context, analyzer, {
          durationSeconds,
          rmsThreshold,
          waitBeforeCaptureMs,
          label: "primary",
        });

        return jsonResult(
          {
            silent: check.silent,
            durationSeconds: check.durationSeconds,
            waitBeforeCaptureMs,
            threshold: rmsThreshold,
            metrics: check.metrics,
          },
          {
            success: check.silent,
            silent: check.silent,
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
  {
    name: "music_compile_play_analyze",
    description: "Compile a SIDWAVE score, play it on the C64, capture the output, and analyze the recording.",
    inputSchema: musicCompilePlayAnalyzeArgsSchema.jsonSchema,
    async execute(args, context) {
      try {
        const parsed = musicCompilePlayAnalyzeArgsSchema.parse(args ?? {});

        const source = normalizeSidwaveInput(parsed.sidwave ?? parsed.cpg);
        if (!source) {
          throw new ToolExecutionError("Provide sidwave or cpg source");
        }

        const format = (parsed.output ?? "prg") as "prg" | "sid";
        const waitBeforeCaptureMs = parsed.waitBeforeCaptureMs ?? DEFAULT_PLAYBACK_WAIT_MS;
        const analysisDurationSeconds = parsed.analysisDurationSeconds ?? DEFAULT_ANALYSIS_DURATION_SECONDS;
        const verifySilenceBefore = parsed.verifySilenceBefore ?? true;
        const verifySilenceAfter = parsed.verifySilenceAfter ?? true;
        const silenceDurationSeconds = parsed.silenceDurationSeconds ?? DEFAULT_SILENCE_DURATION_SECONDS;
        const silenceRmsThreshold = parsed.silenceRmsThreshold ?? DEFAULT_RMS_THRESHOLD;
        const postSilenceWaitMs = parsed.postSilenceWaitMs ?? DEFAULT_POST_SILENCE_WAIT_MS;
        const expectedSidwave = normalizeSidwaveInput(parsed.expectedSidwave ?? parsed.sidwave ?? parsed.cpg);

        const analyzer = resolveAnalyzer(context);
        let preSilence: SilenceCheckResult | null = null;
        if (verifySilenceBefore) {
          preSilence = await performSilenceCheck(context, analyzer, {
            durationSeconds: silenceDurationSeconds,
            rmsThreshold: silenceRmsThreshold,
            waitBeforeCaptureMs: DEFAULT_SILENCE_WAIT_MS,
            label: "pre",
          });

          if (!preSilence.silent) {
            throw new ToolExecutionError("Pre-playback silence check failed", {
              details: { metrics: preSilence.metrics },
            });
          }
        }

        const document = parseSidwave(source as any);
        const compiled = compileSidwaveToPrg(document);

        const playbackMethod = format === "sid" ? "sidplay_attachment" : "run_prg";
        let playbackDetails: Record<string, unknown> | null = null;

        if (format === "sid") {
          const sid = compileSidwaveToSid(document, compiled.prg, { entryAddress: compiled.entryAddress });
          const playback = await context.client.sidplayAttachment(sid.sid);
          playbackDetails = normaliseDetails(playback.details);
          if (!playback.success) {
            throw new ToolExecutionError("Playback failed", {
              details: { response: playbackDetails ?? playback.details ?? playback },
            });
          }
        } else {
          const playback = await context.client.runPrg(compiled.prg);
          playbackDetails = normaliseDetails(playback.details);
          if (!playback.success) {
            throw new ToolExecutionError("Playback failed", {
              details: { response: playbackDetails ?? playback.details ?? playback },
            });
          }
        }

        if (waitBeforeCaptureMs > 0) {
          await sleep(waitBeforeCaptureMs);
        }

        const analysisParams: AnalyzeAudioParams = { durationSeconds: analysisDurationSeconds };
        if (expectedSidwave) {
          analysisParams.expectedSidwave = expectedSidwave;
        }

        const analysis = await analyzer(analysisParams);
        const analysisMetrics = extractRmsMetrics((analysis?.analysis?.global_metrics ?? {}) as Record<string, unknown>);

        if (analysisMetrics.average === null && analysisMetrics.max === null) {
          throw new ToolExecutionError("Audio analysis did not include RMS metrics", {
            details: { globalMetrics: analysis?.analysis?.global_metrics ?? {} },
          });
        }

        let postSilence: SilenceCheckResult | null = null;
        if (verifySilenceAfter) {
          if (postSilenceWaitMs > 0) {
            await sleep(postSilenceWaitMs);
          }

          postSilence = await performSilenceCheck(context, analyzer, {
            durationSeconds: silenceDurationSeconds,
            rmsThreshold: silenceRmsThreshold,
            waitBeforeCaptureMs: DEFAULT_SILENCE_WAIT_MS,
            label: "post",
          });

          if (!postSilence.silent) {
            throw new ToolExecutionError("Post-playback silence check failed", {
              details: { metrics: postSilence.metrics },
            });
          }
        } else {
          await silenceSid(context);
        }

        const data = {
          format,
          compilation: {
            entryAddress: compiled.entryAddress,
            prgBytes: compiled.prg.length,
            title: document.song?.title ?? null,
          },
          playback: {
            method: playbackMethod,
            details: playbackDetails,
          },
          analysis,
          analysisMetrics: {
            averageRms: analysisMetrics.average,
            maxRms: analysisMetrics.max,
          },
          silenceChecks: {
            before: preSilence
              ? {
                  silent: preSilence.silent,
                  durationSeconds: preSilence.durationSeconds,
                  metrics: preSilence.metrics,
                }
              : null,
            after: postSilence
              ? {
                  silent: postSilence.silent,
                  durationSeconds: postSilence.durationSeconds,
                  metrics: postSilence.metrics,
                }
              : null,
          },
          settings: {
            waitBeforeCaptureMs,
            analysisDurationSeconds,
            verifySilenceBefore,
            verifySilenceAfter,
            silenceDurationSeconds,
            silenceRmsThreshold,
            postSilenceWaitMs,
          },
        } as const;

        return jsonResult(data, {
          success: true,
          format,
          method: playbackMethod,
          averageRms: analysisMetrics.average,
          maxRms: analysisMetrics.max,
        });
      } catch (error) {
        if (error instanceof ToolExecutionError) {
          return toolErrorResult(error);
        }

        return unknownErrorResult(error);
      }
    },
  },
];
