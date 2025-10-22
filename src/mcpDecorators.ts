/*
MCP Decorators and Registry
Use to annotate methods that should be exposed as MCP tools.
At build time, the generator scans for @McpTool annotations and produces a manifest.
*/

import 'reflect-metadata';

export type McpParameterSchema = Record<string, string | { type: string; required?: boolean; enum?: string[]; description?: string }>;

export interface McpToolOptions {
  name: string;
  description: string;
  parameters?: McpParameterSchema;
}

export interface RegisteredTool extends McpToolOptions {
  target?: string;
  methodKey?: string | symbol;
  sourceFile?: string;
}

const REGISTRY: RegisteredTool[] = [];
const META_KEY = Symbol('mcp:tool');

export function McpTool(options: McpToolOptions) {
  return function (_target: unknown, propertyKey?: string | symbol) {
    try {
      if (propertyKey && typeof (Reflect as any)?.defineMetadata === 'function') {
        (Reflect as any).defineMetadata(META_KEY, options, _target as object, propertyKey);
      }
    } catch {
      // Ignore if reflect-metadata isn't available at runtime
    }

    REGISTRY.push({ ...options, methodKey: propertyKey });
  } as MethodDecorator;
}

export function getRegisteredMcpTools(): RegisteredTool[] {
  return [...REGISTRY];
}

export function getMcpMetadata(target: object, propertyKey: string | symbol): McpToolOptions | undefined {
  try {
    return (Reflect as any).getMetadata(META_KEY, target, propertyKey);
  } catch {
    return undefined;
  }
}
