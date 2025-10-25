import { defineToolModule } from "./types.js";
import {
  booleanSchema,
  numberSchema,
  objectSchema,
  optionalSchema,
  stringSchema,
} from "./schema.js";
import { textResult } from "./responses.js";
import {
  ToolError,
  ToolExecutionError,
  toolErrorResult,
  unknownErrorResult,
} from "./errors.js";

const NOTE_PATTERN = /^([A-Ga-g])([#b]?)(-?\d+)$/;

function toRecord(details: unknown): Record<string, unknown> | undefined {
  if (details && typeof details === "object") {
    return details as Record<string, unknown>;
  }
  return undefined;
}

function normaliseFailure(details: unknown): Record<string, unknown> | undefined {
  if (details === undefined || details === null) {
    return undefined;
  }
  if (typeof details === "object") {
    return details as Record<string, unknown>;
  }
  return { value: details };
}

function normaliseAddress(value: unknown, fallback: string): string {
  if (typeof value === "number") {
    return `$${value.toString(16).toUpperCase().padStart(4, "0")}`;
  }
  if (typeof value === "string" && value.length > 0) {
    return value.startsWith("$") ? value : `$${value.toUpperCase()}`;
  }
  return fallback;
}

const sidVolumeArgsSchema = objectSchema({
  description: "Set the SID master volume (0-15).",
  properties: {
    volume: numberSchema({
      description: "Desired SID master volume. Values outside 0-15 are clamped.",
      minimum: 0,
      maximum: 15,
    }),
  },
  required: ["volume"],
  additionalProperties: false,
});

const sidResetArgsSchema = objectSchema({
  description: "Reset or silence the SID chip.",
  properties: {
    hard: booleanSchema({
      description: "If true, perform a hard register scrub; otherwise silence voices softly.",
      default: false,
    }),
  },
  additionalProperties: false,
});

const sidNoteOnArgsSchema = objectSchema({
  description: "Parameters for starting a SID note on a specific voice.",
  properties: {
    voice: numberSchema({
      description: "SID voice to trigger (1-3).",
      integer: true,
      minimum: 1,
      maximum: 3,
      default: 1,
    }),
    note: optionalSchema(stringSchema({
      description: "Musical note like A4, C#5, or Bb3. Overrides frequencyHz if provided.",
      pattern: NOTE_PATTERN,
    })),
    frequencyHz: optionalSchema(numberSchema({
      description: "Explicit frequency in Hz. Used when note is omitted.",
      minimum: 1,
    })),
    system: stringSchema({
      description: "Video system for frequency calculation.",
      enum: ["PAL", "NTSC"],
      default: "PAL",
    }),
    waveform: stringSchema({
      description: "SID waveform to enable.",
      enum: ["pulse", "saw", "tri", "noise"],
      default: "pulse",
    }),
    pulseWidth: numberSchema({
      description: "Pulse width (0-4095). Used for pulse waveform.",
      integer: true,
      minimum: 0,
      maximum: 0x0fff,
      default: 0x0800,
    }),
    attack: numberSchema({
      description: "Attack rate nibble (0-15).",
      integer: true,
      minimum: 0,
      maximum: 15,
      default: 1,
    }),
    decay: numberSchema({
      description: "Decay rate nibble (0-15).",
      integer: true,
      minimum: 0,
      maximum: 15,
      default: 1,
    }),
    sustain: numberSchema({
      description: "Sustain level nibble (0-15).",
      integer: true,
      minimum: 0,
      maximum: 15,
      default: 15,
    }),
    release: numberSchema({
      description: "Release rate nibble (0-15).",
      integer: true,
      minimum: 0,
      maximum: 15,
      default: 3,
    }),
  },
  additionalProperties: false,
});

const sidNoteOffArgsSchema = objectSchema({
  description: "Parameters for releasing a SID voice.",
  properties: {
    voice: numberSchema({
      description: "SID voice to release (1-3).",
      integer: true,
      minimum: 1,
      maximum: 3,
    }),
  },
  required: ["voice"],
  additionalProperties: false,
});

const sidSilenceArgsSchema = objectSchema<Record<string, never>>({
  description: "No arguments are required to silence all SID voices.",
  properties: {},
  additionalProperties: false,
});

export const audioModule = defineToolModule({
  domain: "audio",
  summary: "SID composition, playback, and audio analysis workflows.",
  resources: [
    "c64://specs/sid",
    "c64://specs/sidwave",
    "c64://docs/sid/file-structure",
  ],
  prompts: ["sid-music"],
  defaultTags: ["sid", "audio"],
  tools: [
    {
      name: "sid_volume",
      description: "Set the SID master volume register at $D418.",
      summary: "Clamps the requested volume and writes it to the SID master volume register.",
      inputSchema: sidVolumeArgsSchema.jsonSchema,
      tags: ["sid", "control"],
      async execute(args, ctx) {
        try {
          const parsed = sidVolumeArgsSchema.parse(args ?? {});
          const appliedVolume = Math.max(0, Math.min(15, Math.floor(parsed.volume)));
          ctx.logger.info("Setting SID master volume", {
            requested: parsed.volume,
            applied: appliedVolume,
          });

          const result = await ctx.client.sidSetVolume(parsed.volume);
          if (!result.success) {
            throw new ToolExecutionError("C64 firmware reported failure while setting SID volume", {
              details: normaliseFailure(result.details),
            });
          }

          const detailRecord = toRecord(result.details) ?? {};
          const address = normaliseAddress(detailRecord.address, "$D418");

          return textResult(`SID master volume set to ${appliedVolume}.`, {
            success: true,
            requestedVolume: parsed.volume,
            appliedVolume,
            address,
            bytes: detailRecord.bytes ?? null,
            details: detailRecord,
          });
        } catch (error) {
          if (error instanceof ToolError) {
            return toolErrorResult(error);
          }
          return unknownErrorResult(error);
        }
      },
    },
    {
      name: "sid_reset",
      description: "Reset the SID chip either softly (silence) or with a full register scrub.",
      summary: "Invokes the Ultimate firmware to silence or fully reset SID registers.",
      inputSchema: sidResetArgsSchema.jsonSchema,
      tags: ["sid", "control"],
      async execute(args, ctx) {
        try {
          const parsed = sidResetArgsSchema.parse(args ?? {});
          ctx.logger.info("Resetting SID", { mode: parsed.hard ? "hard" : "soft" });

          const result = await ctx.client.sidReset(parsed.hard);
          if (!result.success) {
            throw new ToolExecutionError("C64 firmware reported failure while resetting SID", {
              details: normaliseFailure(result.details),
            });
          }

          const detailRecord = toRecord(result.details) ?? {};

          return textResult(`SID ${parsed.hard ? "hard" : "soft"} reset completed.`, {
            success: true,
            mode: parsed.hard ? "hard" : "soft",
            details: detailRecord,
          });
        } catch (error) {
          if (error instanceof ToolError) {
            return toolErrorResult(error);
          }
          return unknownErrorResult(error);
        }
      },
    },
    {
      name: "sid_note_on",
      description: "Trigger a SID voice with configurable waveform, pulse width, and ADSR envelope.",
      summary: "Resolves note or frequency, clamps parameters, and writes the SID voice registers.",
      inputSchema: sidNoteOnArgsSchema.jsonSchema,
      tags: ["sid", "control", "music"],
      async execute(args, ctx) {
        try {
          const parsed = sidNoteOnArgsSchema.parse(args ?? {});
          const voice = Math.max(1, Math.min(3, Math.floor(parsed.voice ?? 1))) as 1 | 2 | 3;
          ctx.logger.info("Starting SID voice", {
            voice,
            note: parsed.note ?? null,
            frequencyHz: parsed.frequencyHz ?? null,
            waveform: parsed.waveform,
          });

          const result = await ctx.client.sidNoteOn({
            voice,
            note: parsed.note ?? undefined,
            frequencyHz: parsed.frequencyHz ?? undefined,
            system: (parsed.system ?? "PAL") as "PAL" | "NTSC",
            waveform: (parsed.waveform ?? "pulse") as "pulse" | "saw" | "tri" | "noise",
            pulseWidth: parsed.pulseWidth,
            attack: parsed.attack,
            decay: parsed.decay,
            sustain: parsed.sustain,
            release: parsed.release,
          });
          if (!result.success) {
            throw new ToolExecutionError("C64 firmware reported failure while starting SID voice", {
              details: normaliseFailure(result.details),
            });
          }

          const detailRecord = toRecord(result.details) ?? {};

          return textResult(`Started SID voice ${voice}${parsed.note ? ` with note ${parsed.note.toUpperCase()}` : ""}.`, {
            success: true,
            voice,
            note: parsed.note ?? null,
            frequencyHz: parsed.frequencyHz ?? null,
            system: parsed.system ?? "PAL",
            waveform: parsed.waveform ?? "pulse",
            pulseWidth: parsed.pulseWidth,
            envelope: {
              attack: parsed.attack,
              decay: parsed.decay,
              sustain: parsed.sustain,
              release: parsed.release,
            },
            details: detailRecord,
          });
        } catch (error) {
          if (error instanceof ToolError) {
            return toolErrorResult(error);
          }
          return unknownErrorResult(error);
        }
      },
    },
    {
      name: "sid_note_off",
      description: "Release a SID voice by clearing its GATE bit.",
      summary: "Writes zero to the selected voice control register to stop playback.",
      inputSchema: sidNoteOffArgsSchema.jsonSchema,
      tags: ["sid", "control", "music"],
      async execute(args, ctx) {
        try {
          const parsed = sidNoteOffArgsSchema.parse(args ?? {});
          const voice = Math.max(1, Math.min(3, Math.floor(parsed.voice))) as 1 | 2 | 3;
          ctx.logger.info("Stopping SID voice", { voice });

          const result = await ctx.client.sidNoteOff(voice);
          if (!result.success) {
            throw new ToolExecutionError("C64 firmware reported failure while stopping SID voice", {
              details: normaliseFailure(result.details),
            });
          }

          const detailRecord = toRecord(result.details) ?? {};

          return textResult(`Released SID voice ${voice}.`, {
            success: true,
            voice,
            details: detailRecord,
          });
        } catch (error) {
          if (error instanceof ToolError) {
            return toolErrorResult(error);
          }
          return unknownErrorResult(error);
        }
      },
    },
    {
      name: "sid_silence_all",
      description: "Silence all SID voices by clearing control and envelope registers.",
      summary: "Performs a soft reset of SID voices, ensuring audio output stops.",
      inputSchema: sidSilenceArgsSchema.jsonSchema,
      tags: ["sid", "control"],
      async execute(args, ctx) {
        try {
          sidSilenceArgsSchema.parse(args ?? {});
          ctx.logger.info("Silencing all SID voices");

          const result = await ctx.client.sidSilenceAll();
          if (!result.success) {
            throw new ToolExecutionError("C64 firmware reported failure while silencing SID", {
              details: normaliseFailure(result.details),
            });
          }

          const detailRecord = toRecord(result.details) ?? {};

          return textResult("SID voices silenced.", {
            success: true,
            details: detailRecord,
          });
        } catch (error) {
          if (error instanceof ToolError) {
            return toolErrorResult(error);
          }
          return unknownErrorResult(error);
        }
      },
    },
  ],
});
