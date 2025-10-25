import { defineToolModule } from "./types.js";

export const storageModule = defineToolModule({
  domain: "storage",
  summary: "Drive management, disk image creation, and file inspection utilities.",
  resources: ["c64://context/bootstrap"],
  prompts: ["memory-debug"],
  defaultTags: ["drive", "storage"],
  tools: [],
});
