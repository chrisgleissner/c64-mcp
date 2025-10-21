/*
C64 MCP - External source fetcher (CSV-driven)
GPL-2.0-only
*/

import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';
import https from 'node:https';
import http from 'node:http';
import { pipeline } from 'node:stream/promises';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { SlidingWindowRateLimiter, RealTimeSource, type TimeSource, AdaptiveRateLimiter } from './rateLimiter.js';
import { parseUrlSafe, sameRegisteredDomain, getRegisteredDomain } from './urlUtils.js';

const execAsync = promisify(exec);

export interface FetcherOptions {
  csvPath: string;
  outDir: string; // must be outside VCS and ignored
  defaultDepth?: number; // default 5
  perDomainRps?: number; // default 5
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
  /** optional override for GitHub repository handling (tests) */
  githubRepoFetcher?: (args: GithubRepoFetcherArgs) => Promise<FetchSummary | null>;
  /** optional override for GitHub license fetching (tests) */
  githubLicenseFetcher?: (args: GithubLicenseFetcherArgs) => Promise<GithubLicenseInfo | null>;
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

const NON_C64_MACHINE_PATTERN = /(?:^|[_\-.])(c128|c65|c16|plus4|vic20|vic-20|pet|cbm2|ted)(?:[_\-.]|$)/i;
const MACHINE_SUFFIXES = ['c64', 'c128', 'c65', 'c16', 'plus4', 'vic20', 'vic-20', 'pet', 'cbm2', 'ted'];
const COUNTRY_CODE_PATTERN = /^(.*?)(?:[_-]([a-z]{2}))$/i;
const LICENSE_FILENAMES = new Set(['LICENSE', 'LICENSE.TXT', 'COPYING', 'COPYING.TXT', 'COPYING.MD', 'LICENSE.MD']);

export interface GithubLicenseFetcherArgs {
  owner: string;
  repo: string;
  userAgent: string;
  log: (entry: LogEntry) => void;
}

export interface GithubLicenseInfo {
  licenseId?: string | null;
  licenseName?: string | null;
  licenseUrl?: string | null;
  licenseText?: string;
  attribution?: string | null;
}

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
  const seedHost = seed.hostname.toLowerCase();
  const candidateHost = candidate.hostname.toLowerCase();
  if (seedHost === candidateHost) {
    return true;
  }
  const seedGithub = isGithubFamily(seedHost);
  const candidateGithub = isGithubFamily(candidateHost);
  if (seedGithub && candidateGithub) {
    return true;
  }
  if (!seedGithub && !candidateGithub && sameRegisteredDomain(seed.toString(), candidate.toString())) {
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

function isGithubSingleFileUrl(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter((s) => s.length > 0);
  if (segments.length === 0) {
    return false;
  }
  const last = segments[segments.length - 1];
  const hasExtension = path.extname(last) !== '';

  if (hostname === 'github.com') {
    if (!hasExtension) {
      return false;
    }
    if (segments.length >= 3) {
      const marker = segments[2];
      if (marker === 'blob' || marker === 'raw') {
        return true;
      }
    }
    return true;
  }

  if (hostname === 'raw.githubusercontent.com' || hostname === 'raw.github.com' || hostname.endsWith('githubusercontent.com')) {
    return hasExtension;
  }

  return false;
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

function looksLikeHtml(buffer: Buffer): boolean {
  const text = buffer.toString('utf8');
  const lines = text.split(/\r?\n/);
  let inspected = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    inspected += 1;
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('<!doctype html') || lower.startsWith('<html') || lower.includes('<html')) {
      return true;
    }
    if (inspected >= 10) break;
  }
  return false;
}

function looksLikePdf(buffer: Buffer): boolean {
  if (buffer.length < 5) return false;
  const header = buffer.subarray(0, 5).toString('ascii');
  if (header === '%PDF-') return true;
  return false;
}

async function pruneNonSourceFiles(root: string, allowedExtensions: Set<string>): Promise<{ kept: number; removed: number }> {
  let kept = 0;
  let removed = 0;

  async function walk(dir: string): Promise<boolean> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    let hasKept = false;
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const childHasKept = await walk(full);
        if (!childHasKept) {
          await fs.rm(full, { recursive: true, force: true });
          removed += 1;
        } else {
          hasKept = true;
        }
      } else {
        const upperName = entry.name.toUpperCase();
        if (LICENSE_FILENAMES.has(upperName) || entry.name === '_metadata.json') {
          hasKept = true;
          continue;
        }
        const ext = path.extname(entry.name).toLowerCase();
        if (allowedExtensions.has(ext)) {
          kept += 1;
          hasKept = true;
        } else {
          await fs.rm(full, { force: true });
          removed += 1;
        }
      }
    }
    return hasKept;
  }

  await walk(root);
  return { kept, removed };
}

