import { defineToolModule } from "./types.js";

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
  tools: [],
});
