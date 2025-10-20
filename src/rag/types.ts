/*
C64 MCP - Local RAG Types
GPL-2.0-only
*/

export type RagLanguage = "basic" | "asm";

export interface RagRetriever {
  retrieve(query: string, topK?: number, filterLanguage?: RagLanguage): Promise<string[]>;
}

export interface EmbeddingRecord {
  name: string; // e.g. graphics/bounce.bas
  language: RagLanguage;
  vector: number[]; // float32 values serialized to JSON numbers
  text: string; // full source content
  sourcePath: string; // absolute path on disk
  sourceMtimeMs: number; // for incremental updates
}

export interface EmbeddingIndexFile {
  dim: number;
  model: string;
  records: EmbeddingRecord[];
}
