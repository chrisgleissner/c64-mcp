/*
C64 MCP - Context Loader and Utilities
GPL-2.0-only
*/

import fs from "node:fs/promises";
import path from "node:path";

export interface BootstrapContext {
  primer: string; // doc/bootstrap.md
  agents: string; // AGENTS.md (fallback: agents.md)
  prompts: string; // concatenated .github/prompts/*.md
  chat: string; // doc/chat.md
}

const ROOT = process.cwd();
const DOC_ROOT = path.resolve(ROOT, "doc");
const BOOTSTRAP_PATH = path.resolve(ROOT, "doc/bootstrap.md");
const AGENTS_PATHS = [
  path.resolve(ROOT, "AGENTS.md"),
  path.resolve(ROOT, "agents.md"),
];
const PROMPTS_DIR = path.resolve(ROOT, ".github/prompts");
const CHAT_PATH = path.resolve(ROOT, "doc/chat.md");

export async function loadBootstrapContext(): Promise<BootstrapContext> {
  const primerP = readIfExists(BOOTSTRAP_PATH);
  const agentsP = readFirstExisting(AGENTS_PATHS);
  const promptsP = readAllMarkdownUnder(PROMPTS_DIR).then((files) =>
    files.map((f) => f.content).join("\n\n\n")
  );
  const chatP = readIfExists(CHAT_PATH);

  const [primer, agents, prompts, chat] = await Promise.all([
    primerP,
    agentsP,
    promptsP,
    chatP,
  ]);
  return {
    primer: primer ?? "",
    agents: agents ?? "",
    prompts: prompts ?? "",
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

async function readFirstExisting(paths: string[]): Promise<string | undefined> {
  for (const p of paths) {
    try {
      return await fs.readFile(p, "utf8");
    } catch (err) {
      if (!err || typeof err !== "object" || !("code" in err) || (err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
    }
  }
  return undefined;
}

async function readAllMarkdownUnder(dir: string): Promise<Array<{ file: string; content: string }>> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".md"))
      .map((e) => path.join(dir, e.name))
      .sort((a, b) => a.localeCompare(b));
    const contents: Array<{ file: string; content: string }> = [];
    for (const f of files) {
      try {
        const text = await fs.readFile(f, "utf8");
        // Keep provenance for downstream consumers
        contents.push({ file: f, content: `<!-- Source: ${path.relative(ROOT, f)} -->\n${text.trim()}` });
      } catch {
        // skip unreadable files
      }
    }
    return contents;
  } catch {
    return [];
  }
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

export function matchPrompt(userText: string, promptsMd: string): string | undefined {
  const sections = extractSections(promptsMd, 2);
  const lowered = userText.toLowerCase();
  for (const sec of sections) {
    const name = sec.header.toLowerCase();
    if ((/compose|song|melody|music|sid/).test(lowered) && name.includes("compose")) return annotated(sec.content, ".github/prompts", sec.header);
    if ((/disassemble|decode|memory|dump|range/).test(lowered) && name.includes("disassemble")) return annotated(sec.content, ".github/prompts", sec.header);
    if ((/petscii|art|image|screen/).test(lowered) && name.includes("petscii")) return annotated(sec.content, ".github/prompts", sec.header);
    if ((/print|printer|device\s*4|epson|commodore/).test(lowered) && name.includes("print")) return annotated(sec.content, ".github/prompts", sec.header);
    if ((/sprite|graphics|move/).test(lowered) && name.includes("sprite")) return annotated(sec.content, ".github/prompts", sec.header);
  }
  return undefined;
}

function annotated(content: string, source: string, section: string): string {
  return `<!-- Source: ${source} | Section: ${section} -->\n${content.trim()}`;
}