interface FileEntry {
  path: string;
  dir: string;
  name: string;
  base: string;
  ext: string;
}

interface CleanupStats {
  removedNonC64: number;
  removedLocaleVariants: number;
  removedAltMachineSuffix: number;
  remaining: number;
}

function parseFileEntry(fullPath: string): FileEntry {
  const dir = path.dirname(fullPath);
  const name = path.basename(fullPath);
  const parsed = path.parse(name);
  return {
    path: fullPath,
    dir,
    name,
    base: parsed.name,
    ext: parsed.ext.toLowerCase(),
  };
}

async function collectFileEntries(root: string): Promise<FileEntry[]> {
  const result: FileEntry[] = [];
  async function walk(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        result.push(parseFileEntry(full));
      }
    }
  }
  await walk(root);
  return result;
}

function detectMachineSuffix(base: string): { root: string; suffix: string } | null {
  const lower = base.toLowerCase();
  for (const token of MACHINE_SUFFIXES) {
    const suffixLen = token.length;
    if (lower.endsWith(`_${token}`)) {
      return { root: base.slice(0, base.length - suffixLen - 1), suffix: token };
    }
    if (lower.endsWith(`-${token}`)) {
      return { root: base.slice(0, base.length - suffixLen - 1), suffix: token };
    }
  }
  return null;
}

