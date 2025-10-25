import { defineToolModule } from "./types.js";

export const graphicsModule = defineToolModule({
  domain: "graphics",
  summary: "PETSCII art, sprite workflows, and VIC-II graphics helpers.",
  resources: [
    "c64://specs/vic",
    "c64://specs/assembly",
  ],
  prompts: ["graphics-demo", "basic-program", "assembly-program"],
  defaultTags: ["graphics", "vic"],
  tools: [],
});
