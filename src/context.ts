/*
C64 MCP - Context Loader and Utilities
GPL-2.0-only
*/

import fs from "node:fs/promises";
import path from "node:path";

export interface BootstrapContext {
  primer: string; // doc/context/bootstrap.md
  agents: string; // AGENTS.md personas section
  prompts: PromptDefinition[];
  chat: string; // doc/context/chat.md
}

export interface PromptDefinition {
  id: string;
  title: string;
  keywords: string[];
  body: string;
  source: string;
}

const ROOT = process.cwd();
const BOOTSTRAP_PATH = path.resolve(ROOT, "doc/context/bootstrap.md");
const AGENTS_PATH = path.resolve(ROOT, "AGENTS.md");
const PROMPTS_DIR = path.resolve(ROOT, ".github/prompts");
const CHAT_PATH = path.resolve(ROOT, "doc/context/chat.md");

export async function loadBootstrapContext(): Promise<BootstrapContext> {
  const [primer, agents, prompts, chat] = await Promise.all([
    readIfExists(BOOTSTRAP_PATH),
    readIfExists(AGENTS_PATH),
    loadPromptDefinitions(),
    readIfExists(CHAT_PATH),
  ]);
  return {
    primer: primer ?? "",
    agents: agents ?? "",
    prompts: prompts ?? [],
    chat: chat ?? "",
  };
}

async function readIfExists(file: string): Promise<string | undefined> {
  try {
    return await fs.readFile(file, "utf8");
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw err;
  }
}

async function loadPromptDefinitions(): Promise<PromptDefinition[]> {
  try {
    await fs.access(PROMPTS_DIR);
  } catch {
    return [];
  }
  const dirEntries = await fs.readdir(PROMPTS_DIR, { withFileTypes: true });
  const files = dirEntries.filter((entry) => entry.isFile() && entry.name.endsWith(".prompt.md"));
  files.sort((a, b) => a.name.localeCompare(b.name));

  const defs: PromptDefinition[] = [];
  for (const entry of files) {
    const filePath = path.join(PROMPTS_DIR, entry.name);
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = parsePromptFile(raw, entry.name, filePath);
      defs.push(parsed);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`Failed to load prompt ${entry.name}:`, err);
    }
  }
  return defs;
}

function parsePromptFile(raw: string, fileName: string, filePath: string): PromptDefinition {
  const { body, metadata } = stripFrontmatterAndMetadata(raw);
  const slug = fileName.replace(/\.prompt\.md$/, "");
  const id = metadata.id ?? slug.replace(/[-\s]+/g, "_");
  const title = metadata.title ?? slug
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  const keywords = metadata.keywords ?? slug.split(/[-_]/).map((part) => part.toLowerCase());
  const source = path.relative(ROOT, filePath).split(path.sep).join("/");
  return {
    id,
    title,
    keywords,
    body: body.trim(),
    source,
  };
}

function stripFrontmatterAndMetadata(raw: string): { body: string; metadata: { id?: string; title?: string; keywords?: string[] } } {
  let text = raw.trim();
  const metadata: { id?: string; title?: string; keywords?: string[] } = {};

  const frontmatterMatch = /^---\s*\n([\s\S]*?)\n---\s*/.exec(text);
  if (frontmatterMatch) {
    text = text.slice(frontmatterMatch[0].length).trimStart();
  }

  const idMatch = text.match(/<!--\s*id:\s*([^>]+?)\s*-->/i);
  if (idMatch) {
    metadata.id = idMatch[1].trim();
    text = text.replace(idMatch[0], "").trimStart();
  }

  const keywordMatch = text.match(/<!--\s*keywords:\s*([^>]+?)\s*-->/i);
  if (keywordMatch) {
    metadata.keywords = keywordMatch[1]
      .split(/[,\s]+/)
      .map((word) => word.trim().toLowerCase())
      .filter(Boolean);
    text = text.replace(keywordMatch[0], "").trimStart();
  }

  const titleMatch = text.match(/<!--\s*title:\s*([^>]+?)\s*-->/i);
  if (titleMatch) {
    metadata.title = titleMatch[1].trim();
    text = text.replace(titleMatch[0], "").trimStart();
  }

  return { body: text, metadata };
}

// --- Helpers to extract sections by Markdown header ---

export interface SectionMatch {
  header: string; // header text without hashes
  content: string; // content following the header up to next header
}

export function extractSections(markdown: string, level: number = 2): SectionMatch[] {
  const lines = markdown.split(/\r?\n/);
  const re = new RegExp(`^${"#".repeat(level)}\\s+(.*)$`);
  const results: SectionMatch[] = [];
  let current: SectionMatch | null = null;

  for (const line of lines) {
    const m = re.exec(line);
    if (m) {
      if (current) results.push(current);
      current = { header: m[1].trim(), content: "" };
    } else if (current) {
      current.content += (current.content ? "\n" : "") + line;
    }
  }
  if (current) results.push(current);
  return results;
}

export function matchAgent(userText: string, agentsMd: string): string | undefined {
  const sections = extractSections(agentsMd, 2);
  const lowered = userText.toLowerCase();
  for (const sec of sections) {
    const name = sec.header.toLowerCase();
    if (lowered.includes("basic") && name.includes("basic")) return sec.content.trim();
    if ((/asm|assembly|machine\s*code/).test(lowered) && name.includes("asm")) return sec.content.trim();
    if ((/sid|music|song|compose/).test(lowered) && name.includes("sid")) return sec.content.trim();
    if ((/memory|peek|poke|disassemble|screen|color|colour/).test(lowered) && name.includes("memory")) return sec.content.trim();
    if ((/drive|d64|d71|d81|mount|disk/).test(lowered) && name.includes("drive")) return sec.content.trim();
  }
  return undefined;
}

export function matchPrompt(userText: string, prompts: PromptDefinition[]): string | undefined {
  const lowered = userText.toLowerCase();
  for (const prompt of prompts) {
    const keywords = prompt.keywords.length > 0 ? prompt.keywords : [prompt.title.toLowerCase()];
    if (keywords.some((keyword) => keyword && lowered.includes(keyword))) {
      return annotated(prompt.body, prompt.source, prompt.title);
    }
  }
  return undefined;
}

function annotated(content: string, source: string, section: string): string {
  return `<!-- Source: ${source} | Section: ${section} -->\n${content.trim()}`;
}
