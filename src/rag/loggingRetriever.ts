import { formatErrorMessage, formatPayloadForDebug, loggerFor, payloadByteLength, type PrefixedLogger } from "../logger.js";
import type { RagRetriever, RagLanguage } from "./types.js";

export class LoggingRagRetriever implements RagRetriever {
  private readonly inner: RagRetriever;
  private readonly log: PrefixedLogger;

  constructor(inner: RagRetriever, logger: PrefixedLogger = loggerFor("rag")) {
    this.inner = inner;
    this.log = logger;
  }

  async retrieve(query: string, topK?: number, filterLanguage?: RagLanguage): Promise<string[]> {
    const startedAt = Date.now();

    if (this.log.isDebugEnabled()) {
      this.log.debug("rag request", {
        query,
        topK,
        language: filterLanguage,
      });
    }

    try {
      const results = await this.inner.retrieve(query, topK, filterLanguage);
      const latency = Date.now() - startedAt;
      const bytes = payloadByteLength(results);
      const keywords = summarizeQuery(query);
      const language = filterLanguage ?? "any";

      this.log.info(`retrieve language=${language} keywords="${keywords}" hits=${results.length} bytes=${bytes} latencyMs=${latency}`);

      if (this.log.isDebugEnabled()) {
        this.log.debug("rag response", {
          results: formatPayloadForDebug(results),
        });
      }

      return results;
    } catch (error) {
      const latency = Date.now() - startedAt;
      const keywords = summarizeQuery(query);
      const language = filterLanguage ?? "any";
      this.log.error(`retrieve language=${language} keywords="${keywords}" bytes=0 latencyMs=${latency} error=${formatErrorMessage(error)}`);
      throw error;
    }
  }
}

function summarizeQuery(query: string): string {
  const cleaned = query.trim().replace(/\s+/g, " ");
  if (!cleaned) return "";
  const words = cleaned.split(" ").slice(0, 6);
  const summary = words.join(" ");
  return summary.length > 64 ? `${summary.slice(0, 61)}...` : summary;
}
