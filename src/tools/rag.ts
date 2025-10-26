import type { RagLanguage } from "../rag/types.js";
import { listKnowledgeResources } from "../rag/knowledgeIndex.js";
import { defineToolModule, type ToolExecutionContext } from "./types.js";
import { objectSchema, optionalSchema, stringSchema, numberSchema } from "./schema.js";
import { textResult } from "./responses.js";
import {
  ToolError,
  ToolExecutionError,
  toolErrorResult,
  unknownErrorResult,
} from "./errors.js";

interface RagRetrieveArgs extends Record<string, unknown> {
  q: string;
  k?: number;
}

const ragRetrieveArgsSchema = objectSchema<RagRetrieveArgs>({
  description: "Retrieve domain-specific references from the local C64 knowledge base using embeddings.",
  properties: {
    q: stringSchema({
      description: "Natural-language query describing the desired BASIC or assembly guidance.",
      minLength: 3,
    }),
    k: optionalSchema(
      numberSchema({
        description: "Maximum number of references to return (1-12).",
        integer: true,
        minimum: 1,
        maximum: 12,
        default: 3,
      }),
    ),
  },
  required: ["q"],
  additionalProperties: false,
});

function createRagTool(language: RagLanguage, options: { description: string; summary: string; tags: readonly string[] }) {
  const primaryResourceUris = language === "basic"
    ? ["c64://specs/basic", "c64://context/bootstrap"]
    : ["c64://specs/assembly", "c64://context/bootstrap"];

  return {
    name: language === "basic" ? "rag_retrieve_basic" : "rag_retrieve_asm",
    description:
      language === "basic"
        ? "Retrieve BASIC references from local knowledge. See c64://specs/basic before coding."
        : "Retrieve 6502/6510 assembly references from local knowledge. See c64://specs/assembly.",
    summary: options.summary,
    inputSchema: ragRetrieveArgsSchema.jsonSchema,
    relatedResources:
      language === "basic"
        ? ["c64://specs/basic"]
        : ["c64://specs/assembly"],
    relatedPrompts:
      language === "basic"
        ? ["basic-program"]
        : ["assembly-program"],
    tags: options.tags,
    prerequisites: [],
    examples: [
      {
        name: language === "basic" ? "BASIC PRINT" : "Raster IRQ",
        description: language === "basic" ? "Find PRINT and device usage" : "Find stable raster IRQ snippet",
        arguments:
          language === "basic"
            ? { q: "PRINT to device 4 form feed", k: 3 }
            : { q: "stable raster irq acknowledge d019", k: 3 },
      },
    ],
    workflowHints: language === "basic"
      ? [
        "Use when the user needs BASIC examples or syntax reminders before coding.",
        "Summarise key references so the user knows where to look next.",
      ]
      : [
        "Call for assembly patterns, addressing tricks, or hardware explanations before writing code.",
        "Highlight registers or memory addresses found in the returned references.",
      ],
    async execute(args: unknown, ctx: ToolExecutionContext) {
      try {
        const parsed = ragRetrieveArgsSchema.parse(args ?? {});
        const limit = parsed.k ?? 3;

        ctx.logger.debug("Retrieving RAG references", {
          language,
          queryLength: parsed.q.length,
          limit,
        });

        let refs: string[];
        try {
          refs = await ctx.rag.retrieve(parsed.q, limit, language);
        } catch (error) {
          throw new ToolExecutionError("RAG retrieval failed", { cause: error });
        }

        const resources = listKnowledgeResources();
        const primaryResources = primaryResourceUris
          .map((uri) => resources.find((entry) => entry.uri === uri))
          .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

        const ragCount = refs.length;

        const primaryLines = primaryResources.length
          ? primaryResources.map((entry) => `- ${entry.name} (${entry.uri}) — ${entry.metadata.summary}`)
          : ["- No curated resources found."];

        const ragLines = ragCount
          ? refs.map((ref, index) => `${index + 1}. ${ref}`)
          : ["No supplemental RAG references were found."];

        const text = [
          "Primary knowledge resources (consult these first):",
          ...primaryLines,
          "",
          "Supplemental RAG references:",
          ...ragLines,
        ].join("\n");

        const base = textResult(text, {
          success: true,
          language,
          limit,
          queryLength: parsed.q.length,
          count: ragCount,
        });

        return {
          ...base,
          structuredContent: {
            type: "json" as const,
            data: {
              primaryResources: primaryResources.map((entry) => ({
                uri: entry.uri,
                name: entry.name,
                summary: entry.metadata.summary,
              })),
              refs,
            },
          },
        };
      } catch (error) {
        if (error instanceof ToolError) {
          return toolErrorResult(error);
        }
        return unknownErrorResult(error);
      }
    },
  } as const;
}

export const ragModule = defineToolModule({
  domain: "rag",
  summary: "Retrieval-augmented generation helpers for BASIC and assembly examples.",
  resources: [
    "c64://specs/basic",
    "c64://specs/assembly",
    "c64://docs/index",
  ],
  prompts: ["basic-program", "assembly-program"],
  defaultTags: ["rag", "search"],
  supportedPlatforms: ["c64u", "vice"] as const,
  workflowHints: [
    "Call RAG tools when the user needs references or examples before generating new code.",
    "Summarise the number of refs returned and suggest follow-up actions like reading specific docs.",
  ],
  tools: [
    createRagTool("basic", {
      description: "Retrieve BASIC snippets, guidance, and discussion relevant to the provided query.",
      summary: "Returns BASIC-focused references from the local knowledge base.",
      tags: ["basic"],
    }),
    createRagTool("asm", {
      description: "Retrieve 6502/6510 assembly routines and references relevant to the provided query.",
      summary: "Returns assembly-focused references from the local knowledge base.",
      tags: ["asm"],
    }),
  ],
});
