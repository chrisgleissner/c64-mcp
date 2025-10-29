#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

if (process.argv.length < 3) {
  console.error("Usage: node scripts/invoke-bun.mjs <command> [args...]");
  process.exit(1);
}

const bunArgs = process.argv.slice(2);

function resolveBunExecutable() {
  const candidates = [
    process.env.BUN_BIN,
    process.env.C64BRIDGE_TEST_BUN_BIN,
    process.env.C64BRIDGE_BUN_BIN,
    process.env.BUN_INSTALL ? path.join(process.env.BUN_INSTALL, "bin", "bun") : null,
    path.join(os.homedir(), ".bun", "bin", "bun"),
    "bun",
  ];

  for (const candidate of candidates) {
    if (!candidate || !candidate.trim()) {
      continue;
    }

    if (candidate === "bun") {
      return "bun";
    }

    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  return "bun";
}

const bunExecutable = resolveBunExecutable();
const child = spawn(bunExecutable, bunArgs, {
  stdio: "inherit",
  env: {
    ...process.env,
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
