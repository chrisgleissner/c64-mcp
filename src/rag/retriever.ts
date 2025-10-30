/*
C64 Bridge - Local RAG Retriever
GPL-2.0-only
*/

import {
  RagRetriever as IRagRetriever,
  RagLanguage,
  EmbeddingIndexFile,
  RagReference,
  EmbeddingRecord,
} from "./types.js";
import { EmbeddingModel, cosineSimilarity } from "./embeddings.js";
import { listKnowledgeResources } from "./knowledgeIndex.js";

const BASIC_SIGNAL_RE = /(^\s*\d{1,5}\s)|\b(PRINT|POKE|GOTO|GOSUB|RESTORE|READ|DATA|INPUT|CHR\$|TI\$|TAB\()/im;
const ASM_SIGNAL_RE = /(^\s*(?:[A-Z_][\w]*:)?\s*(?:\.?[A-Z]{2,4})\b)|\$[0-9A-F]{2,4}/im;
const PROVENANCE_COMMENT_RE = /^\s*<!--\s*Source:\s*(.*?)\s*-->\s*/i;

// Build a mapping from file paths to resource URIs
function buildPathToUriMap(): Map<string, string> {
  const resources = listKnowledgeResources();
  const map = new Map<string, string>();
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

  async retrieve(query: string, topK: number = 3, filterLanguage?: RagLanguage): Promise<RagReference[]> {
    const qv = await this.model.embed(query);
    const candidates: Array<{
      score: number;
      record: EmbeddingRecord;
      snippet: string;
      origin?: string;
      uri?: string;
    }> = [];

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
    return candidates.slice(0, topK).map((candidate) => ({
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

function extractSnippetAndOrigin(text: string): { snippet: string; origin?: string } {
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

function deriveUri(record: EmbeddingRecord, origin?: string): string | undefined {
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
