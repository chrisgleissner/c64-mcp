/*
C64 Bridge - An MCP Server for the Commodore 64 Ultimate
Copyright (C) 2025 Christian Gleissner

Licensed under the GNU General Public License v2.0 or later.
See <https://www.gnu.org/licenses/> for details.
*/

import { createHash } from "node:crypto";
import type { C64Client } from "../c64Client.js";
import type { ToolLogger } from "./types.js";

/**
 * Configuration for polling behavior.
 */
export interface PollConfig {
  /** Maximum duration (in milliseconds) to continue polling after RUN appears */
  maxMs: number;
  /** Interval (in milliseconds) between consecutive screen polls */
  intervalMs: number;
}

/**
 * Result of BASIC program polling.
 */
export interface BasicPollResult {
  status: "ok" | "error";
  type: "BASIC";
  message?: string;
  line?: number;
}

/**
 * Result of Assembly program polling.
 */
export interface AsmPollResult {
  status: "ok" | "crashed";
  type: "ASM";
  reason?: string;
}

export type PollResult = BasicPollResult | AsmPollResult;

/**
 * Load poll configuration from environment variables with defaults.
 */
export function loadPollConfig(): PollConfig {
  // In test environments with mock target, use shorter timeouts to avoid interfering with test screen queues
  const isTestMode = process.env.C64_TEST_TARGET === "mock" || process.env.NODE_ENV === "test";
  const defaultMaxMs = isTestMode ? 100 : 2000;
  const defaultIntervalMs = isTestMode ? 30 : 200;
  
  const maxMs = parseInt(process.env.C64BRIDGE_POLL_MAX_MS ?? String(defaultMaxMs), 10);
  const intervalMs = parseInt(process.env.C64BRIDGE_POLL_INTERVAL_MS ?? String(defaultIntervalMs), 10);

  return {
    maxMs: Number.isFinite(maxMs) && maxMs > 0 ? maxMs : defaultMaxMs,
    intervalMs: Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : defaultIntervalMs,
  };
}

/**
 * Wait for a specified duration.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Compute SHA-1 hash of screen content for change detection.
 */
function computeScreenHash(screen: string): string {
  return createHash("sha1").update(screen).digest("hex");
}

/**
 * Extract BASIC error information from screen text.
 * Looks for patterns like "?SYNTAX ERROR" or "SYNTAX ERROR IN 120".
 */
function extractBasicError(screen: string): { message?: string; line?: number } | null {
  const upperScreen = screen.toUpperCase();
  
  // Check if ERROR appears on screen
  if (!upperScreen.includes("ERROR")) {
    return null;
  }
  
  // Try to match "?ERROR_TYPE ERROR" or "ERROR_TYPE ERROR IN LINE"
  const errorMatch = /\?([A-Z\s]+)\s+ERROR(?:\s+IN\s+(\d+))?/i.exec(screen);
  
  if (errorMatch) {
    const errorType = errorMatch[1]?.trim().replace(/\s+/g, " ");
    const lineStr = errorMatch[2];
    const line = lineStr ? parseInt(lineStr, 10) : undefined;
    
    return {
      message: errorType,
      line: Number.isFinite(line) ? line : undefined,
    };
  }
  
  // Fallback: just "ERROR" appears
  return { message: "UNKNOWN ERROR" };
}

/**
 * Poll for BASIC program outcome by detecting errors on screen.
 * First waits for RUN or ERROR to appear, then continues polling for errors.
 */
