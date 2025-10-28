#!/usr/bin/env bun
// CI helper: writes the mock C64 base URL (plain text) for workflow callers and blocks until killed.
import { writeFileSync } from 'node:fs';
import process from 'node:process';
import path from 'node:path';

async function main() {
  const outputArg = process.argv[2];
  const resolvePath = (maybePath) => {
    if (!maybePath) {
      return null;
    }
    if (path.isAbsolute(maybePath)) {
      return maybePath;
    }
    return path.resolve(process.cwd(), maybePath);
  };
  const outputFile = resolvePath(outputArg);

  const moduleUrl = new URL('../test/mockC64Server.mjs', import.meta.url);
  const { startMockC64Server } = await import(moduleUrl.href);
  const server = await startMockC64Server();
  const baseUrl = server.baseUrl;
  console.log(`[mock-c64] listening at ${baseUrl}`);
  if (outputFile) {
    writeFileSync(outputFile, baseUrl, 'utf8');
  }

  const shutdown = async (signal) => {
    console.log(`[mock-c64] received ${signal ?? 'signal'}, shutting down`);
    try {
      await server.close();
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  await new Promise(() => {});
}

main().catch((error) => {
  console.error('[mock-c64] failed to start mock server:', error);
  process.exit(1);
});
