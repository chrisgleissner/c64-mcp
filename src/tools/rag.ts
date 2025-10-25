import { defineToolModule } from "./types.js";

export const ragModule = defineToolModule({
  domain: "rag",
  summary: "Retrieval-augmented generation helpers for BASIC and assembly examples.",
  resources: [
    "c64://specs/basic",
    "c64://specs/assembly",
    "c64://docs/index",
  ],
  prompts: ["basic-program", "assembly-program"],
  defaultTags: ["rag", "search"],
  tools: [],
});
