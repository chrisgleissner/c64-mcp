import { defineToolModule } from "./types.js";

export const developerModule = defineToolModule({
  domain: "developer",
  summary: "Configuration management, diagnostics, and helper utilities for advanced workflows.",
  resources: [
    "c64://context/bootstrap",
    "c64://docs/index",
  ],
  prompts: ["memory-debug"],
  defaultTags: ["developer", "config", "debug"],
  tools: [],
});
