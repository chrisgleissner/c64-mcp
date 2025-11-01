import { OPERATION_DISCRIMINATOR } from "../types.js";
export function buildDescriptorIndex(module) {
    return new Map(module.describeTools().map((descriptor) => [descriptor.name, descriptor]));
}
export function ensureDescriptor(index, name) {
    const descriptor = index.get(name);
    if (!descriptor) {
        throw new Error(`Unable to locate descriptor for ${name}`);
    }
    return descriptor;
}
function cloneSchema(schema) {
    if (!schema) {
        return {
            type: "object",
            properties: {},
            additionalProperties: false,
        };
    }
    return JSON.parse(JSON.stringify(schema));
}
function isObjectSchema(schema) {
    if (!schema.type) {
        return true;
    }
    if (typeof schema.type === "string") {
        return schema.type === "object";
    }
    return schema.type.includes("object");
}
export function extendSchemaWithOp(op, baseSchema, options = {}) {
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
        };
    }
    const properties = { ...(schema.properties ?? {}) };
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
    };
}
export function createOperationHandlers(operations) {
    const handlers = {};
    for (const operation of operations) {
        handlers[operation.op] = operation.handler;
    }
    return handlers;
}
export function invokeModuleTool(module, toolName, rawArgs, ctx) {
    const { [OPERATION_DISCRIMINATOR]: _ignored, ...rest } = rawArgs;
    return module.invoke(toolName, rest, ctx);
}
