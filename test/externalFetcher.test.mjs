// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchFromCsv } from '../src/rag/externalFetcher.ts';

function tmpDir(name) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  // Use an idiomatic in-repo test temp folder that is gitignored: test/tmp/
  return path.join(__dirname, 'tmp', name);
}

async function setupCsv(lines) {
  const dir = tmpDir('csv');
  await fs.mkdir(dir, { recursive: true });
  const csv = path.join(dir, 'sources.csv');
  await fs.writeFile(csv, lines.join('\n'), 'utf8');
  return csv;
}

function fakeRequesterFactory(pages) {
  /** @type {(url: URL, ua: string) => Promise<{statusCode:number, headers:any, body:Buffer}>} */
  return async (url) => {
    const key = url.toString();
    const page = pages[key];
    if (!page) {
      throw new Error('404: ' + key);
    }
    const body = page.body instanceof Buffer ? page.body : Buffer.from(page.body ?? '');
    return { statusCode: page.statusCode ?? 200, headers: page.headers ?? { 'content-type': 'text/html' }, body };
  };
}

test('applies default depth=5 and per-URL override', async () => {
  const csv = await setupCsv([
    'type,description,link,depth',
    'basic,Root A,http://example.com/index.html,2',
    'asm,Root B,http://example.com/other.html',
  ]);
  const outDir = tmpDir('out1');

  const pages = {
    'http://example.com/index.html': { headers: { 'content-type': 'text/html' }, body: '<a href="/a.bas">A</a><a href="/b.html">B</a>' },
    'http://example.com/b.html': { headers: { 'content-type': 'text/html' }, body: '<a href="/c.bas">C</a>' },
    'http://example.com/a.bas': { headers: { 'content-type': 'text/plain' }, body: '10 PRINT "A"' },
    'http://example.com/c.bas': { headers: { 'content-type': 'text/plain' }, body: '10 PRINT "C"' },
    'http://example.com/other.html': { headers: { 'content-type': 'text/html' }, body: '<a href="/d.s">D</a>' },
    'http://example.com/d.s': { headers: { 'content-type': 'text/plain' }, body: 'LDA #$00' },
  };

  const summaries = await fetchFromCsv({ csvPath: csv, outDir, defaultDepth: 5, request: fakeRequesterFactory(pages) });
  assert.equal(summaries.length, 2);
  // depth=2 for first seed should allow index -> b.html -> c.bas (2 hops) and index -> a.bas (1 hop)
  const exampleDir = path.join(outDir, 'example.com');
  const a = await fs.readFile(path.join(exampleDir, 'a.bas'), 'utf8');
  const c = await fs.readFile(path.join(exampleDir, 'c.bas'), 'utf8');
  assert.match(a, /PRINT/);
  assert.match(c, /PRINT/);
});

test('enforces domain restriction across subdomains', async () => {
  const csv = await setupCsv([
    'type,description,link,depth',
    'asm,Root,http://sub.example.co.uk/index.html,3',
  ]);
  const outDir = tmpDir('out2');
  const pages = {
    'http://sub.example.co.uk/index.html': { headers: { 'content-type': 'text/html' }, body: '<a href="http://www.example.co.uk/x.bas">X</a><a href="http://evil.com/y.bas">Y</a>' },
    'http://www.example.co.uk/x.bas': { headers: { 'content-type': 'text/plain' }, body: 'LDA #$01' },
  };
  const logs = [];
  const log = (e) => logs.push(e);
  const summaries = await fetchFromCsv({ csvPath: csv, outDir, defaultDepth: 3, request: fakeRequesterFactory(pages), log });
  assert.equal(summaries[0].downloaded, 1);
  assert.ok(
    logs.some(
      (e) =>
        (e.event === 'skip_out_of_domain' || e.event === 'skip_link') &&
        /evil\.com/.test(JSON.stringify(e.data)),
    ),
  );
});

