#!/usr/bin/env node
/*
 * VICE Binary Monitor smoke test (TypeScript)
 */
import net from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { ViceClient } from "../../src/vice/viceClient.js";
import { waitForScreenPattern, buildReadyPattern, waitForAnyScreenText } from "../../src/vice/readiness.js";
import { startViceMockServer, type ViceMockServer } from "../../src/vice/mockServer.js";

type Timing = { label: string; ms: number };
function nowNs(): bigint { return process.hrtime.bigint(); }
function msSince(start: bigint): number { return Number((process.hrtime.bigint() - start) / 1_000_000n); }
function log(label: string) { console.log(`[+] ${label}`); }
function logT(sink: Timing[], label: string, start: bigint) { const ms = msSince(start); sink.push({ label, ms }); console.log(`[t] ${label}=${ms}ms`); }

const TEST_TARGET = (process.env.VICE_TEST_TARGET || "").toLowerCase();
const USE_MOCK = TEST_TARGET === "mock";
const VICE_BIN = process.env.VICE_BINARY || "x64sc";
const DEFAULT_PORT = Number(process.env.VICE_PORT || 6502);
const VISIBLE = process.env.VICE_VISIBLE === "1";
const KEEP_OPEN = process.env.VICE_KEEP_OPEN === "1";
const WARP = USE_MOCK ? true : process.env.VICE_WARP !== "0";
const DISPLAY = process.env.DISPLAY || ":99";

function shouldUseXvfb(): boolean {
  if (USE_MOCK || VISIBLE) return false;
  if (process.env.FORCE_XVFB === "1") return true;
  const ci = (process.env.CI || "").toLowerCase();
  return ci === "true" || ci === "1" || ci === "yes";
}

function buildViceArgs(port: number): string[] {
  const args = [
    "-binarymonitor",
    "-binarymonitoraddress", `127.0.0.1:${port}`,
    "-sounddev", "dummy",
    "-config", "/dev/null",
  ];
  if (WARP) args.push("-warp");
  return args;
}

async function waitForPort(port: number, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise<void>((resolve, reject) => {
        const s = net.connect({ host: "127.0.0.1", port }, () => { s.end(); resolve(); });
        s.on("error", reject);
        s.setTimeout(300, () => { s.destroy(new Error("timeout")); });
      });
      return;
    } catch {}
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error(`Timeout waiting for port ${port}`);
}

function buildHelloProgramBody(): Buffer {
  return Buffer.from([
    0x0E,0x08,
    0x0A,0x00,
    0x99,
    0x22,0x48,0x45,0x4C,0x4C,0x4F,0x22,
    0x00,
    0x00,0x00,
  ]);
}

