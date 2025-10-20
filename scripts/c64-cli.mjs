import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, basename, resolve } from "node:path";
import { Buffer } from "node:buffer";
import process from "node:process";
import { basicToPrg } from "../src/basicConverter.ts";
import { loadConfig } from "../src/config.ts";
import { C64Client } from "../src/c64Client.ts";

const booleanFlags = new Set(["run"]);

function parseOptions(args) {
  const options = new Map();
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    if (booleanFlags.has(key)) {
      options.set(key, true);
      continue;
    }
    const value = args[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for option: --${key}`);
    }
    options.set(key, value);
    i += 1;
  }
  return options;
}

async function ensureOutputPath(path) {
  await mkdir(dirname(path), { recursive: true });
}

function resolveOutputPath(inputPath, suppliedOutput) {
  if (suppliedOutput) {
    return resolve(process.cwd(), suppliedOutput);
  }
  const base = basename(inputPath, extname(inputPath)) || "program";
  return resolve(process.cwd(), "artifacts", `${base}.prg`);
}

function printResult(result) {
  if (!result) {
    return;
  }
  if (result.success) {
    console.log("C64 responded:", JSON.stringify(result.details, null, 2));
  } else {
    console.error("C64 returned an error:", JSON.stringify(result.details, null, 2));
  }
}

async function handleConvertBasic(args, { autoRun }) {
  const options = parseOptions(args);
  const inputPath = options.get("input");
  if (!inputPath) {
    throw new Error("Please provide --input <path-to-basic-file>");
  }

  const outputPath = resolveOutputPath(inputPath, options.get("output"));
  const contents = await readFile(resolve(process.cwd(), inputPath), "utf8");
  const prg = basicToPrg(contents);
  await ensureOutputPath(outputPath);
  await writeFile(outputPath, prg);
  console.log(`PRG written to ${outputPath}`);

  if (autoRun || options.get("run")) {
    const result = await runPrgOnHardware(prg);
    printResult(result);
  }
}

async function handleRunPrg(args) {
  const options = parseOptions(args);
  const inputPath = options.get("input");
  if (!inputPath) {
    throw new Error("Please provide --input <path-to-prg-file>");
  }
  const prg = await readFile(resolve(process.cwd(), inputPath));
  const result = await runPrgOnHardware(prg);
  printResult(result);
}

async function runPrgOnHardware(prg) {
  const config = loadConfig();
  const target = config.baseUrl ?? `http://${config.c64_host}`;
  const client = new C64Client(target);
  console.log(`Uploading PRG (${prg.length} bytes) to ${target} ...`);
  return client.runPrg(prg);
}

function printHelp() {
  console.log(`Usage:
  node --loader ts-node/esm scripts/c64-cli.mjs <command> [options]

Commands:
  convert-basic   Convert a BASIC text file into a PRG. Options: --input <path> [--output <path>] [--run]
  run-basic       Convert a BASIC text file and immediately run it. Options: --input <path> [--output <path>]
  run-prg         Upload and run an existing PRG file. Options: --input <path>

Examples:
  node --loader ts-node/esm scripts/c64-cli.mjs convert-basic --input demos/hello.bas
  node --loader ts-node/esm scripts/c64-cli.mjs run-basic --input demos/hello.bas
  node --loader ts-node/esm scripts/c64-cli.mjs run-prg --input artifacts/demo-basic.prg
`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  try {
    switch (command) {
      case "convert-basic":
        await handleConvertBasic(rest, { autoRun: false });
        break;
      case "run-basic":
        await handleConvertBasic(rest, { autoRun: true });
        break;
      case "run-prg":
        await handleRunPrg(rest);
        break;
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  }
}

await main();
