/*
C64 MCP - External source fetcher (CSV-driven)
GPL-2.0-only
*/

import fs from 'node:fs/promises';
import path from 'node:path';
import { URL } from 'node:url';
import https from 'node:https';
import http from 'node:http';
import { SlidingWindowRateLimiter, RealTimeSource, type TimeSource, AdaptiveRateLimiter } from './rateLimiter.js';
import { parseUrlSafe, sameRegisteredDomain, getRegisteredDomain } from './urlUtils.js';

export interface FetcherOptions {
  csvPath: string;
  outDir: string; // must be outside VCS and ignored
  defaultDepth?: number; // default 5
  perDomainRps?: number; // default 10
  maxRequestsPerSeed?: number; // default 500
  concurrency?: number; // number of parallel workers per seed (default 6)
  maxContentBytes?: number; // default 2MB
  userAgent?: string;
  log?: (entry: LogEntry) => void;
  /** optional HTTP getter for tests */
  request?: (url: URL, userAgent: string) => Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: Buffer; }>;
  /** optional time source for throttling (tests) */
  timeSource?: TimeSource;
  /** retry attempts for transient failures (default 3) */
  maxRetries?: number;
  /** factor to reduce RPS on throttling (default 0.5) */
  throttleBackoffFactor?: number;
  /** adaptive limiter recovery interval and step (ms and rps step) */
  recoveryIntervalMs?: number;
  recoveryStep?: number;
}

export interface LogEntry {
  level: 'info' | 'warn' | 'error';
  event: string;
  data?: Record<string, unknown>;
}

export interface CsvRow {
  type?: string; // basic|assembly|hardware (ignored for filtering, kept as metadata)
  description?: string;
  link: string;
  depth?: number; // optional per-URL depth
}

