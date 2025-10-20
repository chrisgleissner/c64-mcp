#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { fetchFromCsv } from '../src/rag/externalFetcher.ts';

async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(__dirname, '..');
  const csvPath = process.env.RAG_SOURCES_CSV || path.join(projectRoot, 'src/rag/sources.csv');
  const outDir = process.env.RAG_EXTERNAL_DIR || path.join(projectRoot, 'external');
  const defaultDepth = Number(process.env.RAG_DEFAULT_DEPTH || 5);
  const perDomainRps = Number(process.env.RAG_RPS || 10);
  const maxRequestsPerSeed = Number(process.env.RAG_MAX_REQUESTS || 500);

  const log = (entry) => {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
    process.stdout.write(line + '\n');
  };

  const summaries = await fetchFromCsv({
    csvPath,
    outDir,
    defaultDepth,
    perDomainRps,
    maxRequestsPerSeed,
    log,
  });

  const total = summaries.reduce((a, s) => a + s.visited, 0);
  const dl = summaries.reduce((a, s) => a + s.downloaded, 0);
  log({ level: 'info', event: 'session_summary', data: { seeds: summaries.length, totalVisited: total, totalDownloaded: dl } });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