async function pollBasicOutcome(
  client: C64Client,
  logger: ToolLogger,
  config: PollConfig,
): Promise<BasicPollResult> {
  const startTime = Date.now();
  let pollCount = 0;
  let runDetected = false;
  
  logger.debug("Starting BASIC outcome polling", { maxMs: config.maxMs, intervalMs: config.intervalMs });
  
  while (Date.now() - startTime < config.maxMs) {
    pollCount++;
    
    try {
      const screen = await client.readScreen();
      const upperScreen = screen.toUpperCase();
      
      // Check if RUN or ERROR appeared (indicating execution started or failed)
      if (!runDetected && (upperScreen.includes("RUN") || upperScreen.includes("ERROR"))) {
        runDetected = true;
        logger.debug("Program execution detected", { pollCount, elapsed: Date.now() - startTime });
      }
      
      // Check for errors
      const errorInfo = extractBasicError(screen);
      
      if (errorInfo) {
        logger.debug("BASIC error detected", { errorInfo, pollCount, elapsed: Date.now() - startTime });
        return {
          status: "error",
          type: "BASIC",
          message: errorInfo.message,
          line: errorInfo.line,
        };
      }
      
      // If we detected RUN and no error yet, continue polling
      if (runDetected) {
        // Continue polling for a bit to catch any delayed errors
        // but if we've been polling for a while without errors, consider it successful
      }
    } catch (error) {
      logger.debug("Failed to read screen during BASIC polling", { error, pollCount });
    }
    
    await delay(config.intervalMs);
  }
  
  logger.debug("BASIC polling completed without errors", { pollCount, elapsed: Date.now() - startTime });
  
  return {
    status: "ok",
    type: "BASIC",
  };
}

/**
 * Poll for Assembly program outcome by detecting screen changes.
 * First waits for RUN to appear, then monitors for screen changes.
 */
async function pollAsmOutcome(
  client: C64Client,
  logger: ToolLogger,
  config: PollConfig,
): Promise<AsmPollResult> {
  const startTime = Date.now();
  let pollCount = 0;
  let runDetected = false;
  
  logger.debug("Starting ASM outcome polling", { maxMs: config.maxMs, intervalMs: config.intervalMs });
  
  // Capture initial screen hash
  let initialHash: string | null = null;
  
  while (Date.now() - startTime < config.maxMs) {
    pollCount++;
    
    try {
      const screen = await client.readScreen();
      const currentHash = computeScreenHash(screen);
      const upperScreen = screen.toUpperCase();
      
      // Check if RUN appeared (indicating execution started)
      if (!runDetected && upperScreen.includes("RUN")) {
        runDetected = true;
        initialHash = currentHash;
        logger.debug("RUN detected, initial screen hash captured", { hash: initialHash, pollCount });
        continue; // Continue to next iteration
      }
      
      // If we haven't detected RUN yet but see screen content, capture it as initial
      if (!runDetected && !initialHash) {
        initialHash = currentHash;
      }
      
      // Once RUN is detected, check for screen changes
      if (runDetected && initialHash && currentHash !== initialHash) {
        logger.debug("ASM screen change detected", { 
          initialHash, 
          currentHash, 
          pollCount, 
          elapsed: Date.now() - startTime 
        });
        return {
          status: "ok",
          type: "ASM",
        };
      }
    } catch (error) {
      logger.debug("Failed to read screen during ASM polling", { error, pollCount });
    }
    
    await delay(config.intervalMs);
  }
  
  logger.debug("ASM polling timeout", { pollCount, elapsed: Date.now() - startTime, runDetected });
  
  // If RUN was never detected, assume program executed instantly (success)
  if (!runDetected) {
    logger.debug("RUN never detected, assuming instant execution");
    return {
      status: "ok",
      type: "ASM",
    };
  }
  
  // If RUN was detected but no screen change, consider it crashed
  logger.debug("ASM screen unchanged after RUN detection");
  return {
    status: "crashed",
    type: "ASM",
    reason: "no screen change detected",
  };
}

/**
 * Main polling function that polls for program outcome.
 * 
 * @param type - Type of program (BASIC or ASM)
 * @param client - C64 client for screen reading
 * @param logger - Logger for debug output
 * @param config - Optional poll configuration (uses environment defaults if not provided)
 * @returns Promise resolving to poll result
 */
export async function pollForProgramOutcome(
  type: "BASIC" | "ASM",
  client: C64Client,
  logger: ToolLogger,
  config?: PollConfig,
): Promise<PollResult> {
  const pollConfig = config ?? loadPollConfig();
  
  logger.debug("Starting program outcome polling", { type, maxMs: pollConfig.maxMs, intervalMs: pollConfig.intervalMs });
  
  // Poll for program outcome based on type
  if (type === "BASIC") {
    return pollBasicOutcome(client, logger, pollConfig);
  }
  
  return pollAsmOutcome(client, logger, pollConfig);
}
