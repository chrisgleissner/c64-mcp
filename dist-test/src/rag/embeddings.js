/*
C64 Bridge - Local RAG Embeddings
GPL-2.0-only
*/
import crypto from "node:crypto";
/**
 * Deterministic local embedding model using SHA-256 feature hashing.
 * Provides stable, cosine-comparable vectors without external services.
 */
export class LocalMiniHashEmbedding {
    constructor(dim = 384, numHashBuckets = 2048) {
        this.tokenRegex = /[A-Za-z0-9_$#]+|[^\s]/g;
        this.dim = dim;
        this.numHashBuckets = numHashBuckets;
    }
    async embed(text) {
        const vector = new Float32Array(this.dim);
        if (!text)
            return vector;
        const tokens = text.match(this.tokenRegex) ?? [];
        if (tokens.length === 0)
            return vector;
        for (const token of tokens) {
            const h = this.hash(token);
            const bucket = h % this.numHashBuckets;
            const sign = (h & 1) === 0 ? 1 : -1;
            const base = (bucket * 3) % this.dim;
            vector[base] += sign * 1.0;
            vector[(base + 97) % this.dim] += sign * 0.5;
            vector[(base + 211) % this.dim] += sign * 0.25;
        }
        const norm = Math.hypot(...Array.from(vector));
        if (norm > 0) {
            for (let i = 0; i < vector.length; i++)
                vector[i] /= norm;
        }
        return vector;
    }
    hash(input) {
        const digest = crypto.createHash("sha256").update(input).digest();
        return digest.readUInt32BE(0);
    }
}
export function cosineSimilarity(a, b) {
    if (a.length !== b.length)
        throw new Error("Vector size mismatch");
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i++) {
        const va = a[i];
        const vb = b[i];
        dot += va * vb;
        na += va * va;
        nb += vb * vb;
    }
    if (na === 0 || nb === 0)
        return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