async function cleanupC64SpecificFiles(root: string, log: (entry: LogEntry) => void): Promise<CleanupStats> {
  const removedPaths = new Set<string>();

  const removeFile = async (entry: FileEntry, reason: string, extra?: Record<string, unknown>): Promise<void> => {
    if (removedPaths.has(entry.path)) return;
    await fs.rm(entry.path, { force: true });
    removedPaths.add(entry.path);
    log({ level: 'info', event: reason, data: { path: entry.path, ...extra } });
  };

  let entries = await collectFileEntries(root);

  let removedNonC64 = 0;
  for (const entry of entries) {
    if (removedPaths.has(entry.path)) continue;
    const lowerName = entry.name.toLowerCase();
    if (NON_C64_MACHINE_PATTERN.test(lowerName) && !/\bc64\b/.test(lowerName)) {
      await removeFile(entry, 'cleanup_remove_non_c64');
      removedNonC64++;
    }
  }

  entries = entries.filter((entry) => !removedPaths.has(entry.path));

  let removedLocaleVariants = 0;
  const localeGroups = new Map<string, Array<{ entry: FileEntry; locale: string }>>();
  for (const entry of entries) {
    const match = entry.base.match(COUNTRY_CODE_PATTERN);
    if (!match) continue;
    const rootBase = match[1];
    const locale = match[2].toLowerCase();
    if (!/^[a-z]{2}$/.test(locale)) continue;
    const key = `${entry.dir}::${rootBase}`;
    if (!localeGroups.has(key)) {
      localeGroups.set(key, []);
    }
    localeGroups.get(key)!.push({ entry, locale });
  }

  for (const group of localeGroups.values()) {
    const hasEnglish = group.some((item) => item.locale === 'en');
    if (!hasEnglish) continue;
    for (const item of group) {
      if (item.locale !== 'en') {
        await removeFile(item.entry, 'cleanup_remove_locale_variant', { locale: item.locale });
        removedLocaleVariants++;
      }
    }
  }

  entries = entries.filter((entry) => !removedPaths.has(entry.path));

  let removedAltMachineSuffix = 0;
  const suffixGroups = new Map<string, Array<{ entry: FileEntry; suffix: string }>>();
  for (const entry of entries) {
    const detected = detectMachineSuffix(entry.base);
    if (!detected) continue;
    const key = `${entry.dir}::${detected.root}`;
    if (!suffixGroups.has(key)) {
      suffixGroups.set(key, []);
    }
    suffixGroups.get(key)!.push({ entry, suffix: detected.suffix.toLowerCase() });
  }

  for (const group of suffixGroups.values()) {
    const hasC64 = group.some((item) => item.suffix === 'c64');
    if (!hasC64) continue;
    for (const item of group) {
      if (item.suffix !== 'c64') {
        await removeFile(item.entry, 'cleanup_remove_machine_variant', { suffix: item.suffix });
        removedAltMachineSuffix++;
      }
    }
  }

  const remainingEntries = (await collectFileEntries(root)).filter((entry) => !removedPaths.has(entry.path));

  return {
    removedNonC64,
    removedLocaleVariants,
    removedAltMachineSuffix,
    remaining: remainingEntries.length,
  };
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  return new Promise<string>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function removeDuplicateFiles(root: string, log: (entry: LogEntry) => void): Promise<void> {
  const entries = await collectFileEntries(root);
  const bySize = new Map<number, Array<FileEntry & { size: number }>>();

  for (const entry of entries) {
    if (LICENSE_FILENAMES.has(entry.name.toUpperCase()) || entry.name === '_metadata.json') {
      continue;
    }
    const stat = await fs.stat(entry.path).catch(() => null);
    if (!stat || !stat.isFile()) continue;
    const size = stat.size;
    if (!bySize.has(size)) {
      bySize.set(size, []);
    }
    bySize.get(size)!.push({ ...entry, size });
  }

  let removedCount = 0;
  for (const group of bySize.values()) {
    if (group.length < 2) continue;
    const byHash = new Map<string, Array<FileEntry>>();
    for (const entry of group) {
      const digest = await hashFile(entry.path);
      if (!byHash.has(digest)) {
        byHash.set(digest, []);
      }
      byHash.get(digest)!.push(entry);
    }

    for (const [digest, dupes] of byHash.entries()) {
      if (dupes.length < 2) continue;
      const sorted = dupes.sort((a, b) => a.path.localeCompare(b.path));
      const keeper = sorted[0];
      for (const duplicate of sorted.slice(1)) {
        await fs.rm(duplicate.path, { force: true });
        removedCount++;
        log({
          level: 'info',
          event: 'duplicate_removed',
          data: { kept: keeper.path, removed: duplicate.path, hash: digest },
        });
      }
    }
  }

  log({ level: 'info', event: 'duplicate_cleanup_done', data: { removed: removedCount } });
}

async function downloadGithubRepoZip(seedUrl: URL, outDir: string, userAgent: string, log: (entry: LogEntry) => void): Promise<{ repoDir: string; branch: string }> {
  const info = parseGithubRepoInfo(seedUrl);
  if (!info) {
    throw new Error('Not a GitHub repository URL');
  }

  const repoBase = sanitizeForFs(`${info.owner}_${info.repo}`);
  const repoDir = path.join(outDir, repoBase);
  await fs.rm(repoDir, { recursive: true, force: true });
  await fs.mkdir(repoDir, { recursive: true });

  const branches = ['main', 'master'];
  const zipPath = path.join(repoDir, 'repo.zip');
  let downloaded = false;
  let branchUsed = branches[0];
  for (const branch of branches) {
    const zipUrl = `https://github.com/${info.owner}/${info.repo}/archive/refs/heads/${branch}.zip`;
    log({ level: 'info', event: 'github_repo_zip_download', data: { url: zipUrl } });
    const response = await fetch(zipUrl, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'application/octet-stream',
      },
    }).catch((err) => {
      log({ level: 'error', event: 'github_repo_error', data: { seed: seedUrl.toString(), message: (err as Error).message } });
      return { ok: false } as Response;
    });
    if (response && response.ok && response.body) {
      await pipeline(response.body as any, createWriteStream(zipPath));
      downloaded = true;
      branchUsed = branch;
      log({ level: 'info', event: 'github_repo_zip_saved', data: { path: zipPath } });
      break;
    }
  }

  if (!downloaded) {
    throw new Error('Unable to download repository zip (branches main/master)');
  }

  await execAsync(`unzip -q -o "${zipPath}" -d "${repoDir}"`);
  await fs.rm(zipPath, { force: true });

  const entries = await fs.readdir(repoDir, { withFileTypes: true });
  const innerDir = entries.find((entry) => entry.isDirectory());
  if (innerDir) {
    const innerPath = path.join(repoDir, innerDir.name);
    const innerEntries = await fs.readdir(innerPath, { withFileTypes: true });
    for (const entry of innerEntries) {
      const from = path.join(innerPath, entry.name);
      const to = path.join(repoDir, entry.name);
      await fs.rename(from, to);
    }
    await fs.rm(innerPath, { recursive: true, force: true });
  }

  return { repoDir, branch: branchUsed };
}

