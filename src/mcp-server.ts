#!/usr/bin/env node
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
import {
  listKnowledgeResources,
  readKnowledgeResource,
} from "./rag/knowledgeIndex.js";

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
    const resources = listKnowledgeResources();
    return {
      resources: resources.map((resource) => ({
        uri: resource.uri,
        name: resource.name,
        description: resource.description,
        mimeType: resource.mimeType,
        metadata: resource.metadata,
      })),
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const result = readKnowledgeResource(request.params.uri, PROJECT_ROOT);
    if (!result) {
      throw new Error(`Unknown resource: ${request.params.uri}`);
    }

    return {
      contents: [result],
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
