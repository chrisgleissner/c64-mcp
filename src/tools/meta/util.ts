// Shared utility functions used across meta modules

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeErrorDetails(details: unknown): Record<string, unknown> | undefined {
  if (details === undefined || details === null) return undefined;
  if (typeof details === "object") return details as Record<string, unknown>;
  return { value: details };
}

export function formatTimestampSpec(date: Date = new Date()): string {
  return date.toISOString();
}

export function parseTimestampSpec(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
