/*
MCP RAG - GitHub discovery for C64-related repositories
Uses GitHub REST API (Octokit) to search public repos with C64-related code
and appends them to src/rag/sources.csv while preserving existing data.
*/
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Octokit } from 'octokit';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(path.join(__dirname, '..', '..'));
function resolveRagAsset(fileName) {
    // Prefer dist/rag when running from a packaged install; fall back to src/rag in repo checkouts
    const distPath = path.join(PROJECT_ROOT, 'dist', 'rag', fileName);
    try {
        if (fsSync.existsSync(distPath))
            return distPath;
    }
    catch { }
    return path.join(PROJECT_ROOT, 'src', 'rag', fileName);
}
const SOURCES_CSV = resolveRagAsset('sources.csv');
const CONFIG_JSON = resolveRagAsset('discover.config.json');
const CACHE_JSON = path.join(PROJECT_ROOT, 'data', 'discover-cache.json');
const ASSEMBLY_EXTS = new Set(['.asm', '.a', '.a65', '.acme', '.dasm', '.kick', '.s', '.x65']);
function stableJson(input) {
    try {
        return JSON.stringify(input, Object.keys(input).sort());
    }
    catch {
        return JSON.stringify(input);
    }
}
function sha1(input) {
    return crypto.createHash('sha1').update(input).digest('hex');
}
function csvEscape(value) {
    const s = String(value ?? '');
    if (/[",\n]/.test(s)) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}
function splitCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            }
            else {
                inQuotes = !inQuotes;
            }
        }
        else if (ch === ',' && !inQuotes) {
            result.push(current);
            current = '';
        }
        else {
            current += ch;
        }
    }
    result.push(current);
    return result.map((s) => s.trim());
}
async function readCsv(filePath) {
    const raw = await fs.readFile(filePath, 'utf8');
    const lines = raw
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'));
    if (lines.length === 0)
        return [];
    const header = lines.shift(); // header must exist
    const cols = header.split(',').map((c) => c.trim());
    const idx = {};
    cols.forEach((c, i) => (idx[c] = i));
    const rows = [];
    for (const line of lines) {
        const parts = splitCsvLine(line);
        const type = parts[idx['type']] ?? '';
        const description = parts[idx['description']] ?? '';
        const link = parts[idx['link']];
        const depthStr = parts[idx['depth']];
        if (!link)
            continue;
        rows.push({ type, description, link, depth: depthStr ? Number(depthStr) : NaN });
    }
    return rows;
}
async function writeCsv(filePath, rows) {
    const header = 'type,description,link,depth';
    const lines = [header];
    for (const row of rows) {
        const line = [csvEscape(row.type), csvEscape(row.description), csvEscape(row.link), csvEscape(row.depth)].join(',');
        lines.push(line);
    }
    const text = lines.join('\n') + '\n';
    await fs.writeFile(filePath, text, 'utf8');
}
async function loadConfig() {
    const raw = await fs.readFile(CONFIG_JSON, 'utf8');
    const data = JSON.parse(raw);
    return data;
}
function buildKeywordGroups(keywords) {
    // Split into chunks so individual queries are not too long
    const tokens = keywords.map((k) => (/\s/.test(k) ? `"${k}"` : k));
    const groups = [];
    const maxLen = 150; // keep well under GitHub query limits when combined with filters
    let current = [];
    let currentLen = 0;
    for (const token of tokens) {
        const addition = (current.length > 0 ? 4 : 0) + token.length; // account for " OR "
        if (current.length > 0 && currentLen + addition > maxLen) {
            groups.push(current);
            current = [token];
            currentLen = token.length;
        }
        else {
            current.push(token);
            currentLen += addition;
        }
    }
    if (current.length > 0) {
        groups.push(current);
    }
    return groups;
}
function normalizeRepoUrl(htmlUrl) {
    try {
        const u = new URL(htmlUrl);
        if (u.hostname.toLowerCase() !== 'github.com')
            return htmlUrl.replace(/\/$/, '');
        const parts = u.pathname.split('/').filter(Boolean);
        if (parts.length >= 2) {
            const owner = parts[0].toLowerCase();
            const repo = parts[1].replace(/\.git$/, '').toLowerCase();
            return `https://github.com/${owner}/${repo}`;
        }
        return `https://github.com/${parts.join('/')}`.replace(/\/$/, '');
    }
    catch {
        return htmlUrl.replace(/\/$/, '');
    }
}
function classifyType(matchedExts) {
    if (matchedExts.has('.bas'))
        return 'basic';
    for (const ext of matchedExts) {
        if (ASSEMBLY_EXTS.has(ext))
            return 'assembly';
    }
    return 'misc';
}
async function sleep(ms) {
    await new Promise((r) => setTimeout(r, ms));
}
async function maybeWaitOnRateLimit(headers) {
    const remainingRaw = headers['x-ratelimit-remaining'];
    const resetRaw = headers['x-ratelimit-reset'];
    const remaining = typeof remainingRaw === 'string' ? parseInt(remainingRaw, 10) : typeof remainingRaw === 'number' ? remainingRaw : NaN;
    const reset = typeof resetRaw === 'string' ? parseInt(resetRaw, 10) : typeof resetRaw === 'number' ? resetRaw : NaN;
    if (Number.isFinite(remaining) && remaining <= 1 && Number.isFinite(reset)) {
        const nowSec = Math.floor(Date.now() / 1000);
        const waitMs = Math.max(0, (reset - nowSec) * 1000) + 1000;
        if (waitMs > 0) {
            console.error(`Rate limit low (remaining=${remaining}). Waiting ${(waitMs / 1000).toFixed(1)}s until reset...`);
            await sleep(waitMs);
        }
    }
}
async function run() {
    const cfg = await loadConfig();
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        console.error('GITHUB_TOKEN is required to use the GitHub code search API. Please export GITHUB_TOKEN and rerun.');
        process.exitCode = 1;
        return;
    }
    const octokit = new Octokit({ auth: token, userAgent: 'c64bridge-rag-discover/1.0' });
    const configHash = sha1(stableJson(cfg));
    // Load cache if present and not forced to refresh
    let cache = null;
    const forceRefresh = process.env.RAG_DISCOVER_FORCE_REFRESH === '1';
    try {
        const raw = await fs.readFile(CACHE_JSON, 'utf8');
        const parsed = JSON.parse(raw);
        if (!forceRefresh && parsed.configHash === configHash && Array.isArray(parsed.items)) {
            cache = parsed;
        }
    }
    catch {
        // ignore
    }
    const existingRows = await readCsv(SOURCES_CSV);
    const existingLinks = new Set(existingRows.map((r) => normalizeRepoUrl(r.link)));
    let repos = new Map(); // key: owner/repo lowercased
    if (cache) {
        for (const item of cache.items) {
            const key = item.full_name.toLowerCase();
            repos.set(key, {
                full_name: item.full_name,
                html_url: normalizeRepoUrl(item.html_url),
                stargazers_count: item.stargazers_count,
                description: item.description ?? null,
                matchedExtensions: new Set(item.matchedExtensions.map((e) => e.toLowerCase())),
            });
        }
        console.log(`Loaded ${repos.size} repositories from cache.`);
    }
    else {
        const keywordGroups = buildKeywordGroups(cfg.keywords);
        const targetExts = cfg.fileExtensions.map((e) => e.toLowerCase()).filter((e) => e.trim().length > 0);
        outer: for (const extRaw of targetExts) {
            const ext = extRaw.replace(/^\./, '');
            if (!ext) {
                continue;
            }
            const storageExt = `.${ext}`;
            const queue = keywordGroups.map((tokens) => [...tokens]);
            while (queue.length > 0) {
                const tokens = queue.shift();
                if (!tokens || tokens.length === 0) {
                    continue;
                }
                const clause = tokens.length === 1 ? tokens[0] : `(${tokens.join(' OR ')})`;
                const q = `${clause} in:file extension:${ext}`;
                let page = 1;
                while (true) {
                    let res;
                    try {
                        res = await octokit.rest.search.code({ q, per_page: 100, page });
                    }
                    catch (err) {
                        const status = err?.status ?? err?.response?.status;
                        if (status === 422) {
                            if (tokens.length > 1) {
                                console.warn(`Query too complex for GitHub code search: "${q}". Falling back to individual keywords.`);
                                for (let i = tokens.length - 1; i >= 0; i--) {
                                    queue.unshift([tokens[i]]);
                                }
                            }
                            else {
                                console.warn(`Skipping keyword ${tokens[0]} with extension ${storageExt}: ${err?.message ?? 'query parsing error'}`);
                            }
                            break;
                        }
                        const headers = (err?.response?.headers ?? {});
                        const retryAfter = Number(headers['retry-after'] ?? 0);
                        if (status === 403 || status === 429) {
                            const reset = Number(headers['x-ratelimit-reset'] ?? 0);
                            if (retryAfter > 0) {
                                await sleep(retryAfter * 1000);
                                continue;
                            }
                            if (reset > 0) {
                                const nowSec = Math.floor(Date.now() / 1000);
                                const waitMs = Math.max(0, (reset - nowSec) * 1000) + 1000;
                                await sleep(waitMs);
                                continue;
                            }
                        }
                        throw err;
                    }
                    const { data, headers } = res;
                    await maybeWaitOnRateLimit(headers);
                    for (const item of data.items) {
                        // Each code result item includes a repository object
                        const repo = item.repository;
                        const key = repo.full_name.toLowerCase();
                        const existing = repos.get(key);
                        if (!existing) {
                            repos.set(key, {
                                full_name: repo.full_name,
                                html_url: normalizeRepoUrl(repo.html_url),
                                stargazers_count: 0,
                                description: null,
                                matchedExtensions: new Set([storageExt]),
                            });
                        }
                        else {
                            existing.matchedExtensions.add(storageExt);
                        }
                        if (repos.size >= cfg.maxRepos)
                            break outer;
                    }
                    const fetched = data.items.length;
                    if (fetched < 100 || (data.total_count && page * 100 >= Math.min(1000, data.total_count))) {
                        break; // no more pages for this query
                    }
                    page++;
                }
            }
        }
        // Enrich with repo metadata and filter by stars
        const keys = Array.from(repos.keys());
        const concurrency = 6;
        let i = 0;
        const enriched = new Map();
        async function worker() {
            while (true) {
                const idx = i++;
                if (idx >= keys.length)
                    return;
                const key = keys[idx];
                const { full_name } = repos.get(key);
                const [owner, repo] = full_name.split('/');
                try {
                    const res = await octokit.rest.repos.get({ owner, repo });
                    await maybeWaitOnRateLimit(res.headers);
                    if (res.status === 200) {
                        const info = res.data;
                        const entry = repos.get(key);
                        entry.stargazers_count = info.stargazers_count ?? 0;
                        entry.description = info.description ?? null;
                        if (entry.stargazers_count >= cfg.minStars) {
                            enriched.set(key, entry);
                        }
                    }
                }
                catch (err) {
                    const status = err?.status ?? err?.response?.status;
                    if (status === 404)
                        continue; // repo gone
                    const headers = (err?.response?.headers ?? {});
                    const retryAfter = Number(headers['retry-after'] ?? 0);
                    const reset = Number(headers['x-ratelimit-reset'] ?? 0);
                    if (status === 403 || status === 429) {
                        if (retryAfter > 0) {
                            await sleep(retryAfter * 1000);
                            i = Math.min(i, idx); // retry soon
                            continue;
                        }
                        if (reset > 0) {
                            const nowSec = Math.floor(Date.now() / 1000);
                            const waitMs = Math.max(0, (reset - nowSec) * 1000) + 1000;
                            await sleep(waitMs);
                            i = Math.min(i, idx);
                            continue;
                        }
                    }
                    // log and skip
                    console.error(`Repo fetch failed for ${full_name}: ${err?.message ?? err}`);
                }
            }
        }
        await Promise.all(Array.from({ length: concurrency }, () => worker()));
        repos = enriched;
        // Save cache
        const cacheDir = path.dirname(CACHE_JSON);
        await fs.mkdir(cacheDir, { recursive: true });
        const cacheData = {
            version: 1,
            configHash,
            createdAt: new Date().toISOString(),
            items: Array.from(repos.values()).map((r) => ({
                full_name: r.full_name,
                html_url: r.html_url,
                stargazers_count: r.stargazers_count,
                description: r.description ?? null,
                matchedExtensions: Array.from(r.matchedExtensions),
            })),
        };
        await fs.writeFile(CACHE_JSON, JSON.stringify(cacheData, null, 2) + '\n', 'utf8');
    }
    // Build new CSV rows
    const newRows = [];
    for (const r of repos.values()) {
        const link = normalizeRepoUrl(r.html_url);
        if (existingLinks.has(link))
            continue;
        const type = classifyType(r.matchedExtensions);
        const description = (r.description?.trim() || 'C64 source repository').replace(/\r/g, ' ').replace(/\n/g, ' ');
        newRows.push({ type, description, link, depth: cfg.defaultDepth });
    }
    // Merge and sort
    const merged = existingRows.map((r) => ({
        type: r.type ?? '',
        description: (r.description ?? '').replace(/\r/g, ' ').replace(/\n/g, ' '),
        link: normalizeRepoUrl(r.link),
        depth: Number.isFinite(r.depth) ? r.depth : cfg.defaultDepth,
    })).concat(newRows);
    merged.sort((a, b) => a.description.toLowerCase().localeCompare(b.description.toLowerCase()));
    await writeCsv(SOURCES_CSV, merged);
    // Stats output
    console.log(`Total found repositories: ${repos.size}`);
    console.log(`New entries added: ${newRows.length}`);
    console.log(`Total unique entries after merge: ${merged.length}`);
}
run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
