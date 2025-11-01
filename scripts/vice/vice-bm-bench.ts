#!/usr/bin/env node
/*
 * VICE Binary Monitor benchmark: compares injection vs fresh -autostart
 * Usage: node scripts/invoke-bun.mjs scripts/vice/vice-bm-bench.ts
 */

import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { ViceClient } from "../../src/vice/viceClient.ts";
import { buildReadyPattern, waitForBasicReady, waitForScreenPattern, asciiToScreenCodes, type TimingSink } from "../../src/vice/readiness.ts";

type Timing = { scope: string; label: string; ms: number };

function nowNs(): bigint { return process.hrtime.bigint(); }
function msSince(start: bigint): number { return Number((process.hrtime.bigint() - start) / 1_000_000n); }
function logTiming(scope: string, label: string, start: bigint, sink: Timing[]): void {
  const ms = msSince(start);
  sink.push({ scope, label, ms });
  console.log(`[t] ${scope}:${label}=${ms}ms`);
}

const VICE_BIN = process.env.VICE_BINARY || "x64sc";
const PORT_INJECT = Number(process.env.VICE_PORT || 6502);
const PORT_AUTOSTART = Number(process.env.VICE_PORT2 || 6510);
const DISPLAY = process.env.DISPLAY || ":99";
const KEEP_OPEN = process.env.VICE_KEEP_OPEN === "1";
const VISIBLE = process.env.VICE_VISIBLE === "1" || process.env.DISABLE_XVFB === "1";

function shouldUseXvfb(): boolean {
  if (VISIBLE) return false; // explicit request to show VICE window
  if (process.env.FORCE_XVFB === "1") return true;
  const ci = (process.env.CI || "").toLowerCase();
  return ci === "true" || ci === "1" || ci === "yes";
}

function buildViceArgsForPort(port: number): string[] {
  const args = [
    "-binarymonitor",
    "-binarymonitoraddress", `127.0.0.1:${port}`,
    "-sounddev", "dummy",
    "-config", "/dev/null",
  ];
  // Allow disabling warp when users want to see the program unfolding on screen
  if (process.env.VICE_WARP !== "0") args.push("-warp");
  return args;
}

function spawnXvfbIfNeeded(timings: Timing[], scope = "bench"): { proc: import("node:child_process").ChildProcess | null } {
  if (!shouldUseXvfb()) return { proc: null };
  const cmd = "Xvfb";
  const args = [DISPLAY, "-screen", "0", "640x480x24"];
  const t0 = nowNs();
  const proc = spawn(cmd, args, { stdio: "ignore" });
  process.env.DISPLAY = DISPLAY;
  logTiming(scope, "spawn_xvfb", t0, timings);
  return { proc };
}

function spawnVice(args: string[], timings: Timing[], scope: string): import("node:child_process").ChildProcess {
  const t0 = nowNs();
  const proc = spawn(VICE_BIN, args, { stdio: "ignore" });
  logTiming(scope, "spawn_vice", t0, timings);
  return proc;
}

