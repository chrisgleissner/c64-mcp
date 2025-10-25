import type { C64Client } from "../c64Client.js";
import type { RagRetriever } from "../rag/types.js";

export type JsonSchema = {
  readonly type?: string | readonly string[];
  readonly description?: string;
  readonly properties?: Record<string, JsonSchema>;
  readonly required?: readonly string[];
  readonly enum?: readonly (string | number | boolean)[];
  readonly items?: JsonSchema | readonly JsonSchema[];
  readonly additionalProperties?: boolean | JsonSchema;
  readonly format?: string;
  readonly default?: unknown;
  readonly examples?: readonly unknown[];
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly const?: unknown;
  readonly allOf?: readonly JsonSchema[];
  readonly minItems?: number;
  readonly maxItems?: number;
};

export type ToolLifecycle = "request-response" | "stream" | "fire-and-forget";

export interface ToolExample {
  readonly name: string;
  readonly description: string;
  readonly arguments: Record<string, unknown>;
}

export interface ToolLogger {
  debug(message: string, details?: Record<string, unknown>): void;
  info(message: string, details?: Record<string, unknown>): void;
  warn(message: string, details?: Record<string, unknown>): void;
  error(message: string, details?: Record<string, unknown>): void;
}

export interface ToolExecutionContext {
  readonly client: C64Client;
  readonly rag: RagRetriever;
  readonly logger: ToolLogger;
}

export interface ToolResponseContentText {
  readonly type: "text";
  readonly text: string;
}

export type ToolResponseContent = ToolResponseContentText;

export interface ToolRunResult {
  readonly content: readonly ToolResponseContent[];
  readonly structuredContent?: {
    readonly type: "json";
    readonly data: unknown;
  };
  readonly metadata?: Record<string, unknown>;
  readonly isError?: boolean;
}

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly summary?: string;
  readonly lifecycle?: ToolLifecycle;
  readonly inputSchema?: JsonSchema;
  readonly examples?: readonly ToolExample[];
  readonly relatedResources?: readonly string[];
  readonly relatedPrompts?: readonly string[];
  readonly tags?: readonly string[];
  readonly workflowHints?: readonly string[];
  readonly execute: (args: unknown, ctx: ToolExecutionContext) => Promise<ToolRunResult>;
}

export interface ToolDescriptor {
  readonly name: string;
  readonly description: string;
  readonly inputSchema?: JsonSchema;
  readonly metadata: {
    readonly domain: string;
    readonly summary: string;
    readonly lifecycle: ToolLifecycle;
    readonly resources: readonly string[];
    readonly prompts: readonly string[];
    readonly examples?: readonly ToolExample[];
    readonly tags: readonly string[];
    readonly workflowHints?: readonly string[];
    readonly prerequisites?: readonly string[];
  };
}

export interface ToolModuleConfig {
  readonly domain: string;
  readonly summary: string;
  readonly resources?: readonly string[];
  readonly prompts?: readonly string[];
  readonly defaultLifecycle?: ToolLifecycle;
  readonly defaultTags?: readonly string[];
  readonly workflowHints?: readonly string[];
  readonly prerequisites?: readonly string[];
  readonly tools: readonly ToolDefinition[];
}

export interface ToolModule {
  readonly domain: string;
  readonly summary: string;
  describeTools(): readonly ToolDescriptor[];
  invoke(name: string, args: unknown, ctx: ToolExecutionContext): Promise<ToolRunResult>;
}

export function defineToolModule(config: ToolModuleConfig): ToolModule {
  const defaultLifecycle = config.defaultLifecycle ?? "request-response";
  const defaultTags = config.defaultTags ?? [];
  const defaultResources = config.resources ?? [];
  const defaultPrompts = config.prompts ?? [];

  const toolMap = new Map(config.tools.map((tool) => [tool.name, tool]));

  return {
    domain: config.domain,
    summary: config.summary,
    describeTools(): readonly ToolDescriptor[] {
      return config.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        metadata: {
          domain: config.domain,
          summary: tool.summary ?? tool.description,
          lifecycle: tool.lifecycle ?? defaultLifecycle,
          resources: mergeUnique(defaultResources, tool.relatedResources),
          prompts: mergeUnique(defaultPrompts, tool.relatedPrompts),
          examples: tool.examples,
          tags: mergeUnique(defaultTags, tool.tags),
        },
      }));
    },
    async invoke(name, args, ctx) {
      const tool = toolMap.get(name);
      if (!tool) {
        throw new Error(`Unknown tool: ${name}`);
      }

      return tool.execute(args, ctx);
    },
  };
}

function mergeUnique(
  base: readonly string[],
  extra?: readonly string[],
): readonly string[] {
  if (!extra || extra.length === 0) {
    return base;
  }

  const set = new Set(base);
  for (const item of extra) {
    set.add(item);
  }

  return Array.from(set);
}