async function defaultGithubRepoFetcher(args: GithubRepoFetcherArgs): Promise<FetchSummary | null> {
  const { seedUrl, outDir, log, allowedExtensions } = args;
  const info = parseGithubRepoInfo(seedUrl);
  if (!info) {
    return null;
  }

  await fs.mkdir(outDir, { recursive: true });
  let repoDir: string;
  let branchUsed: string = 'main';
  try {
    const result = await downloadGithubRepoZip(seedUrl, outDir, args.userAgent, log);
    repoDir = result.repoDir;
    branchUsed = result.branch;
  } catch (err) {
    log({ level: 'error', event: 'github_repo_error', data: { seed: seedUrl.toString(), message: (err as Error).message } });
    return { seed: seedUrl.toString(), visited: 1, downloaded: 0, skipped: 0, errors: 1 };
  }

  const { kept, removed } = await pruneNonSourceFiles(repoDir, allowedExtensions);
  const cleanupStats = await cleanupC64SpecificFiles(repoDir, log);
  const totalRemoved = removed + cleanupStats.removedNonC64 + cleanupStats.removedLocaleVariants + cleanupStats.removedAltMachineSuffix;
  const downloaded = cleanupStats.remaining;

  const licenseFetcher = args.licenseFetcher ?? fetchGithubLicense;
  let licenseInfo: GithubLicenseInfo | null = null;
  try {
    licenseInfo = await licenseFetcher({ owner: info.owner, repo: info.repo, userAgent: args.userAgent, log });
  } catch (err) {
    log({ level: 'warn', event: 'github_repo_license_error', data: { seed: seedUrl.toString(), message: err instanceof Error ? err.message : String(err) } });
  }

  if (licenseInfo?.licenseText) {
    try {
      const licensePath = path.join(repoDir, 'LICENSE');
      await fs.writeFile(licensePath, licenseInfo.licenseText, 'utf8');
      log({ level: 'info', event: 'github_repo_license_written', data: { path: licensePath } });
    } catch (err) {
      log({ level: 'warn', event: 'github_repo_license_write_failed', data: { message: err instanceof Error ? err.message : String(err) } });
    }
  }

  try {
    await writeGithubRepoMetadata(repoDir, {
      type: 'github',
      owner: info.owner,
      repo: info.repo,
      branch: branchUsed,
      repoUrl: `https://github.com/${info.owner}/${info.repo}`,
      license: licenseInfo,
    });
  } catch (err) {
    log({ level: 'warn', event: 'github_repo_metadata_write_failed', data: { message: err instanceof Error ? err.message : String(err) } });
  }

  log({
    level: 'info',
    event: 'github_repo_cloned',
    data: {
      seed: seedUrl.toString(),
      repoDir,
      branch: branchUsed,
      downloaded,
      removed: totalRemoved,
      removedNonC64: cleanupStats.removedNonC64,
      removedLocaleVariants: cleanupStats.removedLocaleVariants,
      removedMachineVariants: cleanupStats.removedAltMachineSuffix,
    },
  });
  return { seed: seedUrl.toString(), visited: 1, downloaded, skipped: totalRemoved, errors: 0 };
}

