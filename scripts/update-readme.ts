#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describeToolModules, type ToolModuleDescriptor } from "../src/tools/registry.js";
import type { JsonSchema, ToolDescriptor } from "../src/tools/types.js";
import { listKnowledgeResources } from "../src/rag/knowledgeIndex.js";
import { createPromptRegistry } from "../src/prompts/registry.js";

const START_MARKER = "<!-- AUTO-GENERATED:MCP-DOCS-START -->";
const END_MARKER = "<!-- AUTO-GENERATED:MCP-DOCS-END -->";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "..");
const README_PATH = join(PROJECT_ROOT, "README.md");

function titleCase(input: string): string {
  return input
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n|\r/g, " ").trim();
}

function formatTags(tags: readonly string[]): string {
  if (!tags.length) {
    return "—";
  }
  return tags.map((tag) => `\`${tag}\``).join(", ");
}

function renderTable(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const headerLine = `| ${headers.join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
  return [headerLine, separator, body].filter(Boolean).join("\n");
}

type GroupedOperation = {
  readonly op: string;
  readonly description: string;
  readonly required: readonly string[];
  readonly notes: readonly string[];
};

type GroupedToolInfo = {
  readonly tool: ToolDescriptor;
  readonly operations: readonly GroupedOperation[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function toTableValue(values: readonly string[]): string {
  if (!values.length) {
    return "—";
  }
  return values.join(", ");
}

function collectGroupedOperations(schema?: JsonSchema): readonly GroupedOperation[] {
  if (!schema || !isObject(schema)) {
    return [];
  }

  const discriminator = (schema as JsonSchema & { discriminator?: { propertyName?: string } }).discriminator;
  const variants = (schema as JsonSchema & { oneOf?: readonly JsonSchema[] }).oneOf;

  if (!discriminator || discriminator.propertyName !== "op" || !Array.isArray(variants)) {
    return [];
  }

  const operations: GroupedOperation[] = [];

  for (const variant of variants) {
    if (!variant || !isObject(variant)) {
      continue;
    }

    const typedVariant = variant as JsonSchema;
    const properties = (typedVariant.properties ?? {}) as Record<string, JsonSchema | undefined>;
    const opSchema = properties.op;

    let opName: string | undefined;
    if (opSchema && isObject(opSchema)) {
      const constValue = (opSchema as JsonSchema & { const?: unknown }).const;
      if (typeof constValue === "string" && constValue.length > 0) {
        opName = constValue;
      } else if (Array.isArray((opSchema as JsonSchema).enum) && (opSchema as JsonSchema).enum![0]) {
        const enumValue = (opSchema as JsonSchema).enum![0];
        if (typeof enumValue === "string") {
          opName = enumValue;
        }
      }
    }

    if (!opName) {
      continue;
    }

    const description = getString(typedVariant.description, getString(opSchema?.description, `Operation ${opName}`));
    const requiredProps = ((typedVariant.required as readonly string[] | undefined) ?? []).filter((name) => name !== "op");

    const notes: string[] = [];
    const hasVerificationProperty = Object.keys(properties).some((name) =>
      name.toLowerCase().startsWith("verify"),
    );
    if (hasVerificationProperty) {
      notes.push("supports verify");
    }

    operations.push({
      op: opName,
      description,
      required: requiredProps,
      notes,
    });
  }

  return operations;
}

export function renderToolsSection(modules: readonly ToolModuleDescriptor[] = describeToolModules()): string[] {
  const lines: string[] = ["### Tools", ""];

  for (const module of modules) {
    lines.push(`#### ${titleCase(module.domain)}`);
    if (module.summary) {
      lines.push(`> ${module.summary}`);
    }
    if (module.workflowHints.length) {
      lines.push("");
      lines.push("**Workflow hints:**");
      for (const hint of module.workflowHints) {
        lines.push(`- ${hint}`);
      }
    }
    if (module.defaultTags.length) {
      lines.push("");
      lines.push(`**Default tags:** ${module.defaultTags.map((tag) => `\`${tag}\``).join(", ")}`);
    }

    const groupedTools: GroupedToolInfo[] = [];
    const rows = module.tools
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((tool) => {
        const operations = collectGroupedOperations(tool.inputSchema);
        if (operations.length > 0) {
          groupedTools.push({ tool, operations });
        }
        return [
          `\`${tool.name}\``,
          escapeCell(tool.description),
          formatTags(tool.metadata.tags),
        ];
      });

    lines.push("");
    if (rows.length) {
      lines.push(renderTable(["Name", "Description", "Tags"], rows));
    } else {
      lines.push("_No tools registered._");
    }
    lines.push("");

    for (const grouped of groupedTools) {
      lines.push(`##### Operations: \`${grouped.tool.name}\``);
      lines.push("");

      const operationRows = grouped.operations
        .slice()
        .sort((a, b) => a.op.localeCompare(b.op))
        .map((operation) => [
          `\`${operation.op}\``,
          escapeCell(operation.description),
          escapeCell(toTableValue(operation.required.map((name) => `\`${name}\``))),
          operation.notes.length ? escapeCell(operation.notes.join(", ")) : "—",
        ]);

      lines.push(renderTable(["Operation", "Description", "Required Inputs", "Notes"], operationRows));
      lines.push("");
    }
  }

  return lines;
}

