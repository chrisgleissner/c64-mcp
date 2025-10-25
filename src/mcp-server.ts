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
import { initRag } from "./rag/init.js";
import { toolRegistry } from "./tools/registry.js";
import { unknownErrorResult } from "./tools/errors.js";
import type { ToolLogger, ToolRunResult } from "./tools/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "..");

async function main() {
  console.error("Starting c64-mcp MCP server...");

  const config = loadConfig();
  const baseUrl = config.baseUrl ?? `http://${config.c64_host}`;
  
  // Initialize C64 client (reuse existing)
  const client = new C64Client(baseUrl);
  const rag = await initRag();

  const toolLogger = createToolLogger();

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

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: toolRegistry.list(),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name } = request.params;
    const args = request.params.arguments ?? {};
    const startedAt = Date.now();

    toolLogger.debug(`Invoking tool ${name}`, {
      hasArguments: args && typeof args === "object" && Object.keys(args).length > 0,
    });

    try {
      const result = await toolRegistry.invoke(name, args, {
        client,
        rag,
        logger: toolLogger,
      });

      toolLogger.debug(`Tool ${name} completed`, {
        durationMs: Date.now() - startedAt,
      });

      return toCallToolResult(result);
    } catch (error) {
      toolLogger.error(`Tool ${name} failed`, {
        durationMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : String(error),
      });
      return toCallToolResult(unknownErrorResult(error));
    }
  });

  // TODO: Add handlers in subsequent steps

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error("c64-mcp MCP server running on stdio");
}

function toCallToolResult(result: ToolRunResult): {
  content: ToolRunResult["content"];
  metadata?: ToolRunResult["metadata"];
} {
  if (result.metadata !== undefined) {
    return { content: result.content, metadata: result.metadata };
  }
  return { content: result.content };
}

function createToolLogger(): ToolLogger {
  const log = (level: "debug" | "info" | "warn" | "error", message: string, details?: Record<string, unknown>) => {
    if (process.env.NODE_ENV === "test") {
      return;
    }

    const method = (console[level] as ((...args: unknown[]) => void) | undefined) ?? console.log;
    const payload = details && Object.keys(details).length > 0 ? details : undefined;
    if (payload) {
      method(`[tools] ${message}`, payload);
    } else {
      method(`[tools] ${message}`);
    }
  };

  return {
    debug(message, details) {
      log("debug", message, details);
    },
    info(message, details) {
      log("info", message, details);
    },
    warn(message, details) {
      log("warn", message, details);
    },
    error(message, details) {
      log("error", message, details);
    },
  };
}

main().catch((error) => {
  console.error("Fatal error in MCP server:", error);
  process.exit(1);
});
