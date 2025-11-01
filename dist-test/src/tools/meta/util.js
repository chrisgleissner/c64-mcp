// Shared utility functions used across meta modules
export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export function normalizeErrorDetails(details) {
    if (details === undefined || details === null)
        return undefined;
    if (typeof details === "object")
        return details;
    return { value: details };
}
export function formatTimestampSpec(date = new Date()) {
    return date.toISOString();
}
export function parseTimestampSpec(s) {
    if (!s)
        return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
}
