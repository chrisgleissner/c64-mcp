/*
C64 MCP - External source fetcher (CSV-driven)
GPL-2.0-only
*/

import fs from 'node:fs/promises';
import path from 'node:path';
import { URL } from 'node:url';
import https from 'node:https';
import http from 'node:http';
import { SlidingWindowRateLimiter, RealTimeSource, type TimeSource } from './rateLimiter.js';
import { parseUrlSafe, sameRegisteredDomain, getRegisteredDomain } from './urlUtils.js';

export interface FetcherOptions {
  csvPath: string;
  outDir: string; // must be outside VCS and ignored
  defaultDepth?: number; // default 5
  perDomainRps?: number; // default 10
  maxRequestsPerSeed?: number; // default 500
  maxContentBytes?: number; // default 2MB
  userAgent?: string;
  log?: (entry: LogEntry) => void;
  /** optional HTTP getter for tests */
  request?: (url: URL, userAgent: string) => Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: Buffer; }>;
  /** optional time source for throttling (tests) */
  timeSource?: TimeSource;
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
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
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

const CODE_EXTS = new Set(['.bas', '.asm', '.s', '.a65', '.inc', '.txt', '.md']);

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
  const perDomainRps = opts.perDomainRps ?? 10;
  const maxReq = opts.maxRequestsPerSeed ?? 500;
  const maxBytes = opts.maxContentBytes ?? 2 * 1024 * 1024;
  const userAgent = opts.userAgent ?? 'c64-mcp-fetcher/0.1';
  const log = opts.log ?? (() => {});

  const limiter = new SlidingWindowRateLimiter(perDomainRps, opts.timeSource ?? new RealTimeSource());

  const summaries: FetchSummary[] = [];

  for (const row of rows) {
    const seed = row.link;
    const seedUrl = parseUrlSafe(seed);
    if (!seedUrl) {
      log({ level: 'warn', event: 'seed_invalid_url', data: { seed } });
      continue;
    }
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

    while (queue.length > 0 && visited < maxReq) {
      const { url, depth: d } = queue.shift()!;
      const href = url.toString();

      if (seen.has(href)) continue;
      seen.add(href);

      if (!sameRegisteredDomain(seed, href)) {
        skipped++;
        log({ level: 'info', event: 'skip_out_of_domain', data: { seed, url: href } });
        continue;
      }

      visited++;

      // Enforce per-domain RPS
      await limiter.consume(domainKey);

      const requester = opts.request ?? httpGet;
      const res = await requester(url, userAgent).catch((err) => ({ error: err as Error }));
      if ('error' in res) {
        errors++;
        log({ level: 'warn', event: 'request_error', data: { url: href, message: res.error.message } });
        continue;
      }

      const { statusCode, headers, body } = res;
      const ct = headers['content-type']?.toString();
      const contentLength = Number(headers['content-length'] ?? 0);

      log({ level: 'info', event: 'request_ok', data: { url: href, statusCode, depth: d, discovered: 0, visited, remaining: Math.max(0, maxReq - visited) } });

      // Handle redirects with domain restriction
      if (statusCode && statusCode >= 300 && statusCode < 400 && headers.location) {
        const loc = headers.location.toString();
        let redirected: URL | null = null;
        try { redirected = new URL(loc, url); } catch {}
        if (redirected) {
          const toStr = redirected.toString();
          if (sameRegisteredDomain(seed, toStr)) {
            log({ level: 'info', event: 'redirect', data: { from: href, to: toStr } });
            queue.unshift({ url: redirected, depth: d });
          } else {
            skipped++;
            log({ level: 'info', event: 'skip_redirect_out_of_domain', data: { from: href, to: toStr } });
          }
        }
        continue;
      }

      if (contentLength > maxBytes || body.length > maxBytes || isBinaryContentType(ct)) {
        skipped++;
        log({ level: 'info', event: 'skip_binary_or_oversize', data: { url: href, contentLength, contentType: ct } });
        continue;
      }

      const isHtml = ct?.toLowerCase().includes('html');
      if (isHtml) {
        // crude link extraction: href="..." and src="..."
        const links = extractLinks(url, body.toString('utf8'));
        const nextDepth = d + 1;
        if (nextDepth <= depth) {
          for (const next of links) {
            const u = parseUrlSafe(next);
            if (!u) continue;
            if (!sameRegisteredDomain(seed, u.toString())) {
              skipped++;
              log({ level: 'info', event: 'skip_out_of_domain', data: { seed, url: u.toString() } });
              continue;
            }
            queue.push({ url: u, depth: nextDepth });
          }
        } else {
          log({ level: 'info', event: 'depth_exceeded', data: { url: href, depth: d, maxDepth: depth } });
        }
        log({ level: 'info', event: 'discovered_links', data: { from: href, count: links.length, depth: nextDepth } });
      }

      if (isCodeLikeUrl(url)) {
        const rel = path.join(perSeedOut, sanitizeForFs(url.pathname));
        await fs.mkdir(path.dirname(rel), { recursive: true });
        await fs.writeFile(rel, body);
        downloaded++;
        log({ level: 'info', event: 'download', data: { url: href, path: rel } });
      }
    }

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
  return input.replace(/[^a-zA-Z0-9_.\-\/]/g, '_').replace(/^_+/, '').replace(/_+$/, '');
}
