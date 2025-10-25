import { defineToolModule } from "./types.js";

export const machineControlModule = defineToolModule({
  domain: "machine",
  summary: "Power, reset, pause/resume, and diagnostic controls for the C64 and Ultimate hardware.",
  resources: ["c64://context/bootstrap"],
  prompts: ["memory-debug"],
  defaultTags: ["machine", "control"],
  tools: [],
});
