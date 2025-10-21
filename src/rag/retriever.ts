/*
C64 MCP - Local RAG Retriever
GPL-2.0-only
*/

import { RagRetriever as IRagRetriever, RagLanguage, EmbeddingIndexFile } from "./types.js";
import { EmbeddingModel, cosineSimilarity } from "./embeddings.js";

export class LocalRagRetriever implements IRagRetriever {
  private readonly model: EmbeddingModel;
  private basic?: EmbeddingIndexFile;
  private asm?: EmbeddingIndexFile;
  private mixed?: EmbeddingIndexFile;
  private hardware?: EmbeddingIndexFile;
  private other?: EmbeddingIndexFile;

  constructor(model: EmbeddingModel, opts: { basic?: EmbeddingIndexFile; asm?: EmbeddingIndexFile; mixed?: EmbeddingIndexFile; hardware?: EmbeddingIndexFile; other?: EmbeddingIndexFile }) {
    this.model = model;
    this.basic = opts.basic;
    this.asm = opts.asm;
    this.mixed = opts.mixed;
    this.hardware = opts.hardware;
    this.other = opts.other;
  }

  updateIndexes(opts: { basic?: EmbeddingIndexFile; asm?: EmbeddingIndexFile; mixed?: EmbeddingIndexFile; hardware?: EmbeddingIndexFile; other?: EmbeddingIndexFile }): void {
    this.basic = opts.basic;
    this.asm = opts.asm;
    this.mixed = opts.mixed;
    this.hardware = opts.hardware;
    this.other = opts.other;
  }

  async retrieve(query: string, topK: number = 3, filterLanguage?: RagLanguage): Promise<string[]> {
    const qv = await this.model.embed(query);
    const candidates: Array<{ score: number; text: string }> = [];

    const consider = (index?: EmbeddingIndexFile) => {
      if (!index) return;
      for (const rec of index.records) {
        const score = cosineSimilarity(qv, new Float32Array(rec.vector));
        candidates.push({ score, text: rec.text });
      }
    };

    const normalized = filterLanguage;
    const seen = new Set<EmbeddingIndexFile>();
    const push = (index?: EmbeddingIndexFile) => {
      if (!index || seen.has(index)) return;
      seen.add(index);
      consider(index);
    };

    if (!normalized || normalized === "basic") push(this.basic);
    if (!normalized || normalized === "asm") push(this.asm);
    if (!normalized || normalized === "mixed" || normalized === "basic" || normalized === "asm") push(this.mixed);
    if (!normalized || normalized === "hardware") push(this.hardware);
    if (!normalized || normalized === "other") push(this.other);

    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, topK).map((c) => c.text);
  }
}
