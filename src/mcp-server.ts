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
import { createPromptRegistry, type PromptSegment } from "./prompts/registry.js";
import { getPlatformStatus, setPlatform } from "./platform.js";

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
  const promptRegistry = createPromptRegistry();

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

  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    const entries = promptRegistry.list();
    return {
      prompts: entries.map((entry) => ({
        name: entry.descriptor.name,
        title: entry.descriptor.title,
        description: entry.descriptor.description,
        arguments: entry.arguments?.map((argument) => ({
          name: argument.name,
          description: argument.description,
          required: argument.required,
          options: argument.options,
        })),
        _meta: {
          requiredResources: entry.descriptor.requiredResources,
          optionalResources: entry.descriptor.optionalResources ?? [],
          tools: entry.descriptor.tools,
          tags: entry.descriptor.tags ?? [],
        },
      })),
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
        platform: getPlatformStatus(),
        setPlatform,
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

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name } = request.params;
    const args = request.params.arguments ?? {};
    const resolved = promptRegistry.resolve(name, args);

    return {
      description: resolved.description,
      messages: resolved.messages.map(toPromptMessage),
      _meta: {
        arguments: resolved.arguments,
        resources: resolved.resources.map((resource) => ({
          uri: resource.uri,
          name: resource.name,
          description: resource.description,
          mimeType: resource.mimeType,
          metadata: resource.metadata,
        })),
        tools: resolved.tools,
      },
    };
  });

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error("c64-mcp MCP server running on stdio");
}

function toCallToolResult(result: ToolRunResult): {
  content: ToolRunResult["content"];
  structuredContent?: ToolRunResult["structuredContent"];
  metadata?: ToolRunResult["metadata"];
} {
  const base: {
    content: ToolRunResult["content"];
    structuredContent?: ToolRunResult["structuredContent"];
    metadata?: ToolRunResult["metadata"];
  } = { content: result.content };

  if (result.structuredContent !== undefined) {
    base.structuredContent = result.structuredContent;
  }
  if (result.metadata !== undefined) {
    base.metadata = result.metadata;
  }

  return base;
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

function toPromptMessage(segment: PromptSegment): {
  role: "assistant" | "user";
  content: { type: "text"; text: string };
} {
  const role = segment.role === "user" ? "user" : "assistant";
  return {
    role,
    content: {
      type: "text",
      text: segment.content,
    },
  };
}

main().catch((error) => {
  console.error("Fatal error in MCP server:", error);
  process.exit(1);
});
