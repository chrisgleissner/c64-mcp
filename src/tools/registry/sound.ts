import {
  createOperationDispatcher,
  defineToolModule,
  discriminatedUnionSchema,
} from "../types.js";
import { audioModule } from "../audio.js";
import { metaModule } from "../meta/index.js";
import {
  buildDescriptorIndex,
  ensureDescriptor,
  extendSchemaWithOp,
  createOperationHandlers,
  invokeModuleTool,
  type GroupedOperationConfig,
  type GenericOperationMap,
} from "./utils.js";

const audioDescriptorIndex = buildDescriptorIndex(audioModule);
const metaDescriptorIndex = buildDescriptorIndex(metaModule);

const soundOperations: GroupedOperationConfig[] = [
  {
    op: "set_volume",
    schema: extendSchemaWithOp(
      "set_volume",
      ensureDescriptor(audioDescriptorIndex, "sid_volume").inputSchema,
      { description: "Set the SID master volume register at $D418 (0-15)." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(audioModule, "sid_volume", rawArgs, ctx),
  },
  {
    op: "reset",
    schema: extendSchemaWithOp(
      "reset",
      ensureDescriptor(audioDescriptorIndex, "sid_reset").inputSchema,
      { description: "Soft or hard reset of SID registers to clear glitches." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(audioModule, "sid_reset", rawArgs, ctx),
  },
  {
    op: "note_on",
    schema: extendSchemaWithOp(
      "note_on",
      ensureDescriptor(audioDescriptorIndex, "sid_note_on").inputSchema,
      { description: "Trigger a SID voice with configurable waveform, ADSR, and pitch." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(audioModule, "sid_note_on", rawArgs, ctx),
  },
  {
    op: "note_off",
    schema: extendSchemaWithOp(
      "note_off",
      ensureDescriptor(audioDescriptorIndex, "sid_note_off").inputSchema,
      { description: "Release a SID voice by clearing its gate bit." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(audioModule, "sid_note_off", rawArgs, ctx),
  },
  {
    op: "silence_all",
    schema: extendSchemaWithOp(
      "silence_all",
      ensureDescriptor(audioDescriptorIndex, "sid_silence_all").inputSchema,
      { description: "Silence all SID voices with optional audio verification." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(audioModule, "sid_silence_all", rawArgs, ctx),
  },
  {
    op: "play_sid_file",
    schema: extendSchemaWithOp(
      "play_sid_file",
      ensureDescriptor(audioDescriptorIndex, "sidplay_file").inputSchema,
      { description: "Play a SID file stored on the Ultimate filesystem." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(audioModule, "sidplay_file", rawArgs, ctx),
  },
  {
    op: "play_mod_file",
    schema: extendSchemaWithOp(
      "play_mod_file",
      ensureDescriptor(audioDescriptorIndex, "modplay_file").inputSchema,
      { description: "Play a MOD tracker module via the Ultimate SID player." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(audioModule, "modplay_file", rawArgs, ctx),
  },
  {
    op: "generate",
    schema: extendSchemaWithOp(
      "generate",
      ensureDescriptor(audioDescriptorIndex, "music_generate").inputSchema,
      { description: "Generate a lightweight SID arpeggio playback sequence." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(audioModule, "music_generate", rawArgs, ctx),
  },
  {
    op: "compile_play",
    schema: extendSchemaWithOp(
      "compile_play",
      ensureDescriptor(audioDescriptorIndex, "music_compile_and_play").inputSchema,
      { description: "Compile SIDWAVE or CPG source and optionally play it immediately." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(audioModule, "music_compile_and_play", rawArgs, ctx),
  },
  {
    op: "pipeline",
    schema: extendSchemaWithOp(
      "pipeline",
      ensureDescriptor(metaDescriptorIndex, "music_compile_play_analyze").inputSchema,
      { description: "Compile a SIDWAVE score, play it, and analyze the recording." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(metaModule, "music_compile_play_analyze", rawArgs, ctx),
  },
  {
    op: "analyze",
    schema: extendSchemaWithOp(
      "analyze",
      ensureDescriptor(audioDescriptorIndex, "analyze_audio").inputSchema,
      { description: "Automatically analyze SID playback when verification is requested." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(audioModule, "analyze_audio", rawArgs, ctx),
  },
  {
    op: "record_analyze",
    schema: extendSchemaWithOp(
      "record_analyze",
      ensureDescriptor(audioDescriptorIndex, "record_and_analyze_audio").inputSchema,
      { description: "Record audio for a fixed duration and return SID analysis metrics." },
    ),
    handler: async (rawArgs, ctx) => invokeModuleTool(audioModule, "record_and_analyze_audio", rawArgs, ctx),
  },
];

const soundOperationHandlers = createOperationHandlers(soundOperations);

export const soundModuleGroup = defineToolModule({
  domain: "audio",
  summary: "Grouped SID control, playback, composition, and analysis operations.",
  resources: ["c64://specs/sid", "c64://specs/sidwave", "c64://docs/sid/file-structure"],
  prompts: ["sid-music"],
  defaultTags: ["sid", "audio"],
  workflowHints: [
    "Trigger note_on or generate when the user wants immediate SID playback.",
    "Follow up playback changes with analyze or silence verification to provide confident audio feedback.",
  ],
  tools: [
    {
      name: "c64_sound",
      description: "Grouped entry point for SID control, playback, composition, and analysis workflows.",
      summary: "Adjusts SID registers, plays files, composes music, and runs verification captures.",
      inputSchema: discriminatedUnionSchema({
        description: "Sound operations available via the c64_sound tool.",
        variants: soundOperations.map((operation) => operation.schema),
      }),
      tags: ["sid", "audio", "grouped"],
      examples: [
        {
          name: "Trigger SID voice",
          description: "Start voice 1 on C4 with a triangle waveform",
          arguments: { op: "note_on", voice: 1, note: "C4", waveform: "tri" },
        },
        {
          name: "Verify silence",
          description: "Stop all voices and confirm the SID output is quiet",
          arguments: { op: "silence_all", verify: true },
        },
      ],
      execute: createOperationDispatcher<GenericOperationMap>(
        "c64_sound",
        soundOperationHandlers,
      ),
    },
  ],
});
