import { describe, test, mock, beforeEach, expect } from "bun:test";
import { metaModule } from "../../src/tools/meta/index.js";
import { createLogger } from "./helpers.mjs";

function createAnalysis({ averageRms, maxRms, durationSeconds = 1.5 } = {}) {
  return {
    sidwave: 1,
    analysis: {
      source: "microphone",
      durationSeconds,
      voices: [],
      global_metrics: {
        average_pitch_deviation: null,
        detected_bpm: null,
        average_rms: averageRms ?? null,
        max_rms: maxRms ?? null,
      },
    },
  };
}

describe("meta/audio", () => {
  let ctx;

  beforeEach(() => {
    ctx = {
      logger: createLogger(),
      client: {
        sidSilenceAll: mock(async () => ({ success: true })),
        recordAndAnalyzeAudio: mock(async () => createAnalysis({ averageRms: 0.004, maxRms: 0.006 })),
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
});
