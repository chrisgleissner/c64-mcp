import { textResult } from "./responses.js";
export class ToolError extends Error {
    constructor(message, kind, options) {
        super(message);
        this.name = this.constructor.name;
        this.kind = kind;
        this.path = options?.path;
        this.code = options?.code;
        this.details = options?.details;
        if (options?.cause !== undefined) {
            this.cause = options.cause;
        }
    }
}
export class ToolValidationError extends ToolError {
    constructor(message, options) {
        super(message, "validation", options);
    }
}
export class ToolExecutionError extends ToolError {
    constructor(message, options) {
        super(message, "execution", options);
    }
}
export class ToolUnsupportedPlatformError extends ToolExecutionError {
    constructor(tool, platform, supported) {
        super(`Tool ${tool} is not available on platform ${platform}`, {
            code: "unsupported_platform",
            details: {
                tool,
                platform,
                supported,
            },
        });
        this.tool = tool;
        this.platform = platform;
        this.supported = supported;
    }
}
export function toolErrorResult(error) {
    const metadata = {
        kind: error.kind,
        ...(error.path !== undefined ? { path: error.path } : {}),
        ...(error.code !== undefined ? { code: error.code } : {}),
        ...(error.details !== undefined ? { details: error.details } : {}),
    };
    const message = error.path ? `${error.message} (at ${error.path})` : error.message;
    const base = textResult(message, { error: metadata });
    return { ...base, isError: true };
}
export function unknownErrorResult(error) {
    if (error instanceof ToolError) {
        return toolErrorResult(error);
    }
    const metadata = { kind: "unknown" };
    const message = error instanceof Error ? error.message : String(error);
    const base = textResult(message, { error: metadata });
    return { ...base, isError: true };
}