interface GithubRepoMetadataPayload {
  type: 'github';
  owner: string;
  repo: string;
  branch: string;
  repoUrl: string;
  license?: GithubLicenseInfo | null;
}

async function writeGithubRepoMetadata(repoDir: string, payload: GithubRepoMetadataPayload): Promise<void> {
  const now = new Date().toISOString();
  const data: Record<string, unknown> = {
    type: payload.type,
    owner: payload.owner,
    repo: payload.repo,
    branch: payload.branch,
    repoUrl: payload.repoUrl,
    generatedAt: now,
  };
  if (payload.license) {
    data.license = {
      spdxId: payload.license.licenseId ?? null,
      name: payload.license.licenseName ?? null,
      url: payload.license.licenseUrl ?? null,
      attribution: payload.license.attribution ?? null,
    };
  }
  const metadataPath = path.join(repoDir, '_metadata.json');
  await fs.writeFile(metadataPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function buildLicenseAttribution(owner: string, repo: string, licenseId?: string | null, licenseName?: string | null): string {
  const repoRef = `${owner}/${repo}`;
  const normalizedId = licenseId && licenseId !== 'NOASSERTION' ? licenseId : null;
  const label = normalizedId ?? (licenseName ?? null);
  const suffix = label ? ` (${label})` : ' (License unknown)';
  return `Source: ${repoRef}${suffix}`;
}

async function fetchGithubLicense(args: GithubLicenseFetcherArgs): Promise<GithubLicenseInfo | null> {
  const apiUrl = `https://api.github.com/repos/${args.owner}/${args.repo}/license`;
  const headers: Record<string, string> = {
    'User-Agent': args.userAgent,
    Accept: 'application/vnd.github+json',
  };
  try {
    const response = await fetch(apiUrl, { headers });
    if (response.ok) {
      const json: any = await response.json();
      const licenseId = json?.license?.spdx_id ?? null;
      const licenseName = json?.license?.name ?? null;
      const licenseUrl = json?.html_url ?? null;
      let licenseText: string | undefined;
      if (typeof json?.content === 'string' && (json?.encoding ?? '').toLowerCase() === 'base64') {
        try {
          licenseText = Buffer.from(json.content, 'base64').toString('utf8');
        } catch (err) {
          args.log({ level: 'warn', event: 'github_repo_license_decode_failed', data: { message: err instanceof Error ? err.message : String(err) } });
        }
      } else if (json?.download_url) {
        try {
          const textRes = await fetch(json.download_url, { headers: { 'User-Agent': args.userAgent } });
          if (textRes.ok) {
            licenseText = await textRes.text();
          }
        } catch (err) {
          args.log({ level: 'warn', event: 'github_repo_license_download_failed', data: { message: err instanceof Error ? err.message : String(err) } });
        }
      }
      return {
        licenseId,
        licenseName,
        licenseUrl,
        licenseText,
        attribution: buildLicenseAttribution(args.owner, args.repo, licenseId, licenseName),
      };
    }
    if (response.status !== 404) {
      args.log({ level: 'warn', event: 'github_repo_license_http_error', data: { status: response.status, url: apiUrl } });
    }
  } catch (err) {
    args.log({ level: 'warn', event: 'github_repo_license_fetch_error', data: { message: err instanceof Error ? err.message : String(err), url: apiUrl } });
  }

  const candidates = ['LICENSE', 'LICENSE.txt', 'LICENSE.md', 'COPYING', 'COPYING.txt', 'COPYING.md'];
  for (const candidate of candidates) {
    const rawUrl = `https://raw.githubusercontent.com/${args.owner}/${args.repo}/HEAD/${candidate}`;
    try {
      const res = await fetch(rawUrl, { headers: { 'User-Agent': args.userAgent } });
      if (res.ok) {
        const text = await res.text();
        const licenseUrl = `https://github.com/${args.owner}/${args.repo}/blob/HEAD/${candidate}`;
        return {
          licenseId: null,
          licenseName: null,
          licenseUrl,
          licenseText: text,
          attribution: buildLicenseAttribution(args.owner, args.repo, null, null),
        };
      }
    } catch (err) {
      args.log({ level: 'warn', event: 'github_repo_license_raw_error', data: { message: err instanceof Error ? err.message : String(err), url: rawUrl } });
    }
  }

  return {
    licenseId: null,
    licenseName: null,
    licenseUrl: null,
    licenseText: undefined,
    attribution: buildLicenseAttribution(args.owner, args.repo, null, null),
  };
}

function parseGithubRepoInfo(url: URL): { owner: string; repo: string } | null {
  if (!isGithubFamily(url.hostname) || url.hostname.toLowerCase() !== 'github.com') {
    return null;
  }
  const segments = url.pathname.split('/').filter((s) => s.length > 0);
  if (segments.length < 2) {
    return null;
  }
  const [owner, repo] = segments;
  if (!owner || !repo) {
    return null;
  }
  if (isGithubSingleFileUrl(url)) {
    return null;
  }
  const repoName = repo.endsWith('.git') ? repo.slice(0, -4) : repo;
  return { owner, repo: repoName };
}

export interface FetchSummary {
  seed: string;
  visited: number;
  downloaded: number;
  skipped: number;
  errors: number;
}

export interface GithubRepoFetcherArgs {
  seedUrl: URL;
  outDir: string;
  log: (entry: LogEntry) => void;
  userAgent: string;
  allowedExtensions: Set<string>;
  licenseFetcher?: (args: GithubLicenseFetcherArgs) => Promise<GithubLicenseInfo | null>;
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
  const githubRepoFetcher = opts.githubRepoFetcher ?? defaultGithubRepoFetcher;

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
    if (!isGithubSingleFileUrl(seedUrl)) {
      const repoInfo = parseGithubRepoInfo(seedUrl);
      if (repoInfo) {
        const repoOutDir = path.join(outDir, sanitizeForFs(seedUrl.hostname.toLowerCase()));
        const summary = await githubRepoFetcher({
          seedUrl,
          outDir: repoOutDir,
          log,
          userAgent,
          allowedExtensions: CODE_EXTS,
          licenseFetcher: opts.githubLicenseFetcher,
        });
        if (summary) {
          summaries.push(summary);
        }
        continue;
      }
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

        if (statusCode && (statusCode < 200 || statusCode >= 400)) {
          log({ level: 'error', event: 'http_error', data: { url: targetHref, statusCode } });
        }

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

        const isHtml = ct?.toLowerCase().includes('html');

          if (contentLength > maxBytes || body.length > maxBytes || isBinaryContentType(ct) || (!isHtml && (looksLikeHtml(body) || looksLikePdf(body)))) {
            skipped++;
            log({ level: 'info', event: 'skip_binary_or_oversize', data: { url: targetHref, contentLength, contentType: ct } });
            continue;
          }

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
                continue;
              }
              queue.push({ url: linkUrl, depth: nextDepth });
            }
            } else {
              log({ level: 'info', event: 'depth_exceeded', data: { url: targetHref, depth: d, maxDepth: depth } });
            }
            log({ level: 'info', event: 'discovered_links', data: { from: targetHref, count: links.length, depth: nextDepth } });
          }

        if (!isHtml && isCodeLikeUrl(targetUrl)) {
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

  try {
    await removeDuplicateFiles(outDir, log);
  } catch (err) {
    log({ level: 'error', event: 'duplicate_cleanup_error', data: { message: err instanceof Error ? err.message : String(err) } });
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
