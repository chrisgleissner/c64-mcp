#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./config.js";
import { C64Client } from "./c64Client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "..");

async function main() {
  console.error("Starting c64-mcp MCP server...");

  const config = loadConfig();
  const baseUrl = config.baseUrl ?? `http://${config.c64_host}`;
  
  // Initialize C64 client (reuse existing)
  const client = new C64Client(baseUrl);

  // Create MCP server
  const server = new Server(
    {
      name: "c64-mcp",
      version: "0.3.0",
    },
    {
      capabilities: {
        resources: {},
        tools: {},
        prompts: {},
      },
    }
  );

  // RESOURCES: Expose C64 knowledge base
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: "c64://context/bootstrap",
          name: "Workflow Rules & Best Practices",
          description: "CRITICAL: Mandatory workflow rules for all C64 programming",
          mimeType: "text/markdown",
        },
        {
          uri: "c64://specs/basic",
          name: "Commodore BASIC v2 Specification",
          description: "Complete BASIC v2 reference. READ THIS BEFORE generating any BASIC code!",
          mimeType: "text/markdown",
        },
        {
          uri: "c64://specs/assembly",
          name: "6502/6510 Assembly Reference",
          description: "Full instruction set and addressing modes. READ THIS BEFORE generating assembly!",
          mimeType: "text/markdown",
        },
        {
          uri: "c64://specs/sid",
          name: "SID Chip Programming Guide",
          description: "Sound Interface Device registers and music programming",
          mimeType: "text/markdown",
        },
        {
          uri: "c64://specs/sidwave",
          name: "SIDWAVE Music Format Specification",
          description: "YAML/JSON music composition format for SID chip",
          mimeType: "text/markdown",
        },
        {
          uri: "c64://specs/vic",
          name: "VIC-II Graphics Specification",
          description: "Video chip, sprites, raster programming, and timing",
          mimeType: "text/markdown",
        },
        {
          uri: "c64://specs/printer",
          name: "Printer Programming Guide",
          description: "Commodore MPS and Epson FX printer control",
          mimeType: "text/markdown",
        },
      ],
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;

    const resourceMap: Record<string, string> = {
      "c64://context/bootstrap": "data/context/bootstrap.md",
      "c64://specs/basic": "data/basic/basic-spec.md",
      "c64://specs/assembly": "data/assembly/assembly-spec.md",
      "c64://specs/sid": "data/audio/sid-spec.md",
      "c64://specs/sidwave": "data/audio/sidwave.md",
      "c64://specs/vic": "data/video/vic-spec.md",
      "c64://specs/printer": "data/printer/printer-spec.md",
    };

    const filePath = resourceMap[uri];
    if (!filePath) {
      throw new Error(`Unknown resource: ${uri}`);
    }

    const fullPath = join(PROJECT_ROOT, filePath);
    const content = readFileSync(fullPath, "utf-8");

    return {
      contents: [
        {
          uri,
          mimeType: "text/markdown",
          text: content,
        },
      ],
    };
  });

  // TODO: Add handlers in subsequent steps

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error("c64-mcp MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in MCP server:", error);
  process.exit(1);
});
