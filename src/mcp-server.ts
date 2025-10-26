#!/usr/bin/env node
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
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
import type { RagRetriever } from "./rag/types.js";
import { toolRegistry } from "./tools/registry.js";
import { unknownErrorResult } from "./tools/errors.js";
import type { ToolRunResult } from "./tools/types.js";
import { createPromptRegistry, type PromptSegment } from "./prompts/registry.js";
import { describePlatformCapabilities, getPlatformStatus, setPlatform } from "./platform.js";
import axios, { type AxiosResponse } from "axios";
import { loggerFor, payloadByteLength, formatPayloadForDebug, formatErrorMessage } from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "..");

type CliOptions = { mode: "stdio" } | { mode: "http"; port?: number };

interface ServerRuntimeContext {
  client: C64Client;
  rag: RagRetriever;
  baseUrl: string;
}

function parseCliOptions(argv: string[]): CliOptions {
  const httpIndex = argv.indexOf("--http");
  if (httpIndex === -1) {
    return { mode: "stdio" };
  }
  const portCandidate = argv[httpIndex + 1];
  return { mode: "http", port: parsePort(portCandidate) };
}

function parsePort(raw?: string): number | undefined {
  if (!raw || raw.startsWith("--")) {
    return undefined;
  }
  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535) {
    return parsed;
  }
  return undefined;
}

