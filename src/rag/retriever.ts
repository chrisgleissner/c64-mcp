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

  constructor(model: EmbeddingModel, opts: { basic?: EmbeddingIndexFile; asm?: EmbeddingIndexFile }) {
    this.model = model;
    this.basic = opts.basic;
    this.asm = opts.asm;
  }

  updateIndexes(opts: { basic?: EmbeddingIndexFile; asm?: EmbeddingIndexFile }): void {
    this.basic = opts.basic;
    this.asm = opts.asm;
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

    if (!filterLanguage || filterLanguage === "basic") consider(this.basic);
    if (!filterLanguage || filterLanguage === "asm") consider(this.asm);

    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, topK).map((c) => c.text);
  }
}
