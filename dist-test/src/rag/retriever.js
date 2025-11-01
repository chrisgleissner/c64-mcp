/*
C64 Bridge - Local RAG Retriever
GPL-2.0-only
*/
import { cosineSimilarity } from "./embeddings.js";
import { listKnowledgeResources } from "./knowledgeIndex.js";
const BASIC_SIGNAL_RE = /(^\s*\d{1,5}\s)|\b(PRINT|POKE|GOTO|GOSUB|RESTORE|READ|DATA|INPUT|CHR\$|TI\$|TAB\()/im;
const ASM_SIGNAL_RE = /(^\s*(?:[A-Z_][\w]*:)?\s*(?:\.?[A-Z]{2,4})\b)|\$[0-9A-F]{2,4}/im;
const PROVENANCE_COMMENT_RE = /^\s*<!--\s*Source:\s*(.*?)\s*-->\s*/i;
// Build a mapping from file paths to resource URIs
function buildPathToUriMap() {
    const resources = listKnowledgeResources();
    const map = new Map();
    for (const resource of resources) {
        if (resource.relativePath) {
            // Normalize the path for matching
            const normalizedPath = resource.relativePath.replace(/\\/g, "/");
            map.set(normalizedPath, resource.uri);
        }
    }
    return map;
}
const PATH_TO_URI_MAP = buildPathToUriMap();
export class LocalRagRetriever {
    constructor(model, opts) {
        this.model = model;
        this.basic = opts.basic;
        this.asm = opts.asm;
        this.mixed = opts.mixed;
        this.hardware = opts.hardware;
        this.other = opts.other;
    }
    updateIndexes(opts) {
        this.basic = opts.basic;
        this.asm = opts.asm;
        this.mixed = opts.mixed;
        this.hardware = opts.hardware;
        this.other = opts.other;
    }
    async retrieve(query, topK = 3, filterLanguage) {
        const qv = await this.model.embed(query);
        const candidates = [];
        const consider = (index) => {
            if (!index)
                return;
            for (const rec of index.records) {
                const matchesBasic = BASIC_SIGNAL_RE.test(rec.text);
                const matchesAsm = ASM_SIGNAL_RE.test(rec.text);
                if (normalized === "basic" && !matchesBasic) {
                    continue;
                }
                if (normalized === "asm" && !matchesAsm) {
                    continue;
                }
                let score = cosineSimilarity(qv, new Float32Array(rec.vector));
                if (normalized === "basic" && matchesBasic) {
                    score += 0.05;
                }
                else if (normalized === "asm" && matchesAsm) {
                    score += 0.05;
                }
                const { snippet, origin: provenanceOrigin } = extractSnippetAndOrigin(rec.text);
                const origin = rec.origin ?? provenanceOrigin;
                candidates.push({
                    score,
                    record: rec,
                    snippet,
                    origin,
                    uri: deriveUri(rec, origin),
                });
            }
        };
        const normalized = filterLanguage;
        const seen = new Set();
        const push = (index) => {
            if (!index || seen.has(index))
                return;
            seen.add(index);
            consider(index);
        };
        if (!normalized || normalized === "basic")
            push(this.basic);
        if (!normalized || normalized === "asm")
            push(this.asm);
        if (!normalized || normalized === "mixed")
            push(this.mixed);
        if (normalized === "basic" && (!this.basic || this.basic.records.length === 0))
            push(this.mixed);
        if (normalized === "asm" && (!this.asm || this.asm.records.length === 0))
            push(this.mixed);
        if (!normalized || normalized === "hardware")
            push(this.hardware);
        if (!normalized || normalized === "other")
            push(this.other);
        candidates.sort((a, b) => b.score - a.score);
        // Apply duplicate suppression and diversity
        const deduplicated = deduplicateAndDiversify(candidates, topK);
        return deduplicated.map((candidate) => ({
            snippet: candidate.snippet,
            origin: candidate.origin,
            uri: candidate.uri,
            score: candidate.score,
            sourcePath: candidate.record.sourcePath,
            sourceUrl: candidate.record.sourceUrl,
            sourceRepoUrl: candidate.record.sourceRepoUrl,
            licenseSpdxId: candidate.record.licenseSpdxId,
            attribution: candidate.record.attribution,
        }));
    }
}
function deduplicateAndDiversify(candidates, topK) {
    // Step 1: Remove near-duplicates based on snippet similarity
    const results = [];
    const seenSnippets = new Set();
    for (const candidate of candidates) {
        // Normalize snippet for comparison (lowercase, trim whitespace)
        const normalizedSnippet = candidate.snippet
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 100); // Compare first 100 chars
        // Skip if we've seen this snippet before
        if (seenSnippets.has(normalizedSnippet)) {
            continue;
        }
        // Check for high similarity with existing results
        let isDuplicate = false;
        for (const existing of results) {
            const existingNormalized = existing.snippet
                .toLowerCase()
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 100);
            // Simple Jaccard similarity on words
            const words1 = new Set(normalizedSnippet.split(/\s+/));
            const words2 = new Set(existingNormalized.split(/\s+/));
            const intersection = new Set([...words1].filter((w) => words2.has(w)));
            const union = new Set([...words1, ...words2]);
            const similarity = intersection.size / union.size;
            if (similarity > 0.85) {
                isDuplicate = true;
                break;
            }
        }
        if (!isDuplicate) {
            results.push(candidate);
            seenSnippets.add(normalizedSnippet);
        }
        // Stop if we have enough results
        if (results.length >= topK) {
            break;
        }
    }
    // Step 2: Ensure diversity in origins/resources
    // If we have fewer results than topK, try to add more from different origins
    if (results.length < topK && results.length < candidates.length) {
        const usedOrigins = new Set(results.map((r) => r.origin || r.uri || "unknown"));
        const remaining = candidates.filter((c) => !results.includes(c));
        for (const candidate of remaining) {
            const candidateOrigin = candidate.origin || candidate.uri || "unknown";
            // Prefer candidates from different origins
            if (!usedOrigins.has(candidateOrigin)) {
                results.push(candidate);
                usedOrigins.add(candidateOrigin);
                if (results.length >= topK) {
                    break;
                }
            }
        }
        // Fill remaining slots if still under topK
        for (const candidate of remaining) {
            if (!results.includes(candidate)) {
                results.push(candidate);
                if (results.length >= topK) {
                    break;
                }
            }
        }
    }
    return results.slice(0, topK);
}
function extractSnippetAndOrigin(text) {
    const match = PROVENANCE_COMMENT_RE.exec(text);
    if (!match) {
        return { snippet: text.trim() };
    }
    const snippet = text.slice(match[0].length).trim();
    const origin = match[1]?.trim();
    return {
        snippet: snippet.length > 0 ? snippet : text.trim(),
        origin: origin || undefined,
    };
}
function deriveUri(record, origin) {
    // If origin is already a c64:// URI, use it
    if (origin && origin.startsWith("c64://")) {
        return origin;
    }
    // Try to map the file path from origin to a resource URI
    if (origin) {
        // Extract the file path (before any '#' anchor)
        const filePath = origin.split("#")[0];
        const resourceUri = PATH_TO_URI_MAP.get(filePath);
        if (resourceUri) {
            // Preserve any anchor/section from the original origin
            const anchor = origin.includes("#") ? "#" + origin.split("#")[1] : "";
            return resourceUri + anchor;
        }
    }
    // Try to map the source path from the record
    if (record.sourcePath) {
        const normalizedPath = record.sourcePath.replace(/\\/g, "/");
        const resourceUri = PATH_TO_URI_MAP.get(normalizedPath);
        if (resourceUri) {
            return resourceUri;
        }
    }
    // Fallback to source URLs
    if (record.sourceUrl) {
        return record.sourceUrl;
    }
    if (record.sourceRepoUrl) {
        return record.sourceRepoUrl;
    }
    return undefined;
}
