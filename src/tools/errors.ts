import type { ToolRunResult } from "./types.js";
import { textResult } from "./responses.js";
import type { PlatformId } from "../platform.js";

export type ToolErrorKind = "validation" | "execution" | "unknown";

export interface ToolErrorMetadata {
  readonly kind: ToolErrorKind;
  readonly path?: string;
  readonly code?: string;
  readonly details?: Record<string, unknown>;
}

export class ToolError extends Error {
  readonly kind: ToolErrorKind;
  readonly path?: string;
  readonly code?: string;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    kind: ToolErrorKind,
    options?: { path?: string; code?: string; details?: Record<string, unknown>; cause?: unknown },
  ) {
    super(message);
    this.name = this.constructor.name;
    this.kind = kind;
    this.path = options?.path;
    this.code = options?.code;
    this.details = options?.details;
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

export class ToolValidationError extends ToolError {
  constructor(
    message: string,
    options?: { path?: string; details?: Record<string, unknown>; cause?: unknown },
  ) {
    super(message, "validation", options);
  }
}

export class ToolExecutionError extends ToolError {
  constructor(
    message: string,
    options?: { code?: string; details?: Record<string, unknown>; cause?: unknown },
  ) {
    super(message, "execution", options);
  }
}

export class ToolUnsupportedPlatformError extends ToolExecutionError {
  readonly tool: string;
  readonly platform: PlatformId;
  readonly supported: readonly PlatformId[];

  constructor(tool: string, platform: PlatformId, supported: readonly PlatformId[]) {
    super(
      `Tool ${tool} is not available on platform ${platform}`,
      {
        code: "unsupported_platform",
        details: {
          tool,
          platform,
          supported,
        },
      },
    );
    this.tool = tool;
    this.platform = platform;
    this.supported = supported;
  }
}

export function toolErrorResult(error: ToolError): ToolRunResult {
  const metadata: ToolErrorMetadata = {
    kind: error.kind,
    ...(error.path !== undefined ? { path: error.path } : {}),
    ...(error.code !== undefined ? { code: error.code } : {}),
    ...(error.details !== undefined ? { details: error.details } : {}),
  };

  const message = error.path ? `${error.message} (at ${error.path})` : error.message;

  const base = textResult(message, { error: metadata });
  return { ...base, isError: true };
}

export function unknownErrorResult(error: unknown): ToolRunResult {
  if (error instanceof ToolError) {
    return toolErrorResult(error);
  }

  const metadata: ToolErrorMetadata = { kind: "unknown" };

  const message = error instanceof Error ? error.message : String(error);

  const base = textResult(message, { error: metadata });
  return { ...base, isError: true };
}
