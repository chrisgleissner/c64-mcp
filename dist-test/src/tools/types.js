import { getPlatformStatus, isPlatformSupported, setPlatform, } from "../platform.js";
import { ToolUnsupportedPlatformError, ToolValidationError } from "./errors.js";
export const OPERATION_DISCRIMINATOR = "op";
export const VERIFY_PROPERTY_NAME = "verify";
export const VERIFY_PROPERTY_SCHEMA = Object.freeze({
    type: "boolean",
    description: "When true, perform a verification step after completing the operation.",
    default: false,
});
export function operationSchema(op, options = {}) {
    const { description, opDescription, properties = {}, required = [], additionalProperties = false, } = options;
    const schema = {
        type: "object",
        ...(description ? { description } : {}),
        properties: {
            [OPERATION_DISCRIMINATOR]: {
                const: op,
                description: opDescription ?? `Selects the ${op} operation.`,
            },
            ...properties,
        },
        required: [OPERATION_DISCRIMINATOR, ...required],
        additionalProperties,
    };
    return schema;
}
export function discriminatedUnionSchema(options) {
    const { description, discriminator = OPERATION_DISCRIMINATOR, variants } = options;
    if (!variants || variants.length === 0) {
        throw new Error("Discriminated union schemas require at least one variant.");
    }
    const schema = {
        type: "object",
        ...(description ? { description } : {}),
        oneOf: [...variants],
        discriminator: {
            propertyName: discriminator,
        },
    };
    return schema;
}
export function createOperationDispatcher(toolName, handlers) {
    const allowed = Object.keys(handlers).sort();
    return async (args, ctx) => {
        if (typeof args !== "object" || args === null) {
            throw new ToolValidationError(`${toolName} requires an object argument with an ${OPERATION_DISCRIMINATOR} property`, { path: "$" });
        }
        const record = args;
        const opValue = record[OPERATION_DISCRIMINATOR];
        if (typeof opValue !== "string" || opValue.length === 0) {
            throw new ToolValidationError(`${toolName} requires an ${OPERATION_DISCRIMINATOR} string to select an operation`, { path: `$.${OPERATION_DISCRIMINATOR}` });
        }
        const opKey = opValue;
        const handler = handlers[opKey];
        if (!handler) {
            throw new ToolValidationError(`${toolName} does not support ${OPERATION_DISCRIMINATOR} "${opValue}"`, { path: `$.${OPERATION_DISCRIMINATOR}`, details: { allowed } });
        }
        return handler(record, ctx);
    };
}
export function defineToolModule(config) {
    const defaultLifecycle = config.defaultLifecycle ?? "request-response";
    const defaultTags = Object.freeze([...(config.defaultTags ?? [])]);
    const defaultResources = Object.freeze([...(config.resources ?? [])]);
    const defaultPrompts = Object.freeze([...(config.prompts ?? [])]);
    const defaultWorkflowHints = Object.freeze([...(config.workflowHints ?? [])]);
    const defaultPrerequisites = Object.freeze([...(config.prerequisites ?? [])]);
    const defaultPlatforms = config.supportedPlatforms
        ? Object.freeze([...(config.supportedPlatforms)])
        : Object.freeze(["c64u"]);
    const toolMap = new Map(config.tools.map((tool) => [tool.name, tool]));
    return {
        domain: config.domain,
        summary: config.summary,
        defaultTags,
        workflowHints: defaultWorkflowHints.length > 0 ? defaultWorkflowHints : undefined,
        describeTools() {
            return config.tools.map((tool) => {
                const workflowHints = mergeOptionalStrings(defaultWorkflowHints, tool.workflowHints);
                const prerequisites = mergeOptionalStrings(defaultPrerequisites, tool.prerequisites);
                const platforms = mergePlatforms(defaultPlatforms, tool.supportedPlatforms);
                const metadata = {
                    domain: config.domain,
                    summary: tool.summary ?? tool.description,
                    lifecycle: tool.lifecycle ?? defaultLifecycle,
                    resources: mergeUnique(defaultResources, tool.relatedResources),
                    prompts: mergeUnique(defaultPrompts, tool.relatedPrompts),
                    examples: tool.examples,
                    tags: mergeUnique(defaultTags, tool.tags),
                    ...(workflowHints ? { workflowHints } : {}),
                    ...(prerequisites ? { prerequisites } : {}),
                    ...(platforms ? { platforms } : {}),
                };
                return {
                    name: tool.name,
                    description: tool.description,
                    inputSchema: tool.inputSchema,
                    metadata,
                };
            });
        },
        async invoke(name, args, ctx) {
            const tool = toolMap.get(name);
            if (!tool) {
                throw new Error(`Unknown tool: ${name}`);
            }
            const platforms = mergePlatforms(defaultPlatforms, tool.supportedPlatforms) ?? defaultPlatforms;
            const status = ctx.platform ?? getPlatformStatus();
            const setter = ctx.setPlatform ?? setPlatform;
            if (!isPlatformSupported(status.id, platforms)) {
                throw new ToolUnsupportedPlatformError(name, status.id, platforms);
            }
            const enrichedCtx = {
                ...ctx,
                platform: status,
                setPlatform: setter,
            };
            return tool.execute(args, enrichedCtx);
        },
    };
}
function mergeUnique(base, extra) {
    if (!extra || extra.length === 0) {
        return base;
    }
    const set = new Set(base);
    for (const item of extra) {
        set.add(item);
    }
    return Array.from(set);
}
function mergeOptionalStrings(base, extra) {
    if ((!base || base.length === 0) && (!extra || extra.length === 0)) {
        return base && base.length > 0 ? base : undefined;
    }
    const set = new Set(base ?? []);
    if (extra) {
        for (const item of extra) {
            set.add(item);
        }
    }
    const merged = Array.from(set);
    return merged.length > 0 ? merged : undefined;
}
function mergePlatforms(base, extra) {
    if ((!base || base.length === 0) && (!extra || extra.length === 0)) {
        return base && base.length > 0 ? base : undefined;
    }
    const set = new Set(base ?? []);
    if (extra) {
        for (const item of extra) {
            set.add(item);
        }
    }
    const merged = Array.from(set);
    return merged.length > 0 ? merged : undefined;
}
