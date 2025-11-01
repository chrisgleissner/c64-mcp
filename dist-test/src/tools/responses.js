export function textResult(text, metadata) {
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
export function jsonResult(data, metadata) {
    const text = typeof data === "string"
        ? data
        : (() => {
            try {
                return JSON.stringify(data, null, 2);
            }
            catch {
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