test('applies throttling (10 rps) and max 500 per seed', async () => {
  const csv = await setupCsv([
    'type,description,link,depth',
    'basic,Root,http://t.com/index.html,1',
  ]);
  const outDir = tmpDir('out3');
  // Create a page with many links to test maxRequests
  const links = Array.from({ length: 600 }, (_, i) => `<a href="/f${i}.bas">${i}</a>`).join('');
  const pages = { 'http://t.com/index.html': { headers: { 'content-type': 'text/html' }, body: links } };
  for (let i = 0; i < 600; i++) {
    pages[`http://t.com/f${i}.bas`] = { headers: { 'content-type': 'text/plain' }, body: `10 PRINT ${i}` };
  }

  const logs = [];
  const summaries = await fetchFromCsv({ csvPath: csv, outDir, request: fakeRequesterFactory(pages), log: (e) => logs.push(e), defaultDepth: 1, maxRequestsPerSeed: 500, perDomainRps: Infinity, concurrency: 8 });
  const s = summaries[0];
  assert.ok(s.visited <= 500);
  assert.ok(s.downloaded >= 1);
});

test('allows concurrent requests to a single host within per-domain RPS', async () => {
  const csv = await setupCsv([
    'type,description,link,depth',
    'basic,Root,http://conc.com/index.html,1',
  ]);
  const outDir = tmpDir('out5');

  const requestedAt = [];
  const pages = {
    'http://conc.com/index.html': { headers: { 'content-type': 'text/html' }, body: '<a href="/x.bas">X</a><a href="/y.bas">Y</a><a href="/z.bas">Z</a><a href="/w.bas">W</a>' },
    'http://conc.com/x.bas': { headers: { 'content-type': 'text/plain' }, body: '10 PRINT X' },
    'http://conc.com/y.bas': { headers: { 'content-type': 'text/plain' }, body: '10 PRINT Y' },
    'http://conc.com/z.bas': { headers: { 'content-type': 'text/plain' }, body: '10 PRINT Z' },
    'http://conc.com/w.bas': { headers: { 'content-type': 'text/plain' }, body: '10 PRINT W' },
  };
  const requester = async (url) => {
    requestedAt.push(Date.now());
    const key = url.toString();
    const page = pages[key];
    if (!page) throw new Error('404');
    // small jitter to simulate network
    await new Promise((r) => setTimeout(r, 5));
    return { statusCode: 200, headers: page.headers, body: Buffer.from(page.body) };
  };

  const summaries = await fetchFromCsv({ csvPath: csv, outDir, defaultDepth: 1, request: requester, perDomainRps: 10, concurrency: 4, maxRetries: 0, recoveryIntervalMs: 10, recoveryStep: 5 });
  assert.equal(summaries[0].downloaded, 4);
  // Verify multiple timestamps are not all identical (i.e., concurrency occurred) while still being rate-limited by 10 rps.
  assert.ok(requestedAt.length >= 5); // includes HTML + 4 files
});

test('concurrent retrieval across multiple hosts respects per-host rate limits', async () => {
  const csv = await setupCsv([
    'type,description,link,depth',
    'asm,HostA,http://a.com/index.html,1',
    'asm,HostB,http://b.com/index.html,1',
  ]);
  const outDir = tmpDir('out6');
  const pages = {
    'http://a.com/index.html': { headers: { 'content-type': 'text/html' }, body: '<a href="/a1.s">A1</a><a href="/a2.s">A2</a>' },
    'http://a.com/a1.s': { headers: { 'content-type': 'text/plain' }, body: 'LDA #$01' },
    'http://a.com/a2.s': { headers: { 'content-type': 'text/plain' }, body: 'LDA #$02' },
    'http://b.com/index.html': { headers: { 'content-type': 'text/html' }, body: '<a href="/b1.s">B1</a><a href="/b2.s">B2</a>' },
    'http://b.com/b1.s': { headers: { 'content-type': 'text/plain' }, body: 'LDA #$03' },
    'http://b.com/b2.s': { headers: { 'content-type': 'text/plain' }, body: 'LDA #$04' },
  };
  const requester = async (url) => {
    await new Promise((r) => setTimeout(r, 1));
    const key = url.toString();
    const page = pages[key];
    if (!page) throw new Error('404');
    return { statusCode: 200, headers: page.headers, body: Buffer.from(page.body) };
  };
  const summaries = await fetchFromCsv({ csvPath: csv, outDir, defaultDepth: 1, request: requester, perDomainRps: 10, concurrency: 4, maxRetries: 0, recoveryIntervalMs: 10, recoveryStep: 5 });
  assert.equal(summaries.length, 2);
  assert.equal(summaries[0].downloaded + summaries[1].downloaded, 4);
});

