import { describe, test, mock, beforeEach, expect } from "bun:test";
import { metaModule } from "../../src/tools/meta/index.js";
import { createLogger } from "./helpers.mjs";

function createAnalysis({ averageRms, maxRms, durationSeconds = 1.5, voices = [] } = {}) {
  return {
    sidwave: 1,
    analysis: {
      source: "microphone",
      durationSeconds,
      voices,
      global_metrics: {
        average_pitch_deviation: null,
        detected_bpm: null,
        average_rms: averageRms ?? null,
        max_rms: maxRms ?? null,
      },
    },
  };
}

const SAMPLE_SIDWAVE = `
song:
  title: "Meta Test"
  mode: PAL
  tempo: 110
voices:
  - id: 1
    name: "Lead"
    waveform: triangle
    patterns:
      main:
        notes: ["C4", "E4", "G4", "C5"]
timeline:
  - bars: 1
    layers: { v1: main }
`;

describe("meta/audio", () => {
  let ctx;

  beforeEach(() => {
    ctx = {
      logger: createLogger(),
      client: {
        sidSilenceAll: mock(async () => ({ success: true })),
        recordAndAnalyzeAudio: mock(async () => createAnalysis({ averageRms: 0.004, maxRms: 0.006 })),
        runPrg: mock(async () => ({ success: true, details: { run: true } })),
        sidplayAttachment: mock(async () => ({ success: true, details: { played: true } })),
      },
    };
  });

  test("silence_and_verify succeeds when RMS below threshold", async () => {
    const result = await metaModule.invoke(
      "silence_and_verify",
      { durationSeconds: 1, rmsThreshold: 0.01, waitBeforeCaptureMs: 0 },
      ctx,
    );

    expect(result.metadata.success).toBe(true);
    expect(result.metadata.silent).toBe(true);
    expect(result.structuredContent.data.silent).toBe(true);
    expect(result.structuredContent.data.metrics.maxRms).toBeCloseTo(0.006);
    expect(ctx.client.sidSilenceAll).toHaveBeenCalledTimes(1);
    expect(ctx.client.recordAndAnalyzeAudio).toHaveBeenCalledWith({ durationSeconds: 1 });
  });

  test("silence_and_verify reports noise when threshold exceeded", async () => {
    ctx.client.recordAndAnalyzeAudio = mock(async () => createAnalysis({ averageRms: 0.02, maxRms: 0.03 }));

    const result = await metaModule.invoke(
      "silence_and_verify",
      { rmsThreshold: 0.01, waitBeforeCaptureMs: 0 },
      ctx,
    );

    expect(result.metadata.success).toBe(false);
    expect(result.metadata.silent).toBe(false);
    expect(result.structuredContent.data.silent).toBe(false);
    expect(result.structuredContent.data.metrics.maxRms).toBeCloseTo(0.03);
  });

  test("silence_and_verify surfaces silencing failure", async () => {
    ctx.client.sidSilenceAll = mock(async () => ({ success: false, error: "bad" }));

    const result = await metaModule.invoke(
      "silence_and_verify",
      { waitBeforeCaptureMs: 0, durationSeconds: 0.5 },
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(result.metadata.error?.kind).toBe("execution");
    expect(result.metadata.error?.details?.response?.error).toBe("bad");
  });

  test("silence_and_verify errors when RMS metrics missing", async () => {
    ctx.client.recordAndAnalyzeAudio = mock(async () => createAnalysis({ averageRms: null, maxRms: null }));

    const result = await metaModule.invoke(
      "silence_and_verify",
      { waitBeforeCaptureMs: 0, durationSeconds: 0.5 },
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(result.metadata.error?.kind).toBe("execution");
  });

  test("music_compile_play_analyze compiles, plays, analyzes, and verifies silence", async () => {
    const responses = [
      createAnalysis({ averageRms: 0.003, maxRms: 0.004 }),
      createAnalysis({ averageRms: 0.06, maxRms: 0.09, durationSeconds: 1, voices: [{ id: 1, detected_notes: [{ note: "C4", frequency: 262, duration: 0.4 }] }] }),
      createAnalysis({ averageRms: 0.002, maxRms: 0.003 }),
    ];
    ctx.client.recordAndAnalyzeAudio = mock(async () => responses.shift() ?? createAnalysis({ averageRms: 0.002, maxRms: 0.003 }));

    const result = await metaModule.invoke(
      "music_compile_play_analyze",
      {
        sidwave: SAMPLE_SIDWAVE,
        waitBeforeCaptureMs: 0,
        analysisDurationSeconds: 1,
        silenceDurationSeconds: 0.5,
        postSilenceWaitMs: 0,
      },
      ctx,
    );

    expect(result.metadata.success).toBe(true);
    const data = result.structuredContent?.data ?? {};
    expect(data.playback?.method).toBe("run_prg");
    expect(data.analysisMetrics?.maxRms).toBeCloseTo(0.09);
    expect(data.silenceChecks?.before?.silent).toBe(true);
    expect(data.silenceChecks?.after?.silent).toBe(true);
    expect(ctx.client.runPrg).toHaveBeenCalledTimes(1);
    expect(ctx.client.sidSilenceAll).toHaveBeenCalledTimes(2);
    expect(ctx.client.recordAndAnalyzeAudio).toHaveBeenCalledTimes(3);
  });

  test("music_compile_play_analyze surfaces playback failure", async () => {
    ctx.client.runPrg = mock(async () => ({ success: false, details: { error: "playback" } }));
    ctx.client.recordAndAnalyzeAudio = mock(async () => createAnalysis({ averageRms: 0.003, maxRms: 0.004 }));

    const result = await metaModule.invoke(
      "music_compile_play_analyze",
      {
        sidwave: SAMPLE_SIDWAVE,
        waitBeforeCaptureMs: 0,
        verifySilenceBefore: false,
        verifySilenceAfter: false,
      },
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(result.metadata.error?.kind).toBe("execution");
    expect(result.metadata.error?.details?.response?.error).toBe("playback");
  });

  test("music_compile_play_analyze fails when post-silence check detects residual audio", async () => {
    const responses = [
      createAnalysis({ averageRms: 0.003, maxRms: 0.004 }),
      createAnalysis({ averageRms: 0.05, maxRms: 0.08 }),
      createAnalysis({ averageRms: 0.03, maxRms: 0.04 }),
    ];
    ctx.client.recordAndAnalyzeAudio = mock(async () => responses.shift() ?? createAnalysis({ averageRms: 0.03, maxRms: 0.04 }));

    const result = await metaModule.invoke(
      "music_compile_play_analyze",
      {
        sidwave: SAMPLE_SIDWAVE,
        waitBeforeCaptureMs: 0,
        postSilenceWaitMs: 0,
        silenceRmsThreshold: 0.02,
      },
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(result.metadata.error?.kind).toBe("execution");
    expect(result.metadata.error?.details?.metrics?.maxRms).toBeGreaterThan(0.02);
  });
});