async function waitForPort(port: number, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise<void>((resolve, reject) => {
        const s = net.connect({ host: "127.0.0.1", port }, () => {
          s.end();
          resolve();
        });
        s.on("error", reject);
        s.setTimeout(300, () => { s.destroy(new Error("timeout")); });
      });
      return;
    } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Timeout waiting for port ${port}`);
}

function buildHelloProgramBody(): Buffer {
  // $0801 program body: 10 PRINT "HELLO"
  return Buffer.from([
    0x0E,0x08, // pointer to next line ($080E)
    0x0A,0x00, // 10
    0x99,      // PRINT
    0x22,0x48,0x45,0x4C,0x4C,0x4F,0x22,
    0x00,      // EOL
    0x00,0x00, // end of program
  ]);
}

function buildReadyPattern(): Buffer {
  // Screen-codes for "READY." in power-on uppercase:
  // R=0x12, E=0x05, A=0x01, D=0x04, Y=0x19, '.'=0x2E
  return Buffer.from([0x12, 0x05, 0x01, 0x04, 0x19, 0x2E]);
}

async function waitForScreenPattern(
  bm: ViceClient,
  pattern: Buffer,
  timeoutMs: number,
  timings: Timing[],
  scope: string,
  label: string,
): Promise<number> {
  const start = nowNs();
  let idx = -1;
  while (msSince(start) < timeoutMs) {
    const t = nowNs();
    const screen = await bm.memGet(0x0400, 0x0400 + 999);
    logTiming(scope, "bm_read_screen", t, timings);
    idx = screen.indexOf(pattern);
    if (idx >= 0) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  const s0 = start; // preserve for logging
  logTiming(scope, label, s0, timings);
  return idx;
}

async function runInjectionFlow(timings: Timing[]): Promise<void> {
  const scope = "injection";
  const tWait = nowNs();
  await waitForPort(PORT_INJECT, 10_000);
  logTiming(scope, "wait_port", tWait, timings);

  const bm = new ViceClient();
  await bm.connect(PORT_INJECT);

  let t = nowNs();
  await bm.info();
  logTiming(scope, "bm_info", t, timings);

  // reset
  t = nowNs();
  await bm.reset( VISIBLE || process.env.VICE_WARP === "0" ? 1 : 0 );
  logTiming(scope, "bm_reset_soft", t, timings);

  // Wait until BASIC pointers are initialised, and READY. is visible (visible/warp-off)
  const ptrStart = nowNs();
  const onPtr: TimingSink = (_label, start) => logTiming(scope, "bm_read_basic_ptrs", start, timings);
  const onScr: TimingSink = (_label, start) => logTiming(scope, "bm_read_screen", start, timings);
  const ptrTimeout = (process.env.VICE_WARP === "0" || VISIBLE) ? 10_000 : 2_000;
  let ptrSampleCount = 0;
  const { pointersOk, promptOk } = await waitForBasicReady(bm, {
    timeoutMs: ptrTimeout,
    ensurePrompt: true,
    onPointersRead: onPtr,
    onScreenRead: onScr,
    onPointersSample: ({ tx, va, ar, st }) => {
      // Log every ~10th sample for diagnostics
      if ((ptrSampleCount++ % 10) === 0) {
        console.log(`[ptr] TXTTAB=$${tx.toString(16).padStart(4,'0')} VARTAB=$${va.toString(16).padStart(4,'0')} ARYTAB=$${ar.toString(16).padStart(4,'0')} STREND=$${st.toString(16).padStart(4,'0')}`);
      }
    },
  });
  logTiming(scope, "wait_basic_pointers", ptrStart, timings);
  if (!pointersOk) throw new Error("Timeout waiting for BASIC pointers.");

  if (!promptOk) {
    const readyTimeout = (process.env.VICE_WARP === "0" || VISIBLE) ? 10_000 : 2_000;
    const readyStart = nowNs();
    const idx = await waitForScreenPattern(bm, buildReadyPattern(), readyTimeout, 50, onScr);
    logTiming(scope, "wait_ready", readyStart, timings);
    if (idx < 0) throw new Error("Timeout waiting for READY.");
  }

  // write program
  const program = buildHelloProgramBody();
  t = nowNs();
  await bm.memSet(0x0801, program);
  logTiming(scope, "bm_write_program", t, timings);
  const programEnd = 0x0801 + program.length;
  const ptrs = Buffer.alloc(8);
  ptrs.writeUInt16LE(0x0801, 0);
  ptrs.writeUInt16LE(programEnd, 2);
  ptrs.writeUInt16LE(programEnd, 4);
  ptrs.writeUInt16LE(programEnd, 6);
  t = nowNs();
  await bm.memSet(0x002B, ptrs);
  logTiming(scope, "bm_patch_basic_pointers", t, timings);

  // RUN
  t = nowNs();
  await bm.keyboardFeed("RUN\r");
  logTiming(scope, "bm_keyboard_feed", t, timings);

  // read/poll screen for HELLO (if warp disabled or visible, allow time for output)
  const hello = Buffer.from([0x08, 0x05, 0x0C, 0x0C, 0x0F]);
  let idx = -1;
  if (process.env.VICE_WARP === "0" || VISIBLE) {
    const helloStart = nowNs();
    idx = await waitForScreenPattern(bm, hello, 10_000, 50, onScr);
    logTiming(scope, "wait_hello", helloStart, timings);
  } else {
    t = nowNs();
    const screen = await bm.memGet(0x0400, 0x0400 + 999);
    logTiming(scope, "bm_read_screen", t, timings);
    idx = screen.indexOf(hello);
  }
  if (idx < 0) throw new Error("HELLO not found on screen");
  console.log(`[✓] Injection: HELLO found at row ${Math.floor(idx / 40)}, col ${idx % 40}`);

  // Extra diagnostic: confirm banner if needed
  if (process.env.VICE_DEBUG_READY === "1") {
    const banner = asciiToScreenCodes("COMMODORE 64 BASIC V2");
    const tB = nowNs();
    const screen = await bm.memGet(0x0400, 0x0400 + 999);
    logTiming(scope, "bm_read_screen", tB, timings);
    const bIdx = screen.indexOf(banner);
    console.log(`[debug] banner index=${bIdx}`);
  }

  bm.close();
}

function writeTempPrg(body: Buffer): string {
  const prg = Buffer.concat([Buffer.from([0x01, 0x08]), body]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vice-bench-"));
  const p = path.join(dir, "hello.prg");
  fs.writeFileSync(p, prg);
  return p;
}

async function runAutostartFlow(timings: Timing[]): Promise<void> {
  const scope = "autostart";
  const body = buildHelloProgramBody();
  const t0 = nowNs();
  const prgPath = writeTempPrg(body);
  logTiming(scope, "prepare_prg", t0, timings);

  const args = [...buildViceArgsForPort(PORT_AUTOSTART), "-autostart", prgPath];
  const proc = spawnVice(args, timings, scope);

  const t1 = nowNs();
  await waitForPort(PORT_AUTOSTART, 10_000);
  logTiming(scope, "wait_port", t1, timings);

  const bm = new ViceClient();
  await bm.connect(PORT_AUTOSTART);
  let t = nowNs();
  await bm.info();
  logTiming(scope, "bm_info", t, timings);

  // poll screen up to 2s
  const hello = Buffer.from([0x08, 0x05, 0x0C, 0x0C, 0x0F]);
  const start = nowNs();
  let found = false;
  while (msSince(start) < 2000) {
    t = nowNs();
    const screen = await bm.memGet(0x0400, 0x0400 + 999);
    logTiming(scope, "bm_read_screen", t, timings);
    const idx = screen.indexOf(hello);
    if (idx >= 0) {
      console.log(`[✓] Autostart: HELLO found at row ${Math.floor(idx / 40)}, col ${idx % 40}`);
      found = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  logTiming(scope, "wait_hello", start, timings);
  bm.close();

  const tEnd = nowNs();
  proc.kill("SIGTERM");
  setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} }, 500);
  logTiming(scope, "cleanup_vice", tEnd, timings);
}

async function main() {
  const timings: Timing[] = [];
  // Xvfb (optional)
  const { proc: xvfb } = spawnXvfbIfNeeded(timings, "bench");
  if (xvfb) process.env.DISPLAY = DISPLAY;

  // Injection instance
  const argsInj = buildViceArgsForPort(PORT_INJECT);
  const inj = spawnVice(argsInj, timings, "injection");
  try {
    await runInjectionFlow(timings);
  } finally {
    if (!KEEP_OPEN) {
      const t = nowNs();
      inj.kill("SIGTERM");
      setTimeout(() => { try { inj.kill("SIGKILL"); } catch {} }, 500);
      logTiming("injection", "cleanup_vice", t, timings);
    }
  }

  // Autostart instance (skip when focusing on visible single-instance demos)
  if (!KEEP_OPEN) {
    await runAutostartFlow(timings);
  }

  if (xvfb) {
    const t = nowNs();
    xvfb.kill("SIGTERM");
    logTiming("bench", "cleanup_xvfb", t, timings);
  }

  console.log("[timings]");
  for (const t of timings) console.log(`[timing] ${t.scope}.${t.label} ${t.ms}ms`);

  if (KEEP_OPEN) {
    console.log("[info] VICE_KEEP_OPEN=1 set — keeping the injection VICE window open. Close it manually to end.");
    // Keep the Node process alive to avoid killing the child when this script exits
    // eslint-disable-next-line no-constant-condition
    while (true) await new Promise((r) => setTimeout(r, 1000));
  }
}

main().catch((err) => {
  console.error("[!] Error:", err);
  process.exit(1);
});
