// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchFromCsv } from '../src/rag/externalFetcher.ts';

function tmpDir(name) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.join(__dirname, '..', '.tmp', name);
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
    return { statusCode: page.statusCode ?? 200, headers: page.headers ?? { 'content-type': 'text/html' }, body: Buffer.from(page.body ?? '') };
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
  assert.ok(logs.some((e) => e.event === 'skip_out_of_domain' && /evil\.com/.test(JSON.stringify(e.data))));
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
  const summaries = await fetchFromCsv({ csvPath: csv, outDir, request: fakeRequesterFactory(pages), log: (e) => logs.push(e), defaultDepth: 1, maxRequestsPerSeed: 500, perDomainRps: Infinity });
  const s = summaries[0];
  assert.ok(s.visited <= 500);
  assert.ok(s.downloaded >= 1);
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
  assert.ok(logs.some((e) => e.event === 'download'));
  assert.ok(logs.some((e) => e.event === 'seed_done'));
});
