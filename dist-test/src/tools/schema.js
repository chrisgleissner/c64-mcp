import { ToolValidationError } from "./errors.js";
const hasOwn = Object.prototype.hasOwnProperty;
function withDefaultPath(path) {
    return path ?? "$";
}
function createSchema(jsonSchema, parser) {
    return {
        jsonSchema,
        parse(value, path) {
            return parser(value, withDefaultPath(path));
        },
    };
}
function ensureType(condition, message, path, details) {
    if (!condition) {
        throw new ToolValidationError(message, { path, details });
    }
}
function schemaHasDefault(schema) {
    return hasOwn.call(schema.jsonSchema, "default");
}
export function stringSchema(options = {}) {
    const jsonSchema = {
        type: "string",
        ...(options.description ? { description: options.description } : {}),
        ...(options.minLength !== undefined ? { minLength: options.minLength } : {}),
        ...(options.maxLength !== undefined ? { maxLength: options.maxLength } : {}),
        ...(options.pattern ? { pattern: options.pattern.source } : {}),
        ...(options.enum ? { enum: options.enum } : {}),
        ...(options.default !== undefined ? { default: options.default } : {}),
    };
    return createSchema(jsonSchema, (value, path) => {
        if (value === undefined || value === null) {
            if (options.default !== undefined) {
                return options.default;
            }
            throw new ToolValidationError("Value is required", { path });
        }
        ensureType(typeof value === "string", "Expected a string", path, {
            receivedType: typeof value,
        });
        const stringValue = value;
        if (options.minLength !== undefined && stringValue.length < options.minLength) {
            throw new ToolValidationError(`String must have length ≥ ${options.minLength}`, { path, details: { minLength: options.minLength } });
        }
        if (options.maxLength !== undefined && stringValue.length > options.maxLength) {
            throw new ToolValidationError(`String must have length ≤ ${options.maxLength}`, { path, details: { maxLength: options.maxLength } });
        }
        if (options.pattern && !options.pattern.test(stringValue)) {
            throw new ToolValidationError("String does not match required pattern", {
                path,
                details: { pattern: options.pattern.source },
            });
        }
        if (options.enum && !options.enum.includes(stringValue)) {
            throw new ToolValidationError("Value must be one of the allowed options", {
                path,
                details: { allowed: options.enum },
            });
        }
        return stringValue;
    });
}
export function numberSchema(options = {}) {
    const jsonSchema = {
        type: options.integer ? "integer" : "number",
        ...(options.description ? { description: options.description } : {}),
        ...(options.minimum !== undefined ? { minimum: options.minimum } : {}),
        ...(options.maximum !== undefined ? { maximum: options.maximum } : {}),
        ...(options.default !== undefined ? { default: options.default } : {}),
    };
    return createSchema(jsonSchema, (value, path) => {
        if (value === undefined || value === null) {
            if (options.default !== undefined) {
                return options.default;
            }
            throw new ToolValidationError("Value is required", { path });
        }
        ensureType(typeof value === "number" && Number.isFinite(value), "Expected a number", path, {
            receivedType: typeof value,
        });
        const numberValue = value;
        if (options.integer && !Number.isInteger(numberValue)) {
            throw new ToolValidationError("Expected an integer", { path });
        }
        if (options.minimum !== undefined && numberValue < options.minimum) {
            throw new ToolValidationError("Value is below minimum", {
                path,
                details: { minimum: options.minimum },
            });
        }
        if (options.maximum !== undefined && numberValue > options.maximum) {
            throw new ToolValidationError("Value is above maximum", {
                path,
                details: { maximum: options.maximum },
            });
        }
        return numberValue;
    });
}
export function integerSchema(options = {}) {
    return numberSchema({ ...options, integer: true });
}
export function booleanSchema(options = {}) {
    const jsonSchema = {
        type: "boolean",
        ...(options.description ? { description: options.description } : {}),
        ...(options.default !== undefined ? { default: options.default } : {}),
    };
    return createSchema(jsonSchema, (value, path) => {
        if (value === undefined || value === null) {
            if (options.default !== undefined) {
                return options.default;
            }
            throw new ToolValidationError("Value is required", { path });
        }
        ensureType(typeof value === "boolean", "Expected a boolean", path, {
            receivedType: typeof value,
        });
        return value;
    });
}
export function literalSchema(literal, description) {
    const jsonSchema = {
        const: literal,
        description,
    };
    return createSchema(jsonSchema, (value, path) => {
        if (value === literal) {
            return literal;
        }
        throw new ToolValidationError(`Expected literal value ${literal}`, { path });
    });
}
export function arraySchema(itemSchema, options = {}) {
    const jsonSchema = {
        type: "array",
        ...(options.description ? { description: options.description } : {}),
        items: itemSchema.jsonSchema,
        ...(options.minItems !== undefined ? { minItems: options.minItems } : {}),
        ...(options.maxItems !== undefined ? { maxItems: options.maxItems } : {}),
    };
    return createSchema(jsonSchema, (value, path) => {
        ensureType(Array.isArray(value), "Expected an array", path, {
            receivedType: typeof value,
        });
        const arrayValue = value;
        const result = [];
        for (let index = 0; index < arrayValue.length; index += 1) {
            const itemPath = `${path}[${index}]`;
            const parsed = itemSchema.parse(arrayValue[index], itemPath);
            result.push(parsed);
        }
        if (options.minItems !== undefined && result.length < options.minItems) {
            throw new ToolValidationError("Array has too few items", {
                path,
                details: { minItems: options.minItems },
            });
        }
        if (options.maxItems !== undefined && result.length > options.maxItems) {
            throw new ToolValidationError("Array has too many items", {
                path,
                details: { maxItems: options.maxItems },
            });
        }
        return result;
    });
}
export function optionalSchema(schema, defaultValue) {
    const baseSchema = schema.jsonSchema;
    const baseType = baseSchema.type;
    const optionalType = Array.isArray(baseType)
        ? baseType.includes("null")
            ? baseType
            : [...baseType, "null"]
        : baseType
            ? [baseType, "null"]
            : undefined;
    const baseDefault = baseSchema.default;
    const resolvedDefault = defaultValue !== undefined ? defaultValue : baseDefault;
    const jsonSchema = {
        ...baseSchema,
        ...(optionalType ? { type: optionalType } : {}),
        ...(resolvedDefault !== undefined ? { default: resolvedDefault } : {}),
    };
    return createSchema(jsonSchema, (value, path) => {
        if (value === undefined || value === null) {
            return resolvedDefault;
        }
        return schema.parse(value, path);
    });
}
function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function objectSchema(options) {
    const required = options.required ?? [];
    const propertyEntries = Object.entries(options.properties).map(([key, schema]) => [key, schema.jsonSchema]);
    const jsonSchema = {
        type: "object",
        ...(options.description ? { description: options.description } : {}),
        properties: Object.fromEntries(propertyEntries),
        ...(required.length > 0 ? { required: required.map((key) => key) } : {}),
        ...(options.additionalProperties !== undefined
            ? { additionalProperties: options.additionalProperties }
            : { additionalProperties: false }),
    };
    return createSchema(jsonSchema, (value, path) => {
        ensureType(isPlainObject(value), "Expected an object", path, {
            receivedType: typeof value,
        });
        const result = {};
        const input = value;
        for (const key of required) {
            if (!hasOwn.call(input, key)) {
                throw new ToolValidationError("Missing required property", {
                    path: `${path}.${String(key)}`,
                });
            }
        }
        for (const [key, schema] of Object.entries(options.properties)) {
            const propertyPath = `${path}.${key}`;
            if (hasOwn.call(input, key)) {
                const parsed = schema.parse(input[key], propertyPath);
                if (parsed !== undefined) {
                    result[key] = parsed;
                }
                continue;
            }
            if (schemaHasDefault(schema)) {
                const parsed = schema.parse(undefined, propertyPath);
                if (parsed !== undefined) {
                    result[key] = parsed;
                }
            }
        }
        if (options.additionalProperties === false) {
            for (const key of Object.keys(input)) {
                if (!hasOwn.call(options.properties, key)) {
                    throw new ToolValidationError("Unexpected property", {
                        path: `${path}.${key}`,
                    });
                }
            }
        }
        else if (options.additionalProperties === true) {
            for (const key of Object.keys(input)) {
                if (!hasOwn.call(options.properties, key)) {
                    result[key] = input[key];
                }
            }
        }
        return result;
    });
}
export function mergeSchemas(a, b) {
    const jsonSchema = {
        allOf: [a.jsonSchema, b.jsonSchema],
    };
    return createSchema(jsonSchema, (value, path) => {
        const first = a.parse(prepareValueForMerge(value, a), path);
        const second = b.parse(prepareValueForMerge(value, b), path);
        if (isPlainObject(value)) {
            const strictA = a.jsonSchema.additionalProperties === false;
            const strictB = b.jsonSchema.additionalProperties === false;
            if (strictA && strictB) {
                const allowedKeys = new Set();
                if (a.jsonSchema.properties) {
                    for (const key of Object.keys(a.jsonSchema.properties)) {
                        allowedKeys.add(key);
                    }
                }
                if (b.jsonSchema.properties) {
                    for (const key of Object.keys(b.jsonSchema.properties)) {
                        allowedKeys.add(key);
                    }
                }
                for (const key of Object.keys(value)) {
                    if (!allowedKeys.has(key)) {
                        throw new ToolValidationError("Unexpected property", {
                            path: `${path}.${key}`,
                        });
                    }
                }
            }
        }
        return { ...first, ...second };
    });
}
function prepareValueForMerge(value, schema) {
    if (!isPlainObject(value)) {
        return value;
    }
    if (schema.jsonSchema.additionalProperties === false && schema.jsonSchema.properties) {
        const subset = {};
        for (const key of Object.keys(schema.jsonSchema.properties)) {
            if (hasOwn.call(value, key)) {
                subset[key] = value[key];
            }
        }
        return subset;
    }
    return value;
}