async function main() {
  console.error("Starting c64-mcp MCP server...");

  const config = loadConfig();
  const baseUrl = config.baseUrl ?? `http://${config.c64_host}`;
  
  // Initialize C64 client (reuse existing)
  const client = new C64Client(baseUrl);
  const rag = await initRag();

  const toolLogger = loggerFor("tool");
  const resourceLogger = loggerFor("resource");
  const promptLogger = loggerFor("prompt");
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
    const startedAt = Date.now();
    try {
      const knowledgeResources = listKnowledgeResources().map((resource) => ({
        uri: resource.uri,
        name: resource.name,
        description: resource.description,
        mimeType: resource.mimeType,
        metadata: resource.metadata,
      }));

      const platformResource = createPlatformResourceDescriptor();

      const response = {
        resources: [...knowledgeResources, platformResource],
      };

      const latency = Date.now() - startedAt;
      const bytes = payloadByteLength(response);
      resourceLogger.info(`list resources count=${response.resources.length} bytes=${bytes} latencyMs=${latency}`);

      if (resourceLogger.isDebugEnabled()) {
        resourceLogger.debug("list resources request", { request: {} });
        resourceLogger.debug("list resources response", { response: formatPayloadForDebug(response) });
      }

      return response;
    } catch (error) {
      const latency = Date.now() - startedAt;
      resourceLogger.error(`list resources failed bytes=0 latencyMs=${latency} error=${formatErrorMessage(error)}`);
      if (resourceLogger.isDebugEnabled()) {
        resourceLogger.debug("list resources request", { request: {} });
        resourceLogger.debug("list resources error", { error: formatErrorMessage(error) });
      }
      throw error;
    }
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const startedAt = Date.now();
    try {
      let response;
      if (request.params.uri === PLATFORM_RESOURCE_URI) {
        response = {
          contents: [
            {
              uri: PLATFORM_RESOURCE_URI,
              mimeType: "text/markdown",
              text: renderPlatformStatusMarkdown(),
            },
          ],
        };
      } else {
        const result = readKnowledgeResource(request.params.uri, PROJECT_ROOT);
        if (!result) {
          throw new Error(`Unknown resource: ${request.params.uri}`);
        }
        response = {
          contents: [result],
        };
      }

      const latency = Date.now() - startedAt;
      const bytes = payloadByteLength(response);
      resourceLogger.info(`read resource uri=${request.params.uri} bytes=${bytes} latencyMs=${latency}`);

      if (resourceLogger.isDebugEnabled()) {
        resourceLogger.debug("read resource request", { request: formatPayloadForDebug(request.params) });
        resourceLogger.debug("read resource response", { response: formatPayloadForDebug(response) });
      }

      return response;
    } catch (error) {
      const latency = Date.now() - startedAt;
      resourceLogger.error(`read resource uri=${request.params.uri} bytes=0 latencyMs=${latency} error=${formatErrorMessage(error)}`);
      if (resourceLogger.isDebugEnabled()) {
        resourceLogger.debug("read resource request", { request: formatPayloadForDebug(request.params) });
        resourceLogger.debug("read resource error", { error: formatErrorMessage(error) });
      }
      throw error;
    }
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const startedAt = Date.now();
    try {
      const response = {
        tools: toolRegistry.list(),
      };
      const latency = Date.now() - startedAt;
      const bytes = payloadByteLength(response);
      toolLogger.info(`list tools count=${response.tools.length} bytes=${bytes} latencyMs=${latency}`);

      if (toolLogger.isDebugEnabled()) {
        toolLogger.debug("list tools request", { request: {} });
        toolLogger.debug("list tools response", { response: formatPayloadForDebug(response) });
      }

      return response;
    } catch (error) {
      const latency = Date.now() - startedAt;
      toolLogger.error(`list tools failed bytes=0 latencyMs=${latency} error=${formatErrorMessage(error)}`);
      if (toolLogger.isDebugEnabled()) {
        toolLogger.debug("list tools request", { request: {} });
        toolLogger.debug("list tools error", { error: formatErrorMessage(error) });
      }
      throw error;
    }
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    const startedAt = Date.now();
    try {
      const entries = promptRegistry.list();
      const response = {
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

      const latency = Date.now() - startedAt;
      const bytes = payloadByteLength(response);
      promptLogger.info(`list prompts count=${response.prompts.length} bytes=${bytes} latencyMs=${latency}`);

      if (promptLogger.isDebugEnabled()) {
        promptLogger.debug("list prompts request", { request: {} });
        promptLogger.debug("list prompts response", { response: formatPayloadForDebug(response) });
      }

      return response;
    } catch (error) {
      const latency = Date.now() - startedAt;
      promptLogger.error(`list prompts failed bytes=0 latencyMs=${latency} error=${formatErrorMessage(error)}`);
      if (promptLogger.isDebugEnabled()) {
        promptLogger.debug("list prompts request", { request: {} });
        promptLogger.debug("list prompts error", { error: formatErrorMessage(error) });
      }
      throw error;
    }
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name } = request.params;
    const args = request.params.arguments ?? {};
    const startedAt = Date.now();
    if (toolLogger.isDebugEnabled()) {
      toolLogger.debug("tool request", {
        name,
        arguments: formatPayloadForDebug(args),
      });
    }

    try {
      const result = await toolRegistry.invoke(name, args, {
        client,
        rag,
        logger: toolLogger,
        platform: getPlatformStatus(),
        setPlatform,
      });

      const response = toCallToolResult(result);
      const latency = Date.now() - startedAt;
      const bytes = payloadByteLength(response);
      const status = result.isError ? "error" : "ok";

      toolLogger.info(`call tool name=${name} status=${status} bytes=${bytes} latencyMs=${latency}`);

      if (toolLogger.isDebugEnabled()) {
        toolLogger.debug("tool response", {
          name,
          response: formatPayloadForDebug(response),
        });
      }

      return response;
    } catch (error) {
      const latency = Date.now() - startedAt;
      const fallback = unknownErrorResult(error);
      const response = toCallToolResult(fallback);
      const bytes = payloadByteLength(response);

      toolLogger.error(`call tool name=${name} status=failed bytes=${bytes} latencyMs=${latency} error=${formatErrorMessage(error)}`);

      if (toolLogger.isDebugEnabled()) {
        toolLogger.debug("tool response", {
          name,
          response: formatPayloadForDebug(response),
          error: formatErrorMessage(error),
        });
      }

      return response;
    }
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name } = request.params;
    const args = request.params.arguments ?? {};
    const startedAt = Date.now();

    if (promptLogger.isDebugEnabled()) {
      promptLogger.debug("prompt request", {
        name,
        arguments: formatPayloadForDebug(args),
      });
    }

    try {
      const resolved = promptRegistry.resolve(name, args);

      const response = {
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

      const latency = Date.now() - startedAt;
      const bytes = payloadByteLength(response);
      promptLogger.info(`get prompt name=${name} bytes=${bytes} latencyMs=${latency}`);

      if (promptLogger.isDebugEnabled()) {
        promptLogger.debug("prompt response", {
          name,
          response: formatPayloadForDebug(response),
        });
      }

      return response;
    } catch (error) {
      const latency = Date.now() - startedAt;
      promptLogger.error(`get prompt name=${name} bytes=0 latencyMs=${latency} error=${formatErrorMessage(error)}`);
      if (promptLogger.isDebugEnabled()) {
        promptLogger.debug("prompt request", {
          name,
          arguments: formatPayloadForDebug(args),
        });
        promptLogger.debug("prompt error", { name, error: formatErrorMessage(error) });
      }
      throw error;
    }
  });

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  await logConnectivity(client, baseUrl);
  
  console.error("c64-mcp MCP server running on stdio");
}