export function renderResourcesSection(): string[] {
  const resources = listKnowledgeResources()
    .slice()
    .sort((a, b) => {
      const bundleOrder = a.metadata.bundle.order - b.metadata.bundle.order;
      if (bundleOrder !== 0) {
        return bundleOrder;
      }
      return a.metadata.order - b.metadata.order;
    });

  const rows = resources.map((resource) => [
    `\`${resource.uri}\``,
    escapeCell(resource.metadata.summary || resource.description),
  ]);

  return [
    "### Resources",
    "",
    rows.length ? renderTable(["Name", "Summary"], rows) : "_No resources registered._",
    "",
  ];
}

export function renderPromptsSection(): string[] {
  const promptRegistry = createPromptRegistry();
  const prompts = promptRegistry
    .list()
    .slice()
    .sort((a, b) => a.descriptor.name.localeCompare(b.descriptor.name));

  const rows = prompts.map((entry) => [
    `\`${entry.descriptor.name}\``,
    escapeCell(entry.descriptor.description),
  ]);

  return [
    "### Prompts",
    "",
    rows.length ? renderTable(["Name", "Description"], rows) : "_No prompts registered._",
    "",
  ];
}

export function renderSummarySection(): string[] {
  const modules = describeToolModules();
  const resources = listKnowledgeResources();
  const promptRegistry = createPromptRegistry();
  const prompts = promptRegistry.list();

  const toolCount = modules.reduce((sum, module) => sum + module.tools.length, 0);
  const resourceCount = resources.length;
  const promptCount = prompts.length;

  return [
    `This MCP server exposes **${toolCount} tools**, **${resourceCount} resources**, and **${promptCount} prompts** for controlling your Commodore 64.`,
    "",
  ];
}

export function buildDocumentation(): string {
  const sections = [renderSummarySection(), renderToolsSection(), renderResourcesSection(), renderPromptsSection()];
  return sections.flat().join("\n").trim();
}

export async function updateReadme(): Promise<boolean> {
  const readme = await readFile(README_PATH, "utf8");
  const pattern = new RegExp(
    `${START_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([\\s\\S]*?)${END_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
  );
  if (!pattern.test(readme)) {
    throw new Error(
      `Could not find auto-generated section markers (${START_MARKER} / ${END_MARKER}) in README.md`,
    );
  }

  const generated = `\n\n${buildDocumentation()}\n\n`;
  const nextReadme = readme.replace(pattern, `${START_MARKER}${generated}${END_MARKER}`);

  if (nextReadme === readme) {
    return false;
  }

  await writeFile(README_PATH, nextReadme, "utf8");
  return true;
}

function isMainModule(metaUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  try {
    const entryUrl = pathToFileURL(resolvePath(entry)).href;
    return entryUrl === metaUrl;
  } catch {
    return false;
  }
}

if (isMainModule(import.meta.url)) {
  try {
    const updated = await updateReadme();
    if (updated) {
      console.error("README.md updated with MCP documentation.");
    }
  } catch (error) {
    console.error("Failed to update README.md:", error);
    process.exitCode = 1;
  }
}
