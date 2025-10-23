#!/usr/bin/env node
// Lightweight CLI launcher for the compiled server
// Usage: `npx c64-mcp` or after local install `c64-mcp`

import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const entryUrl = new URL('../dist/index.js', `file://${here}/`);

// Defer to the real server entry
await import(entryUrl.href);
