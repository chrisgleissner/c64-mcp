/*
C64 Bridge - Local RAG Indexer
GPL-2.0-only
*/
import fs from "node:fs/promises";
import path from "node:path";
import fsSync from "node:fs";
const BASIC_DIR = path.resolve("data/basic/examples");
const ASM_DIR = path.resolve("data/assembly/examples");
const EXTERNAL_DIR = path.resolve("external");
const DOC_ROOT = path.resolve("doc");
const CONTEXT_DIR = path.resolve("data/context");
const BOOTSTRAP_PATH = path.join(CONTEXT_DIR, "bootstrap.md");
const AGENTS_PATH = path.resolve("AGENTS.md");
const PROMPTS_DIR = path.resolve(".github/prompts");
const CHAT_PATH = path.join(CONTEXT_DIR, "chat.md");
// RAG_DOC_FILES env var can add extra specific files, comma-separated
const ENV_DOC_FILES = (process.env.RAG_DOC_FILES ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => path.resolve(entry));
function resolveEmbeddingsDir(override) {
    return path.resolve(override ?? process.env.RAG_EMBEDDINGS_DIR ?? "data");
}
function embeddingIndexPaths(dir) {
    return {
        basic: path.join(dir, "embeddings_basic.json"),
        asm: path.join(dir, "embeddings_asm.json"),
        mixed: path.join(dir, "embeddings_mixed.json"),
        hardware: path.join(dir, "embeddings_hardware.json"),
        other: path.join(dir, "embeddings_other.json"),
    };
}
export async function ensureSeedDirs() {
    await fs.mkdir(BASIC_DIR, { recursive: true });
    await fs.mkdir(ASM_DIR, { recursive: true });
    // External dir is created by the fetch CLI; ensure it exists for indexing if present
    if (!fsSync.existsSync(EXTERNAL_DIR)) {
        try {
            await fs.mkdir(EXTERNAL_DIR, { recursive: true });
        }
        catch { }
    }
}
async function collectFiles(root, exts) {
    const results = [];
    async function walk(dir) {
        let entries = [];
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                await walk(full);
            }
            else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (exts.includes(ext))
                    results.push(full);
            }
        }
    }
    await walk(root);
    return results.sort();
}
async function loadText(file) {
    return fs.readFile(file, "utf8");
}
function isWithinExternal(dir) {
    const rel = path.relative(EXTERNAL_DIR, path.resolve(dir));
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
async function resolveRepoMetadata(file) {
    let current = path.dirname(file);
    const visited = [];
    while (isWithinExternal(current)) {
        const resolved = path.resolve(current);
        if (repoMetadataCache.has(resolved)) {
            const cached = repoMetadataCache.get(resolved);
            for (const visit of visited) {
                repoMetadataCache.set(visit, cached);
            }
            return { metadata: cached, repoRoot: cached ? resolved : undefined };
        }
        const metadataPath = path.join(resolved, "_metadata.json");
        try {
            const raw = await fs.readFile(metadataPath, "utf8");
            const parsed = JSON.parse(raw);
            if (parsed && parsed.type === "github" && typeof parsed.owner === "string" && typeof parsed.repo === "string") {
                const metadata = {
                    type: "github",
                    owner: parsed.owner,
                    repo: parsed.repo,
                    branch: typeof parsed.branch === "string" ? parsed.branch : undefined,
                    repoUrl: typeof parsed.repoUrl === "string" ? parsed.repoUrl : `https://github.com/${parsed.owner}/${parsed.repo}`,
                    license: parsed.license
                        ? {
                            spdxId: parsed.license.spdxId ?? null,
                            name: parsed.license.name ?? null,
                            url: parsed.license.url ?? null,
                            attribution: parsed.license.attribution ?? null,
                        }
                        : null,
                };
                repoMetadataCache.set(resolved, metadata);
                for (const visit of visited) {
                    repoMetadataCache.set(visit, metadata);
                }
                return { metadata, repoRoot: resolved };
            }
            repoMetadataCache.set(resolved, null);
        }
        catch (err) {
            if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
                // ignore missing metadata file
            }
            else {
                repoMetadataCache.set(resolved, null);
            }
        }
        visited.push(resolved);
        if (resolved === EXTERNAL_DIR)
            break;
        const parent = path.dirname(resolved);
        if (parent === resolved)
            break;
        current = parent;
    }
    for (const visit of visited) {
        if (!repoMetadataCache.has(visit)) {
            repoMetadataCache.set(visit, null);
        }
    }
    return { metadata: null };
}
const BASIC_KEYWORDS = [
    "PRINT",
    "GOTO",
    "GOSUB",
    "FOR",
    "NEXT",
    "IF",
    "THEN",
    "REM",
    "POKE",
    "DATA",
    "READ",
    "INPUT",
    "RUN",
    "SYS",
    "RESTORE",
    "RETURN",
    "END",
    "TAB(",
    "TI$",
    "PEEK",
    "USR",
    "CHR$",
    "LEFT$",
    "RIGHT$",
];
const BASIC_KEYWORD_REGEX = BASIC_KEYWORDS.map((keyword) => {
    const escaped = escapeRegExp(keyword);
    if (/\w$/.test(keyword)) {
        return new RegExp(`\\b${escaped}\\b`, "i");
    }
    return new RegExp(`\\b${escaped}`, "i");
});
const ASM_OPCODES = new Set([
    "ADC", "AND", "ASL", "BCC", "BCS", "BEQ", "BIT", "BMI", "BNE", "BPL", "BRK", "BVC", "BVS",
    "CLC", "CLD", "CLI", "CLV", "CMP", "CPX", "CPY", "DEC", "DEX", "DEY", "EOR", "INC", "INX",
    "INY", "JMP", "JSR", "LDA", "LDX", "LDY", "LSR", "NOP", "ORA", "PHA", "PHP", "PLA", "PLP",
    "ROL", "ROR", "RTI", "RTS", "SBC", "SEC", "SED", "SEI", "STA", "STX", "STY", "TAX", "TAY",
    "TSX", "TXA", "TXS", "TYA",
]);
const ASM_DIRECTIVE_RE = /^\s*(?:!|\.)(?:byte|word|text|ascii|pet|fill|scr|org|addr|set|equ|macro|endm|include|ifdef|ifndef|endif)/i;
const ASM_OPCODE_RE = /^\s*(?:[A-Z_][\w]*\s*:\s*)?(?:\.\w+\s+)?([A-Z]{2,4})\b/;
const HARDWARE_KEYWORDS = [
    "SID", "VIC", "VIC-II", "VICII", "CIA", "CIA1", "CIA2", "6510", "6502", "6526", "COLOR RAM",
    "SPRITE", "RASTER", "KERNAL", "SCREEN RAM", "BORDER", "JOYSTICK", "SERIAL BUS", "IEC",
    "LORAM", "HIRAM", "CHAREN", "BASIC ROM", "KERNAL ROM", "ULTIMATE 64", "DMA", "NMI", "IRQ",
    "AUDIO FILTER", "VOICE 1", "VOICE 2", "VOICE 3",
];
const HARDWARE_DECIMAL_ADDRS = new Set([
    53248, 53249, 53250, 53251, 53252, 53253, 53254, 53255, 53256, 53257, 53258, 53259, 53260, 53261, 53262, 53263,
    53264, 53265, 53266, 53267, 53268, 53269, 53270, 53271, 53272, 53273, 53274, 53275, 53276, 53277, 53278, 53279,
    53280, 53281, 53282, 53283, 53284, 53285, 53286, 53287, 53288, 53289, 53290, 53291, 53292, 53293, 53294, 53295,
    54272, 54273, 54274, 54275, 54276, 54277, 54278, 54279, 54280, 54281, 54282, 54283, 54284, 54285, 54286, 54287,
    56320, 56321, 56322, 56323, 56324, 56325,
]);
const HARDWARE_HEX_ADDR_RE = /\$[D4F][0-9A-F]{3}\b|\$040[0-9A-F]\b/i;
const BASIC_DECIMAL_ADDR_RE = /\b53(26[0-9]|27[0-9]|28[0-9]|29[0-9])\b/;
const BASIC_EXTS = [".bas", ".txt"];
const ASM_EXTS = [".asm", ".s", ".a65", ".inc", ".mac", ".lst", ".pal", ".src", ".txt", ".md"];
const EXTERNAL_EXTS = Array.from(new Set([...BASIC_EXTS, ...ASM_EXTS, ".seq"]));
const CATEGORY_LIST = ["basic", "asm", "mixed", "hardware", "other"];
const BASIC_SCORE_THRESHOLD = 4;
const ASM_SCORE_THRESHOLD = 4;
const HARDWARE_SCORE_THRESHOLD = 2;
const repoMetadataCache = new Map();
function readPromptFiles() {
    try {
        return fsSync
            .readdirSync(PROMPTS_DIR, { withFileTypes: true })
            .filter((entry) => entry.isFile() && entry.name.endsWith(".prompt.md"))
            .map((entry) => path.join(PROMPTS_DIR, entry.name))
            .sort();
    }
    catch {
        return [];
    }
}
function analyzeText(text) {
    const lines = text.split(/\r?\n/);
    let basicScore = 0;
    let asmScore = 0;
    let hardwareScore = 0;
    let basicLines = 0;
    let asmLines = 0;
    const lowered = text.toLowerCase();
    if (/```(?:basic|commodore|cbm-basic)/.test(lowered)) {
        basicScore += 4;
    }
    if (/```(?:asm|assembly|ca65|acme|kickass)/.test(lowered)) {
        asmScore += 4;
    }
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            continue;
        }
        const upper = trimmed.toUpperCase();
        if (/^\d{1,5}\s/.test(trimmed)) {
            basicScore += 3;
            basicLines++;
        }
        if (BASIC_DECIMAL_ADDR_RE.test(trimmed)) {
            hardwareScore += 1;
        }
        if (BASIC_KEYWORD_REGEX.some((regex) => regex.test(trimmed))) {
            basicScore += 1;
        }
        if (/\bREM\b/i.test(trimmed) || /\bPRINT\b/i.test(trimmed) || /\bINPUT\b/i.test(trimmed)) {
            basicScore += 1;
        }
        if (/^\s*\*\s*=\s*\$?[0-9A-F]{3,4}/i.test(trimmed)) {
            asmScore += 3;
            asmLines++;
        }
        if (/^\s*;/.test(trimmed)) {
            asmScore += 1;
        }
        if (ASM_DIRECTIVE_RE.test(trimmed)) {
            asmScore += 2;
            asmLines++;
        }
        else {
            const match = ASM_OPCODE_RE.exec(upper);
            if (match) {
                const opcode = match[1];
                if (opcode && ASM_OPCODES.has(opcode)) {
                    asmScore += 2;
                    asmLines++;
                }
            }
        }
        if (/\#?\$[0-9A-F]{2,4}/i.test(trimmed)) {
            asmScore += 1;
            hardwareScore += 0.5;
        }
        if (HARDWARE_HEX_ADDR_RE.test(trimmed)) {
            hardwareScore += 1;
        }
        const decimalMatches = trimmed.match(/\b\d{4,5}\b/g);
        if (decimalMatches) {
            for (const token of decimalMatches) {
                const value = Number(token);
                if (HARDWARE_DECIMAL_ADDRS.has(value)) {
                    hardwareScore += 1;
                }
            }
        }
        for (const keyword of HARDWARE_KEYWORDS) {
            if (upper.includes(keyword)) {
                hardwareScore += 1;
                break;
            }
        }
    }
    return { basicScore, asmScore, hardwareScore, basicLines, asmLines };
}
function escapeRegExp(input) {
    return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function decideCategory(analysis, ext, root) {
    const lowerExt = ext.toLowerCase();
    const hasBasic = analysis.basicScore >= BASIC_SCORE_THRESHOLD || analysis.basicLines >= 3;
    const hasAsm = analysis.asmScore >= ASM_SCORE_THRESHOLD || analysis.asmLines >= 3;
    const hasHardware = analysis.hardwareScore >= HARDWARE_SCORE_THRESHOLD;
    if (hasBasic && hasAsm)
        return "mixed";
    if (hasBasic)
        return "basic";
    if (hasAsm)
        return "asm";
    if (hasHardware)
        return "hardware";
    if (lowerExt === ".bas" || root === BASIC_DIR)
        return "basic";
    if ([".asm", ".s", ".a65", ".inc", ".mac", ".lst", ".pal", ".src"].includes(lowerExt) || root === ASM_DIR) {
        return "asm";
    }
    return "other";
}
function toPosixRelative(from, to) {
    return path.relative(from, to).split("\\").join("/");
}
function nameRelativeTo(root, file) {
    return toPosixRelative(root, file);
}
function sanitizeSectionTitle(input) {
    const trimmed = input.trim().replace(/\s+/g, " ");
    if (!trimmed)
        return "section";
    const collapsed = trimmed.replace(/[^A-Za-z0-9 -]/g, "").trim();
    const normalized = collapsed || "section";
    return normalized
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 60);
}
function detectHeadingCandidate(paragraph) {
    const singleLine = !/\n/.test(paragraph);
    if (!singleLine)
        return null;
    const trimmed = paragraph.trim();
    if (!trimmed)
        return null;
    if (trimmed.length > 80)
        return null;
    if (/^chapter\s+\d+/i.test(trimmed))
        return trimmed;
    if (/^(section|appendix|part)\b/i.test(trimmed))
        return trimmed;
    if (/^\d+(?:\.\d+)*\s+[A-Za-z]/.test(trimmed))
        return trimmed;
    const letters = trimmed.replace(/[^A-Za-z]/g, "");
    if (letters.length < 4)
        return null;
    const uppercase = letters.replace(/[^A-Z]/g, "");
    const lowercase = letters.replace(/[^a-z]/g, "");
    const uppercaseRatio = uppercase.length / letters.length;
    if (uppercaseRatio >= 0.7 && lowercase.length <= 2) {
        return trimmed;
    }
    return null;
}
function chunkPlainTextSections(text, filePath) {
    const normalized = text.replace(/\r\n?/g, "\n");
    const pages = normalized.split(/\f+/);
    const relativePath = toPosixRelative(process.cwd(), filePath);
    const results = [];
    const pushChunk = (payload, sectionTitle, sequence) => {
        if (!payload.length)
            return;
        const body = payload.join("\n\n").trim();
        if (!body)
            return;
        const suffix = sequence > 1 ? `-${sequence}` : "";
        const origin = `${relativePath}#${sanitizeSectionTitle(sectionTitle)}${suffix}`;
        results.push({ text: body, origin });
    };
    pages.forEach((pageText, pageIndex) => {
        const pageTag = `Page-${pageIndex + 1}`;
        const paragraphs = pageText.split(/\n{2,}/);
        let sectionTitle = pageTag;
        let payload = [];
        let charCount = 0;
        let chunkSequence = 1;
        const flush = () => {
            pushChunk(payload, sectionTitle, chunkSequence);
            if (payload.length) {
                chunkSequence += 1;
            }
            payload = [];
            charCount = 0;
        };
        for (const rawParagraph of paragraphs) {
            const paragraph = rawParagraph.trim();
            if (!paragraph)
                continue;
            const heading = detectHeadingCandidate(paragraph);
            if (heading) {
                flush();
                sectionTitle = heading;
                chunkSequence = 1;
                payload.push(paragraph);
                charCount = paragraph.length;
                continue;
            }
            const additionLength = payload.length ? paragraph.length + 2 : paragraph.length;
            if (charCount + additionLength > 1600) {
                flush();
            }
            payload.push(paragraph);
            charCount += additionLength;
        }
        flush();
    });
    if (results.length === 0) {
        const fallbackOrigin = `${relativePath}#Full`;
        return [{ text: normalized, origin: fallbackOrigin }];
    }
    return results;
}
async function buildIndexForCategory(category, files, model) {
    const records = [];
    const sorted = [...files].sort((a, b) => nameRelativeTo(a.root, a.file).localeCompare(nameRelativeTo(b.root, b.file)));
    for (const entry of sorted) {
        const vector = Array.from(await model.embed(entry.text));
        records.push({
            name: nameRelativeTo(entry.root, entry.file),
            language: category,
            vector,
            text: entry.text,
            sourcePath: toPosixRelative(process.cwd(), entry.file),
            sourceMtimeMs: entry.mtimeMs,
            sourceUrl: entry.sourceUrl,
            sourceRepoUrl: entry.sourceRepoUrl,
            license: entry.license,
            licenseSpdxId: entry.licenseSpdxId,
            licenseName: entry.licenseName,
            licenseUrl: entry.licenseUrl,
            attribution: entry.attribution,
            origin: entry.origin,
        });
    }
    return { dim: model.dim, model: model.constructor.name, records };
}
async function writeIndex(filePath, index) {
    const json = JSON.stringify(index);
    try {
        const existing = await fs.readFile(filePath, "utf8");
        if (existing === json) {
            return; // no-op if unchanged
        }
    }
    catch {
        // file does not exist or unreadable — proceed to write
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, json, "utf8");
}
export async function buildAllIndexes({ model, embeddingsDir: overrideDir, basicDirs, asmDirs, externalDirs, docFiles }) {
    await ensureSeedDirs();
    repoMetadataCache.clear();
    const embeddingsDir = resolveEmbeddingsDir(overrideDir);
    const paths = embeddingIndexPaths(embeddingsDir);
    // Collect all markdown files under doc/ recursively, plus any explicitly provided RAG_DOC_FILES
    const docCandidates = [];
    try {
        const mdFiles = await collectFiles(DOC_ROOT, [".md"]);
        for (const f of mdFiles)
            docCandidates.push(f);
    }
    catch { }
    for (const f of ENV_DOC_FILES)
        docCandidates.push(f);
    // De-duplicate
    const seenDocs = new Set();
    const docIncluded = docCandidates.filter((f) => {
        const exists = fsSync.existsSync(f);
        const norm = path.resolve(f);
        if (!exists || seenDocs.has(norm))
            return false;
        seenDocs.add(norm);
        return true;
    });
    const resolvedBasicDirs = (basicDirs ?? [BASIC_DIR]).map((dir) => path.resolve(dir));
    const resolvedAsmDirs = (asmDirs ?? [ASM_DIR]).map((dir) => path.resolve(dir));
    const resolvedExternalDirs = (externalDirs ?? [EXTERNAL_DIR]).map((dir) => path.resolve(dir));
    const externalRoots = resolvedExternalDirs.map((dir) => path.resolve(dir));
    const sourcesConfig = [
        ...resolvedBasicDirs.map((root) => ({ root, exts: BASIC_EXTS })),
        ...resolvedAsmDirs.map((root) => ({ root, exts: ASM_EXTS })),
        ...resolvedExternalDirs.map((root) => ({ root, exts: EXTERNAL_EXTS })),
    ];
    const fileSources = [];
    for (const cfg of sourcesConfig) {
        const files = await collectFiles(cfg.root, cfg.exts);
        for (const file of files) {
            fileSources.push({ file, root: cfg.root });
        }
    }
    for (const docFile of docIncluded) {
        fileSources.push({ file: docFile, root: process.cwd() });
    }
    // Include context files as single-chunk documents if present
    const promptFiles = readPromptFiles();
    const contextFiles = [BOOTSTRAP_PATH, AGENTS_PATH, CHAT_PATH, ...promptFiles];
    const contextSet = new Set(contextFiles.map((file) => path.resolve(file)));
    for (const cf of contextFiles) {
        if (fsSync.existsSync(cf))
            fileSources.push({ file: cf, root: process.cwd() });
    }
    const seen = new Set();
    const preparedByCategory = {
        basic: [],
        asm: [],
        mixed: [],
        hardware: [],
        other: [],
    };
    for (const source of fileSources) {
        if (seen.has(source.file))
            continue;
        seen.add(source.file);
        let text;
        try {
            text = await loadText(source.file);
        }
        catch {
            continue;
        }
        const stat = await fs.stat(source.file).catch(() => null);
        if (!stat)
            continue;
        // Resolve provenance/metadata (GitHub origin and license) once per file
        const provenance = await resolveProvenance(source.file);
        // For markdown docs under doc/, chunk by sections; for context files inject as a single small chunk
        const absoluteFile = path.resolve(source.file);
        const ext = path.extname(absoluteFile).toLowerCase();
        const isMarkdown = ext === ".md";
        const isContext = contextSet.has(absoluteFile);
        const isDocFile = isMarkdown && absoluteFile.startsWith(path.resolve(DOC_ROOT) + path.sep);
        const isExternalFile = externalRoots.some((root) => absoluteFile === root || absoluteFile.startsWith(root + path.sep));
        const isPlainText = ext === ".txt" || ext === ".text";
        if (isDocFile) {
            const chunks = chunkMarkdownSections(text, source.file);
            for (const chunk of chunks) {
                const analysis = analyzeText(chunk.text);
                const category = decideCategory(analysis, path.extname(source.file), source.root);
                preparedByCategory[category].push({
                    file: source.file,
                    root: source.root,
                    text: addProvenanceComment(chunk.text, chunk.origin),
                    mtimeMs: stat.mtimeMs,
                    sourceUrl: provenance.sourceUrl,
                    sourceRepoUrl: provenance.sourceRepoUrl,
                    license: provenance.licenseLabel,
                    licenseSpdxId: provenance.licenseSpdxId,
                    licenseName: provenance.licenseName,
                    licenseUrl: provenance.licenseUrl,
                    attribution: provenance.attribution,
                    origin: chunk.origin,
                });
            }
            continue;
        }
        if (isContext) {
            const origin = path.relative(process.cwd(), source.file).split(path.sep).join("/");
            const analysis = analyzeText(text);
            const category = decideCategory(analysis, path.extname(source.file), source.root);
            preparedByCategory[category].push({
                file: source.file,
                root: source.root,
                text: addProvenanceComment(text, origin),
                mtimeMs: stat.mtimeMs,
                sourceUrl: provenance.sourceUrl,
                sourceRepoUrl: provenance.sourceRepoUrl,
                license: provenance.licenseLabel,
                licenseSpdxId: provenance.licenseSpdxId,
                licenseName: provenance.licenseName,
                licenseUrl: provenance.licenseUrl,
                attribution: provenance.attribution,
                origin,
            });
            continue;
        }
        if (isExternalFile && isPlainText) {
            const chunks = chunkPlainTextSections(text, source.file);
            for (const chunk of chunks) {
                const analysis = analyzeText(chunk.text);
                const category = decideCategory(analysis, ext, source.root);
                preparedByCategory[category].push({
                    file: source.file,
                    root: source.root,
                    text: addProvenanceComment(chunk.text, chunk.origin),
                    mtimeMs: stat.mtimeMs,
                    sourceUrl: provenance.sourceUrl,
                    sourceRepoUrl: provenance.sourceRepoUrl,
                    license: provenance.licenseLabel,
                    licenseSpdxId: provenance.licenseSpdxId,
                    licenseName: provenance.licenseName,
                    licenseUrl: provenance.licenseUrl,
                    attribution: provenance.attribution,
                    origin: chunk.origin,
                });
            }
            continue;
        }
        // Default: treat as a single record (BASIC/ASM/external)
        {
            const analysis = analyzeText(text);
            const category = decideCategory(analysis, ext, source.root);
            preparedByCategory[category].push({
                file: source.file,
                root: source.root,
                text,
                mtimeMs: stat.mtimeMs,
                sourceUrl: provenance.sourceUrl,
                sourceRepoUrl: provenance.sourceRepoUrl,
                license: provenance.licenseLabel,
                licenseSpdxId: provenance.licenseSpdxId,
                licenseName: provenance.licenseName,
                licenseUrl: provenance.licenseUrl,
                attribution: provenance.attribution,
            });
        }
    }
    const indexesByCategory = new Map();
    for (const category of CATEGORY_LIST) {
        const index = await buildIndexForCategory(category, preparedByCategory[category], model);
        indexesByCategory.set(category, index);
    }
    await Promise.all([
        writeIndex(paths.basic, indexesByCategory.get("basic")),
        writeIndex(paths.asm, indexesByCategory.get("asm")),
        writeIndex(paths.mixed, indexesByCategory.get("mixed")),
        writeIndex(paths.hardware, indexesByCategory.get("hardware")),
        writeIndex(paths.other, indexesByCategory.get("other")),
    ]);
}
// --- Helpers ---
function chunkMarkdownSections(text, filePath) {
    // Split on H2/H3 headers; keep headers with content; bound chunk size to ~1500-2500 chars
    const lines = text.split(/\r?\n/);
    const headerRe = /^(#{1,3})\s+(.*)$/; // matches '#', '##', or '###'
    const chunks = [];
    let current = null;
    for (const line of lines) {
        const m = headerRe.exec(line);
        if (m) {
            if (current)
                chunks.push(current);
            current = { title: m[2].trim(), lines: [line] };
        }
        else if (current) {
            current.lines.push(line);
        }
        else {
            // preamble before first header
            current = { title: "Preamble", lines: [line] };
        }
    }
    if (current)
        chunks.push(current);
    const results = [];
    for (const c of chunks) {
        const origin = `${toPosixRelative(process.cwd(), filePath)}#${c.title}`;
        const content = c.lines.join("\n").trim();
        if (content.length === 0)
            continue;
        // If too large, further split by paragraphs
        if (content.length > 2500) {
            const paragraphs = content.split(/\n\n+/);
            let buf = [];
            let acc = 0;
            for (const p of paragraphs) {
                const toAdd = (buf.length ? "\n\n" : "") + p;
                if (acc + toAdd.length > 1800) {
                    results.push({ text: buf.join("\n\n"), origin });
                    buf = [p];
                    acc = p.length;
                }
                else {
                    buf.push(p);
                    acc += toAdd.length;
                }
            }
            if (buf.length)
                results.push({ text: buf.join("\n\n"), origin });
        }
        else {
            results.push({ text: content, origin });
        }
    }
    return results;
}
function addProvenanceComment(content, origin) {
    if (!origin)
        return content;
    return `<!-- Source: ${origin} -->\n${content}`;
}
async function resolveProvenance(filePath) {
    let sourceUrl;
    let sourceRepoUrl;
    let licenseSpdxId;
    let licenseName;
    let licenseUrl;
    let attribution;
    const { metadata, repoRoot } = await resolveRepoMetadata(filePath);
    if (metadata?.type === "github" && repoRoot) {
        sourceRepoUrl = metadata.repoUrl;
        const branch = metadata.branch ?? "main";
        const repoRelative = path.relative(repoRoot, filePath);
        if (!repoRelative.startsWith("..")) {
            const encodedPath = repoRelative
                .split(path.sep)
                .map((segment) => encodeURIComponent(segment))
                .join("/");
            sourceUrl = `${metadata.repoUrl}/blob/${branch}/${encodedPath}`;
        }
        if (metadata.license) {
            const spdx = metadata.license.spdxId ?? undefined;
            if (spdx && spdx !== "NOASSERTION") {
                licenseSpdxId = spdx;
            }
            licenseName = metadata.license.name ?? undefined;
            licenseUrl = metadata.license.url ?? undefined;
            attribution = metadata.license.attribution ?? undefined;
        }
    }
    let licenseLabel;
    if (metadata?.type === "github") {
        if (licenseSpdxId)
            licenseLabel = licenseSpdxId;
        else if (licenseName)
            licenseLabel = licenseName;
        else
            licenseLabel = "UNKNOWN";
    }
    return { sourceUrl, sourceRepoUrl, licenseLabel, licenseSpdxId, licenseName, licenseUrl, attribution };
}
export async function loadIndexes(opts = {}) {
    // Best-effort loading
    const result = {};
    const embeddingsDir = resolveEmbeddingsDir(opts.embeddingsDir);
    const paths = embeddingIndexPaths(embeddingsDir);
    try {
        const basic = JSON.parse(await fs.readFile(paths.basic, "utf8"));
        result.basic = basic;
    }
    catch { }
    try {
        const asm = JSON.parse(await fs.readFile(paths.asm, "utf8"));
        result.asm = asm;
    }
    catch { }
    try {
        const mixed = JSON.parse(await fs.readFile(paths.mixed, "utf8"));
        result.mixed = mixed;
    }
    catch { }
    try {
        const hardware = JSON.parse(await fs.readFile(paths.hardware, "utf8"));
        result.hardware = hardware;
    }
    catch { }
    try {
        const other = JSON.parse(await fs.readFile(paths.other, "utf8"));
        result.other = other;
    }
    catch { }
    return result;
}
