/*
C64 MCP - Local RAG Retriever
GPL-2.0-only
*/

import { RagRetriever as IRagRetriever, RagLanguage, EmbeddingIndexFile } from "./types.js";
import { EmbeddingModel, cosineSimilarity } from "./embeddings.js";

const BASIC_SIGNAL_RE = /(^\s*\d{1,5}\s)|\b(PRINT|POKE|GOTO|GOSUB|RESTORE|READ|DATA|INPUT|CHR\$|TI\$|TAB\()/im;
const ASM_SIGNAL_RE = /(^\s*(?:[A-Z_][\w]*:)?\s*(?:\.?[A-Z]{2,4})\b)|\$[0-9A-F]{2,4}/im;

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
        } else if (normalized === "asm" && matchesAsm) {
          score += 0.05;
        }
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
  if (!normalized || normalized === "mixed") push(this.mixed);
  if (normalized === "basic" && (!this.basic || this.basic.records.length === 0)) push(this.mixed);
  if (normalized === "asm" && (!this.asm || this.asm.records.length === 0)) push(this.mixed);
    if (!normalized || normalized === "hardware") push(this.hardware);
    if (!normalized || normalized === "other") push(this.other);

    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, topK).map((c) => c.text);
  }
}