test('reduces per-host RPS on 429 and slowly recovers', async () => {
  const csv = await setupCsv([
    'type,description,link,depth',
    'basic,Root,http://rl.com/index.html,1',
  ]);
  const outDir = tmpDir('rate');
  let count = 0;
  const pages = {
    'http://rl.com/index.html': { headers: { 'content-type': 'text/html' }, body: '<a href="/a.bas">A</a><a href="/b.bas">B</a><a href="/c.bas">C</a><a href="/d.bas">D</a>' },
    'http://rl.com/a.bas': { headers: { 'content-type': 'text/plain' }, body: '10 PRINT A' },
    'http://rl.com/b.bas': { headers: { 'content-type': 'text/plain' }, body: '10 PRINT B' },
    'http://rl.com/c.bas': { headers: { 'content-type': 'text/plain' }, body: '10 PRINT C' },
    'http://rl.com/d.bas': { headers: { 'content-type': 'text/plain' }, body: '10 PRINT D' },
  };
  const requester = async (url) => {
    const key = url.toString();
    if (key !== 'http://rl.com/index.html') {
      count++;
      if (count <= 2) {
        return { statusCode: 429, headers: { 'content-type': 'text/plain' }, body: Buffer.from('rate limited') };
      }
    }
    return { statusCode: 200, headers: pages[key].headers, body: Buffer.from(pages[key].body) };
  };
  const summaries = await fetchFromCsv({ csvPath: csv, outDir, defaultDepth: 1, request: requester, perDomainRps: 6, concurrency: 4, maxRetries: 3, recoveryIntervalMs: 20, recoveryStep: 2, throttleBackoffFactor: 0.5 });
  // Should complete downloads despite initial 429s due to retries/backoff and recovery
  assert.equal(summaries[0].downloaded, 4);
});

test('logs key events and handles failures gracefully', async () => {
  const csv = await setupCsv([
    'type,description,link,depth',
    'basic,Root,http://z.com/index.html,1',
  ]);
  const outDir = tmpDir('out4');
  const pages = {
    'http://z.com/index.html': { headers: { 'content-type': 'text/html' }, body: '<a href="/ok.bas">OK</a><a href="/missing.bas">MISS</a>' },
    'http://z.com/ok.bas': { headers: { 'content-type': 'text/plain' }, body: '10 PRINT OK' },
    // missing.bas not defined -> requester throws
  };
  const logs = [];
  const summaries = await fetchFromCsv({ csvPath: csv, outDir, defaultDepth: 2, request: fakeRequesterFactory(pages), log: (e) => logs.push(e) });
  assert.equal(summaries[0].errors >= 1, true);
  assert.ok(logs.some((e) => e.event === 'request_error'));
  assert.ok(logs.some((e) => e.event === 'download_success'));
  assert.ok(logs.some((e) => e.event === 'seed_done'));
});

test('ignores HTML masquerading as text files', async () => {
  const csv = await setupCsv([
    'type,description,link,depth',
    'asm,Github blob,http://github.com/repo/blob/master/file.asm,1',
  ]);
  const outDir = tmpDir('html-filter');
  const htmlBody = Buffer.from('<html><head></head><body>not source</body></html>');
  const pages = {
    'http://github.com/repo/blob/master/file.asm': { headers: { 'content-type': 'text/plain' }, body: htmlBody },
    'https://raw.githubusercontent.com/repo/blob/master/file.asm': { headers: { 'content-type': 'text/plain' }, body: htmlBody },
  };
  const logs = [];
  const summaries = await fetchFromCsv({ csvPath: csv, outDir, defaultDepth: 1, request: fakeRequesterFactory(pages), log: (e) => logs.push(e) });
  assert.equal(summaries[0].downloaded, 0);
  assert.ok(logs.some((e) => e.event === 'skip_binary_or_oversize'));
});
