/*
C64 MCP - Context Loader and Utilities
GPL-2.0-only
*/

import fs from "node:fs/promises";
import path from "node:path";

export interface BootstrapContext {
  primer: string; // bootstrap.md
  agents: string; // agents.md
  prompts: string; // prompts.md
  chat: string; // chat.md
}

const ROOT = process.cwd();
const BOOTSTRAP_PATH = path.resolve(ROOT, "bootstrap.md");
const AGENTS_PATH = path.resolve(ROOT, "agents.md");
const PROMPTS_PATH = path.resolve(ROOT, "prompts.md");
const CHAT_PATH = path.resolve(ROOT, "chat.md");

export async function loadBootstrapContext(): Promise<BootstrapContext> {
  const [primer, agents, prompts, chat] = await Promise.all([
    readIfExists(BOOTSTRAP_PATH),
    readIfExists(AGENTS_PATH),
    readIfExists(PROMPTS_PATH),
    readIfExists(CHAT_PATH),
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
    if ((/compose|song|melody|music|sid/).test(lowered) && name.includes("compose")) return annotated(sec.content, "prompts.md", sec.header);
    if ((/disassemble|decode|memory|dump|range/).test(lowered) && name.includes("disassemble")) return annotated(sec.content, "prompts.md", sec.header);
    if ((/petscii|art|image|screen/).test(lowered) && name.includes("petscii")) return annotated(sec.content, "prompts.md", sec.header);
    if ((/print|printer|device\s*4|epson|commodore/).test(lowered) && name.includes("print")) return annotated(sec.content, "prompts.md", sec.header);
    if ((/sprite|graphics|move/).test(lowered) && name.includes("sprite")) return annotated(sec.content, "prompts.md", sec.header);
  }
  return undefined;
}

function annotated(content: string, source: string, section: string): string {
  return `<!-- Source: ${source} | Section: ${section} -->\n${content.trim()}`;
}
