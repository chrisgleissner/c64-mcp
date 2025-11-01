import type {
  JsonSchema,
  ToolDescriptor,
  ToolExecutionContext,
  ToolModule,
  ToolRunResult,
} from "../types.js";
import { OPERATION_DISCRIMINATOR } from "../types.js";

export type GenericOperationMap = Record<string, Record<string, unknown>>;

export type GroupedOperationConfig = {
  readonly op: string;
  readonly schema: JsonSchema;
  readonly handler: (
    args: Record<string, unknown> & { readonly [OPERATION_DISCRIMINATOR]: string },
    ctx: ToolExecutionContext,
  ) => Promise<ToolRunResult>;
};

export function buildDescriptorIndex(module: ToolModule): Map<string, ToolDescriptor> {
  return new Map(module.describeTools().map((descriptor) => [descriptor.name, descriptor]));
}

export function ensureDescriptor(index: Map<string, ToolDescriptor>, name: string): ToolDescriptor {
  const descriptor = index.get(name);
  if (!descriptor) {
    throw new Error(`Unable to locate descriptor for ${name}`);
  }
  return descriptor;
}

function cloneSchema(schema?: JsonSchema): JsonSchema {
  if (!schema) {
    return {
      type: "object",
      properties: {},
      additionalProperties: false,
    } satisfies JsonSchema;
  }
  return JSON.parse(JSON.stringify(schema)) as JsonSchema;
}

function isObjectSchema(schema: JsonSchema): boolean {
  if (!schema.type) {
    return true;
  }
  if (typeof schema.type === "string") {
    return schema.type === "object";
  }
  return schema.type.includes("object");
}

export function extendSchemaWithOp(
  op: string,
  baseSchema: JsonSchema | undefined,
  options: { description?: string; extraProperties?: Record<string, JsonSchema> } = {},
): JsonSchema {
  const schema = cloneSchema(baseSchema);
  const description = options.description ?? schema.description;

  if (!isObjectSchema(schema)) {
    return {
      type: "object",
      description,
      properties: {
        [OPERATION_DISCRIMINATOR]: { const: op },
        payload: schema,
      },
      required: [OPERATION_DISCRIMINATOR, "payload"],
      additionalProperties: false,
    } satisfies JsonSchema;
  }

  const properties = { ...(schema.properties ?? {}) } as Record<string, JsonSchema>;
  properties[OPERATION_DISCRIMINATOR] = { const: op };

  if (options.extraProperties) {
    for (const [key, value] of Object.entries(options.extraProperties)) {
      properties[key] = value;
    }
  }

  const required = new Set(schema.required ?? []);
  required.add(OPERATION_DISCRIMINATOR);

  return {
    ...schema,
    description,
    properties,
    required: Array.from(required),
  } satisfies JsonSchema;
}

export function createOperationHandlers(
  operations: readonly GroupedOperationConfig[],
): import("../types.js").OperationHandlerMap<GenericOperationMap> {
  const handlers: Record<string, (args: Record<string, unknown> & { readonly [OPERATION_DISCRIMINATOR]: string }, ctx: ToolExecutionContext) => Promise<ToolRunResult>> = {};

  for (const operation of operations) {
    handlers[operation.op] = operation.handler;
  }

  return handlers as import("../types.js").OperationHandlerMap<GenericOperationMap>;
}

export function invokeModuleTool(
  module: ToolModule,
  toolName: string,
  rawArgs: Record<string, unknown> & { readonly [OPERATION_DISCRIMINATOR]: string },
  ctx: ToolExecutionContext,
): Promise<ToolRunResult> {
  const { [OPERATION_DISCRIMINATOR]: _ignored, ...rest } = rawArgs;
  return module.invoke(toolName, rest, ctx);
}
