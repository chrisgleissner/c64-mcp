// Meta module: aggregates all meta tools and marks them as experimental
import { defineToolModule } from "../types.js";
import { tools as diagnosticsTools } from "./diagnostics.js";
import { tools as screenTools } from "./screen.js";
import { tools as memoryTools } from "./memory.js";
import { tools as backgroundTools } from "./background.js";
import { tools as filesystemTools } from "./filesystem.js";
import { tools as configTools } from "./config.js";
import { tools as programTools } from "./program.js";
import { tools as artifactsTools } from "./artifacts.js";
import { tools as compilationTools } from "./compilation.js";

// Aggregate all tools from submodules
const allTools = [
  ...diagnosticsTools,
  ...screenTools,
  ...memoryTools,
  ...backgroundTools,
  ...filesystemTools,
  ...configTools,
  ...programTools,
  ...artifactsTools,
  ...compilationTools,
];

export const metaModule = defineToolModule({
  domain: "meta",
  summary: "High-level meta tools that orchestrate multiple MCP actions.",
  resources: ["c64://context/bootstrap", "c64://specs/assembly"],
  defaultTags: ["meta", "orchestration", "experimental"],
  workflowHints: [
    "Use meta tools to reduce round-trips by composing several steps into one.",
  ],
  tools: allTools,
});