async function main() {
  const timings: Timing[] = [];
  let xvfb: ChildProcess | null = null;
  let vice: ChildProcess | null = null;
  let bm: ViceClient | null = null;
  let mock: (ViceMockServer & { port: number }) | null = null;
  let port = DEFAULT_PORT;

  const cleanup = async () => {
    if (bm) {
      try { await bm.quit(); } catch {}
      try { bm.close(); } catch {}
      bm = null;
    }
    if (vice && !KEEP_OPEN) { try { vice.kill("SIGTERM"); } catch {} vice = null; }
    if (mock) { try { await mock.stop(); } catch {}; mock = null; }
    if (xvfb) { try { xvfb.kill("SIGTERM"); } catch {} xvfb = null; }
  };

  process.on("exit", () => { void cleanup(); });
  process.on("SIGINT", () => { void cleanup().then(() => process.exit(130)); });
  process.on("SIGTERM", () => { void cleanup().then(() => process.exit(143)); });
  process.on("uncaughtException", () => { void cleanup(); });
  process.on("unhandledRejection", () => { void cleanup(); });

  try {
    if (!USE_MOCK && shouldUseXvfb()) {
      log("Starting Xvfb...");
      const t0 = nowNs();
      xvfb = spawn("Xvfb", [DISPLAY, "-screen", "0", "640x480x24"], { stdio: "ignore" });
      logT(timings, "spawn_xvfb", t0);
      process.env.DISPLAY = DISPLAY;
      await new Promise(r => setTimeout(r, 300));
    }

    if (USE_MOCK) {
      mock = await startViceMockServer({ host: "127.0.0.1", port: DEFAULT_PORT > 0 ? DEFAULT_PORT : undefined });
      port = mock.port;
      log(`[+] Using VICE mock server on port ${port}`);
    } else {
      log("Launching VICE...");
      const args = buildViceArgs(DEFAULT_PORT);
      const t1 = nowNs();
      vice = spawn(VICE_BIN, args, { stdio: "ignore" });
      logT(timings, "spawn_vice", t1);

      log(`Waiting for BM port ${DEFAULT_PORT}...`);
      const t2 = nowNs();
      await waitForPort(DEFAULT_PORT, 4000);
      logT(timings, "wait_port", t2);
    }

    bm = new ViceClient();
    const t3 = nowNs();
    await bm.connect(port);
    await bm.info();
    logT(timings, "bm_info", t3);

    const t4 = nowNs();
    await bm.reset(USE_MOCK || !WARP || VISIBLE ? 1 : 0);
    logT(timings, "bm_reset", t4);

    await new Promise(r => setTimeout(r, 250));
    await bm.keyboardFeed("\r\r\r");
    const readyStart = nowNs();
    const between = async () => { try { await bm!.exitMonitor(); } catch {} };
    const anyText = await waitForAnyScreenText(bm, 10_000, 50, undefined, between);
    if (!anyText) throw new Error("Screen stayed blank (no text) after reset");
    const readyIdx = await waitForScreenPattern(bm, buildReadyPattern(), 10_000, 50, undefined, between);
    logT(timings, "wait_ready", readyStart);
    if (readyIdx < 0) throw new Error("READY. prompt not detected");
    log("[✓] BASIC READY detected");

    const program = buildHelloProgramBody();
    const programEnd = 0x0801 + program.length;
    const t5 = nowNs();
    await bm.memSet(0x0801, program);
    const ptrs = Buffer.alloc(8);
    ptrs.writeUInt16LE(0x0801, 0);
    ptrs.writeUInt16LE(programEnd, 2);
    ptrs.writeUInt16LE(programEnd, 4);
    ptrs.writeUInt16LE(programEnd, 6);
    await bm.memSet(0x002B, ptrs);
    await bm.keyboardFeed("RUN\r");
    logT(timings, "inject_and_run", t5);

    const hello = Buffer.from([0x08, 0x05, 0x0C, 0x0C, 0x0F]);
    const helloStart = nowNs();
    const betweenRun = async () => { try { await bm!.exitMonitor(); } catch {} };
    const idx = await waitForScreenPattern(bm, hello, USE_MOCK || VISIBLE || !WARP ? 10_000 : 2_000, 50, undefined, betweenRun);
    logT(timings, "wait_hello", helloStart);
    if (idx < 0) throw new Error("HELLO not found on screen");
    log(`[✓] HELLO found at row ${Math.floor(idx / 40)}, col ${idx % 40}`);

    if (!KEEP_OPEN) {
      try { await bm.quit(); } catch {}
      try { bm.close(); } catch {}
      bm = null;
    } else {
      log("VICE_KEEP_OPEN=1 — keep window open; close it to end.");
      // eslint-disable-next-line no-constant-condition
      while (true) await new Promise(r => setTimeout(r, 1000));
    }

    console.log("[timings]");
    for (const t of timings) console.log(`[timing] ${t.label} ${t.ms}ms`);
  } catch (err) {
    await cleanup();
    throw err;
  } finally {
    if (!KEEP_OPEN) await cleanup();
  }
}

main().catch((err) => {
  console.error("[!] Smoke test failed:", err);
  process.exit(1);
});
