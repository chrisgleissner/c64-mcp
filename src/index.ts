#!/usr/bin/env node
/**
 * MCP server entry point used by the CLI launcher and npm package main field.
 * This thin wrapper delegates to the real implementation in mcp-server.ts.
 */
import "./bootstrap/stdio-logger.js";
import "./mcp-server.js";