export async function readCsv(pathCsv: string): Promise<CsvRow[]> {
  const raw = await fs.readFile(pathCsv, 'utf8');
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
  const header = lines.shift();
  if (!header) return [];
  const cols = header.split(',').map((c) => c.trim());
  const fieldIdx: Record<string, number> = {};
  cols.forEach((c, i) => (fieldIdx[c] = i));

  const rows: CsvRow[] = [];
  for (const line of lines) {
    const parts = splitCsvLine(line);
    const link = parts[fieldIdx['link']];
    if (!link) continue;
    const depthStr = fieldIdx['depth'] !== undefined ? parts[fieldIdx['depth']] : undefined;
    const row: CsvRow = {
      type: fieldIdx['type'] !== undefined ? parts[fieldIdx['type']] : undefined,
      description: fieldIdx['description'] !== undefined ? parts[fieldIdx['description']] : undefined,
      link,
      depth: depthStr ? Number(depthStr) : undefined,
    };
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result.map((s) => s.trim());
}

// Recognised code-like extensions (deduplicated and sorted alphabetically)
const CODE_EXTS = new Set([
  '.a',
  '.a65',
  '.acme',
  '.asm',
  '.bas',
  '.dasm',
  '.inc',
  '.kick',
  '.lst',
  '.mac',
  '.md',
  '.pal',
  '.s',
  '.seq',
  '.src',
  '.txt',
  '.x65',
]);

const GITHUB_HOSTS = new Set([
  'github.com',
  'raw.githubusercontent.com',
  'githubusercontent.com',
  'raw.github.com',
  'codeload.github.com',
]);

function normalizeGithubUrl(original: URL): { url: URL; raw: boolean; changed: boolean } {
  if (original.hostname !== 'github.com') {
    return { url: original, raw: original.hostname === 'raw.githubusercontent.com', changed: false };
  }
  const segments = original.pathname.split('/').filter(Boolean);
  const blobIdx = segments.indexOf('blob');
  if (blobIdx > -1 && segments.length > blobIdx + 2) {
    const [owner, repo] = segments;
    const branch = segments[blobIdx + 1];
    const pathParts = segments.slice(blobIdx + 2);
    const rawUrl = new URL(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${pathParts.join('/')}`);
    return { url: rawUrl, raw: true, changed: true };
  }
  return { url: original, raw: false, changed: false };
}

function isGithubFamily(hostname: string): boolean {
  return GITHUB_HOSTS.has(hostname.toLowerCase());
}

function isAllowedDomain(seed: URL, candidate: URL): boolean {
  if (sameRegisteredDomain(seed.toString(), candidate.toString())) {
    return true;
  }
  if (isGithubFamily(seed.hostname) && isGithubFamily(candidate.hostname)) {
    return true;
  }
  return false;
}

function shouldFollowLink(seed: URL, current: URL, next: URL): boolean {
  if (!isAllowedDomain(seed, next)) {
    return false;
  }
  if (isGithubFamily(next.hostname)) {
    const pathname = next.pathname.toLowerCase();
    if (pathname.includes('/blob/')) {
      const ext = path.extname(pathname);
      return CODE_EXTS.has(ext);
    }
    if (pathname.includes('/tree/')) {
      return true;
    }
    return CODE_EXTS.has(path.extname(pathname));
  }
  const ext = path.extname(next.pathname.toLowerCase());
  if (CODE_EXTS.has(ext)) {
    return true;
  }
  if (ext === '.html' || ext === '.htm' || ext === '') {
    return true;
  }
  return next.pathname.endsWith('/');
}

function isCodeLikeUrl(url: URL): boolean {
  const ext = path.extname(url.pathname).toLowerCase();
  if (!ext) return false;
  return CODE_EXTS.has(ext);
}

function isBinaryContentType(ct: string | undefined): boolean {
  if (!ct) return false;
  const t = ct.toLowerCase();
  if (t.includes('text/')) return false;
  if (t.includes('json')) return false;
  if (t.includes('xml')) return false;
  if (t.includes('html')) return false; // we will parse links from HTML
  return true;
}

export interface FetchSummary {
  seed: string;
  visited: number;
  downloaded: number;
  skipped: number;
  errors: number;
}

export async function fetchFromCsv(opts: FetcherOptions): Promise<FetchSummary[]> {
  const rows = await readCsv(opts.csvPath);
  const outDir = path.resolve(opts.outDir);
  await fs.mkdir(outDir, { recursive: true });

  const defaultDepth = opts.defaultDepth ?? 5;
  const perDomainRps = opts.perDomainRps ?? 5;
  const maxReq = opts.maxRequestsPerSeed ?? 500;
  const concurrency = Math.max(1, opts.concurrency ?? 6);
  const maxBytes = opts.maxContentBytes ?? 2 * 1024 * 1024;
  const userAgent = opts.userAgent ?? 'c64-mcp-fetcher/0.1';
  const log = opts.log ?? (() => {});
  const maxRetries = Math.max(0, opts.maxRetries ?? 3);
  const throttleBackoffFactor = opts.throttleBackoffFactor ?? 0.5;

  const limiter = new AdaptiveRateLimiter(perDomainRps, opts.timeSource ?? new RealTimeSource(), {
    increaseIntervalMs: opts.recoveryIntervalMs ?? 15000,
    increaseStep: opts.recoveryStep ?? 1,
    minRps: 1,
  });

  const summaries: FetchSummary[] = [];

  for (const row of rows) {
    const seed = row.link;
    const maybeSeedUrl = parseUrlSafe(seed);
    if (!maybeSeedUrl) {
      log({ level: 'warn', event: 'seed_invalid_url', data: { seed } });
      continue;
    }
    const seedUrl = maybeSeedUrl;
    const depth = Number.isFinite(row.depth ?? NaN) ? (row.depth as number) : defaultDepth;
    const registeredDomain = getRegisteredDomain(seedUrl.hostname);
    const domainKey = registeredDomain;

    const queue: Array<{ url: URL; depth: number } > = [{ url: seedUrl, depth: 0 }];
    const seen = new Set<string>();

    let visited = 0;
    let downloaded = 0;
    let skipped = 0;
    let errors = 0;

    const perSeedOut = path.join(outDir, sanitizeForFs(registeredDomain));
    await fs.mkdir(perSeedOut, { recursive: true });

    log({ level: 'info', event: 'seed_start', data: { seed, depth, registeredDomain, maxReq, perDomainRps } });

    async function worker(): Promise<void> {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (visited >= maxReq) return;
        const item = queue.shift();
        if (!item) return;
        try {
          const { url, depth: d } = item;
          const originalHref = url.toString();
          const { url: targetUrl, raw, changed } = normalizeGithubUrl(url);
          const targetHref = targetUrl.toString();

          if (seen.has(targetHref)) continue;
          seen.add(targetHref);

          if (!isAllowedDomain(seedUrl, targetUrl)) {
            skipped++;
            log({ level: 'info', event: 'skip_out_of_domain', data: { seed, url: targetHref, original: originalHref } });
            continue;
          }

          if (changed) {
            log({ level: 'info', event: 'normalize_github', data: { from: originalHref, to: targetHref } });
          }

          visited++;

          const domainKeyForRequest = getRegisteredDomain(targetUrl.hostname);
          await limiter.consume(domainKeyForRequest);

          log({ level: 'info', event: 'request_start', data: { url: targetHref, depth: d, visited, remaining: Math.max(0, maxReq - visited) } });

          const requester = opts.request ?? httpGet;
          const res = await withRetries(requester, targetUrl, userAgent, maxRetries, async (statusCode) => {
            if (statusCode === 429 || (statusCode && statusCode >= 500 && statusCode < 600)) {
              limiter.notifyThrottle(domainKeyForRequest, throttleBackoffFactor);
            }
          }).catch((err) => ({ error: err as Error }));
          if ('error' in res) {
            errors++;
            log({ level: 'warn', event: 'request_error', data: { url: targetHref, message: res.error.message } });
            continue;
          }

          const { statusCode, headers, body } = res;
          const ct = headers['content-type']?.toString();
          const contentLength = Number(headers['content-length'] ?? 0);

          log({ level: 'info', event: 'request_ok', data: { url: targetHref, statusCode, depth: d, discovered: 0, visited, remaining: Math.max(0, maxReq - visited), raw } });

          if (statusCode && statusCode >= 300 && statusCode < 400 && headers.location) {
            const loc = headers.location.toString();
            let redirected: URL | null = null;
            try { redirected = new URL(loc, targetUrl); } catch {}
            if (redirected) {
              const redirectUrl = redirected;
              if (isAllowedDomain(seedUrl, redirectUrl)) {
                log({ level: 'info', event: 'redirect', data: { from: targetHref, to: redirectUrl.toString() } });
                queue.unshift({ url: redirectUrl, depth: d });
              } else {
                skipped++;
                log({ level: 'info', event: 'skip_redirect_out_of_domain', data: { from: targetHref, to: redirectUrl.toString() } });
              }
            }
            continue;
          }

          if (contentLength > maxBytes || body.length > maxBytes || isBinaryContentType(ct)) {
            skipped++;
            log({ level: 'info', event: 'skip_binary_or_oversize', data: { url: targetHref, contentLength, contentType: ct } });
            continue;
          }

          const isHtml = ct?.toLowerCase().includes('html');
          if (isHtml) {
            const links = extractLinks(targetUrl, body.toString('utf8'));
            const nextDepth = d + 1;
            if (nextDepth <= depth) {
              for (const next of links) {
                const parsed = parseUrlSafe(next);
                if (!parsed) continue;
                const linkUrl = parsed;
                if (!shouldFollowLink(seedUrl, targetUrl, linkUrl)) {
                  skipped++;
                  log({ level: 'info', event: 'skip_link', data: { from: targetHref, to: linkUrl.toString() } });
                  continue;
                }
                queue.push({ url: linkUrl, depth: nextDepth });
              }
            } else {
              log({ level: 'info', event: 'depth_exceeded', data: { url: targetHref, depth: d, maxDepth: depth } });
            }
            log({ level: 'info', event: 'discovered_links', data: { from: targetHref, count: links.length, depth: nextDepth } });
          }

          if (isCodeLikeUrl(targetUrl)) {
            const rel = path.join(perSeedOut, sanitizeForFs(targetUrl.pathname));
            await fs.mkdir(path.dirname(rel), { recursive: true });
            await fs.writeFile(rel, body);
            downloaded++;
            log({ level: 'info', event: 'download_success', data: { url: targetHref, path: rel, bytes: body.length } });
          }
        } catch (err) {
          errors++;
          log({ level: 'error', event: 'worker_exception', data: { message: err instanceof Error ? err.message : String(err) } });
        }
      }
    }

    const workers = Array.from({ length: concurrency }, () => worker());
    await Promise.all(workers);

    log({ level: 'info', event: 'seed_done', data: { seed, visited, downloaded, skipped, errors, maxReq } });
    summaries.push({ seed, visited, downloaded, skipped, errors });
  }

  return summaries;
}

function extractLinks(base: URL, html: string): string[] {
  const results: string[] = [];
  const hrefRe = /\b(?:href|src)\s*=\s*"([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html)) !== null) {
    const raw = m[1];
    try {
      const u = new URL(raw, base);
      results.push(u.toString());
    } catch {
      // ignore
    }
  }
  return results;
}

async function httpGet(url: URL, userAgent: string): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: Buffer; } > {
  const lib = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.get(url, { headers: { 'user-agent': userAgent } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(Buffer.from(c)));
      res.on('end', () => {
        resolve({ statusCode: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) });
      });
    });
    req.on('error', reject);
  });
}

function sanitizeForFs(input: string): string {
  return input
    .replace(/[^a-zA-Z0-9_.\-\/]/g, '_')
    .replace(/^\/+/, '')
    .replace(/^_+/, '')
    .replace(/_+$/, '');
}

async function withRetries(
  requester: (url: URL, ua: string) => Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: Buffer; }>,
  url: URL,
  userAgent: string,
  maxRetries: number,
  onStatus?: (code?: number) => Promise<void> | void,
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: Buffer; }> {
  let attempt = 0;
  let delay = 50; // small base for tests; real backoff controlled by caller env if needed
  while (true) {
    try {
      const res = await requester(url, userAgent);
      if (onStatus) await onStatus(res.statusCode);
      if (res.statusCode && (res.statusCode >= 500 || res.statusCode === 429)) {
        if (attempt >= maxRetries) return res; // give up returning last response
        await new Promise((r) => setTimeout(r, delay));
        attempt++;
        delay = Math.min(delay * 2, 1000);
        continue;
      }
      return res;
    } catch (err) {
      if (attempt >= maxRetries) throw err;
      await new Promise((r) => setTimeout(r, delay));
      attempt++;
      delay = Math.min(delay * 2, 1000);
    }
  }
}
