import type { ToolRunResult } from "./types.js";

export function textResult(
  text: string,
  metadata?: Record<string, unknown>,
): ToolRunResult {
  return {
    content: [
      {
        type: "text",
        text,
      },
    ],
    metadata,
  };
}

export function jsonResult(
  data: unknown,
  metadata?: Record<string, unknown>,
): ToolRunResult {
  const text =
    typeof data === "string"
      ? data
      : (() => {
          try {
            return JSON.stringify(data, null, 2);
          } catch {
            return String(data);
          }
        })();

  return {
    content: [
      {
        type: "text",
        text,
      },
    ],
    structuredContent: {
      type: "json",
      data,
    },
    metadata,
  };
}
