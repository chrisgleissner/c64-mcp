/*
C64 MCP - URL/domain utilities
GPL-2.0-only
*/

import { URL } from 'node:url';

export interface DomainMatch {
  /** e.g., example.co.uk */
  registeredDomain: string;
  /** full hostname */
  host: string;
}

/**
 * Very small public-suffix-like heuristic to derive the registered domain.
 * Avoids extra deps; not perfect but works for common TLDs.
 */
export function getRegisteredDomain(hostname: string): string {
  const parts = hostname.toLowerCase().split('.');
  if (parts.length <= 2) return hostname.toLowerCase();
  const tld = parts.slice(-2).join('.');
  // Handle some common multi-part TLDs
  const multi = new Set([
    'co.uk','ac.uk','gov.uk','org.uk','co.jp','com.au','net.au','org.au',
  ]);
  if (multi.has(parts.slice(-3).join('.'))) {
    return parts.slice(-3).join('.');
  }
  return tld;
}

export function parseUrlSafe(input: string): URL | null {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

export function sameRegisteredDomain(a: string, b: string): boolean {
  const ua = parseUrlSafe(a);
  const ub = parseUrlSafe(b);
  if (!ua || !ub) return false;
  return getRegisteredDomain(ua.hostname) === getRegisteredDomain(ub.hostname);
}