const PLATFORM_RESOURCE_URI = "c64://platform/status";

function createPlatformResourceDescriptor() {
  return {
    uri: PLATFORM_RESOURCE_URI,
    name: "Active Platform Status",
    description: "Reports the active MCP platform and tool compatibility snapshot.",
    mimeType: "text/markdown",
    metadata: {
      domain: "platform",
      priority: "critical",
      summary: "Current platform (c64u or vice), feature flags, and tool support overview.",
      prompts: [],
      tools: [],
      tags: ["platform", "compatibility"],
      relatedResources: [],
    },
  };
}

function renderPlatformStatusMarkdown(): string {
  const status = getPlatformStatus();
  const capabilities = describePlatformCapabilities(toolRegistry.list());

  const lines: string[] = [
    "# MCP Platform Status",
    "",
    `Current platform: \`${status.id}\``,
    "",
    status.features.length > 0
      ? ["## Active Features", "", ...status.features.map((feature) => `- ${feature}`)].join("\n")
      : "",
    status.limitedFeatures.length > 0
      ? ["## Limited or Unavailable Features", "", ...status.limitedFeatures.map((feature) => `- ${feature}`)].join("\n")
      : "",
    "## Tool Compatibility",
    "",
  ].filter(Boolean);

  for (const [platformId, info] of Object.entries(capabilities.platforms)) {
    lines.push(`### ${platformId.toUpperCase()}`);
    lines.push("");
    lines.push(
      info.tools.length > 0
        ? `- Supported tools (${info.tools.length}): ${info.tools.map((tool) => `\`${tool}\``).join(", ")}`
        : "- Supported tools: _none_",
    );
    lines.push(
      info.unsupported_tools.length > 0
        ? `- Unsupported tools (${info.unsupported_tools.length}): ${info.unsupported_tools
            .map((tool) => `\`${tool}\``)
            .join(", ")}`
        : "- Unsupported tools: _none_",
    );
    lines.push("");
  }

  lines.push(
    "> Switching platforms currently requires restarting the MCP server with an updated configuration.",
  );

  return lines.join("\n");
}

async function logConnectivity(client: C64Client, baseUrl: string): Promise<void> {
  const c64Logger = loggerFor("c64u");
  const startedAt = Date.now();
  let response: AxiosResponse | null = null;

  try {
    const probeResponse = await axios.get(baseUrl, { timeout: 2000 });
    response = probeResponse;
    const latency = Date.now() - startedAt;
    const bytes = payloadByteLength(probeResponse.data);
    c64Logger.info(`GET ${baseUrl} status=${probeResponse.status} bytes=${bytes} latencyMs=${latency}`);
  } catch (error) {
    const latency = Date.now() - startedAt;
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? "ERR";
      const bytes = error.response ? payloadByteLength(error.response.data) : 0;
      c64Logger.warn(`GET ${baseUrl} status=${status} bytes=${bytes} latencyMs=${latency} error=${formatErrorMessage(error)}`);
    } else {
      c64Logger.error(`GET ${baseUrl} status=ERR bytes=0 latencyMs=${latency} error=${formatErrorMessage(error)}`);
    }
    console.log(`Skipping direct REST connectivity probe (no hardware REST base reachable at ${baseUrl})`);
    return;
  }

  if (!response) {
    console.log(`Skipping direct REST connectivity probe (no hardware REST base reachable at ${baseUrl})`);
    return;
  }

  console.log(`Connectivity check succeeded for c64 device at ${baseUrl}`);

  try {
    const memoryAddress = "$0000";
    const memoryResult = await client.readMemory(memoryAddress, "1");
    if (memoryResult.success && memoryResult.data) {
      console.log(`Zero-page probe @ ${memoryAddress}: ${memoryResult.data}`);
    } else if (memoryResult.details) {
      console.warn(`Zero-page probe failed: ${JSON.stringify(memoryResult.details)}`);
    }
  } catch (memoryError) {
    const message = memoryError instanceof Error ? memoryError.message : String(memoryError);
    console.warn(`Zero-page probe skipped or failed (may be unsupported on current backend): ${message}`);
  }
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
