import { defineToolModule } from "./types.js";

export const printerModule = defineToolModule({
  domain: "printer",
  summary: "Printer workflow helpers for Commodore MPS and Epson FX devices, including prompt templates.",
  resources: [
    "c64://specs/printer",
    "c64://docs/printer/guide",
    "c64://docs/printer/commodore-text",
    "c64://docs/printer/commodore-bitmap",
    "c64://docs/printer/epson-text",
    "c64://docs/printer/epson-bitmap",
    "c64://docs/printer/prompts",
  ],
  prompts: ["printer-job"],
  defaultTags: ["printer"],
  tools: [],
});
