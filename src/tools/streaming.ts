import { defineToolModule } from "./types.js";

export const streamingModule = defineToolModule({
  domain: "streaming",
  summary: "Long-running or streaming workflows such as audio capture or SID playback monitoring.",
  resources: [
    "c64://specs/sid",
    "c64://docs/index",
  ],
  prompts: ["sid-music"],
  defaultLifecycle: "stream",
  defaultTags: ["stream", "monitoring"],
  tools: [],
});
