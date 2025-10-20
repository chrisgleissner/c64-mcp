#!/usr/bin/env node
import { spawn } from "node:child_process";

const DEFAULT_TARGET = "mock";

let target = DEFAULT_TARGET;
let explicitBaseUrl = null;
const nodeArgs = ["--loader", "ts-node/esm", "--test"];

for (const arg of process.argv.slice(2)) {
  if (arg === "--mock") {
    target = "mock";
    continue;
  }

  if (arg === "--real") {
    target = "real";
    continue;
  }

  if (arg.startsWith("--target=")) {
    target = arg.split("=", 2)[1] ?? DEFAULT_TARGET;
    continue;
  }

  if (arg.startsWith("--base-url=")) {
    explicitBaseUrl = arg.split("=", 2)[1] ?? null;
    continue;
  }

  nodeArgs.push(arg);
}
const env = {
  ...process.env,
  C64_TEST_TARGET: target,
};

if (explicitBaseUrl) {
  env.C64_TEST_BASE_URL = explicitBaseUrl;
}

if (target === "real" && !env.C64_TEST_BASE_URL) {
  env.C64_TEST_BASE_URL = "http://c64u";
}

const child = spawn(process.execPath, nodeArgs, {
  stdio: "inherit",
  env,
});

child.on("close", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
