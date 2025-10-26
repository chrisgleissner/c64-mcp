# C64-MCP: Migration to Official TypeScript MCP SDK

You are tasked with migrating the c64-mcp project from its custom HTTP-based MCP implementation to the official @modelcontextprotocol/sdk TypeScript implementation, see <https://github.com/modelcontextprotocol/typescript-sdk>.

This migration MUST be done incrementally with strict progress tracking.

## 🚨 CRITICAL RULES

1. **NEVER skip progress tracking** - Update MIGRATION-PROGRESS.md after EVERY step
2. **ONE step at a time** - Do not proceed to next step until current is ✅ checked
3. **Test after each step** - Verify nothing breaks before continuing
4. **Preserve functionality** - All existing tools must work after migration
5. **No manifest files** - The SDK uses dynamic discovery, remove mcp-manifest.json

## Guiding Objectives

- Build a single MCP server surface that presents C64 capabilities through cohesive, domain-focused modules (machine control, media, storage, graphics, knowledge, developer tooling).
- Model each tool with clear intent, strict parameter typing, informative descriptions, and rich examples so LLM clients can select the right capability without guesswork.
- Proactively enrich the LLM session with curated C64 knowledge, workflow rules, and starter prompts so it can assist users without manual searching.
- Maximize maintainability by centralizing shared behaviours: authentication, transport, error handling, logging, and compatibility helpers for the Ultimate hardware REST API.
- Keep the migration auditable: every addition must have automated verification and be reflected in the progress tracker and changelog.
- Establish MCP platform awareness so clients know whether C64U or VICE is active: provide a `c64://platform/status` resource, per-tool backend validation, and (optionally) a capabilities lookup. (Hot swapping via a `set_platform` tool is a future enhancement.)
- MCP Platform Awareness — LLM Instructions:
  1. Expose the active platform via a `platform` resource returning `{ "target": "C64U", "features": [...], "limited_features": [...] }`.
  2. *Future:* Allow switching between platforms with a `set_platform` tool accepting `{ "target": "c64u" | "vice" }` once the runtime can hot swap safely.
  3. Update prompts/workflow guidance to reference the platform status resource when advising users.
  4. Each tool checks the platform in `execute()` and throws `unsupported_platform` when incompatible.
  5. Optionally provide a `capabilities` resource that lists available tools per platform.

---

## STEP 0: CREATE PROGRESS TRACKER (DO THIS FIRST!)

Create `MIGRATION-PROGRESS.md` at repository root:

```markdown
# C64-MCP Migration Progress

**Started:** [DATE]
**Current Step:** 0
**Last Updated:** [TIMESTAMP]

---

## Migration Checklist

### Phase 1: Dependencies & Structure
- [ ] 0.1 - Install @modelcontextprotocol/sdk
- [ ] 0.2 - Create src/mcp-server.ts skeleton
- [ ] 0.3 - Update package.json scripts
- [ ] 0.4 - Verify dependencies install cleanly

### Phase 2: Core MCP Server Setup
- [ ] 1.1 - Initialize MCP Server instance
- [ ] 1.2 - Set up stdio transport
- [ ] 1.3 - Add basic server info handler
- [ ] 1.4 - Test server starts without errors

### Phase 3: Resources Implementation
- [ ] 2.1 - Implement ListResourcesRequestSchema handler
- [ ] 2.2 - Implement ReadResourceRequestSchema handler
- [ ] 2.3 - Add c64://specs/basic resource
- [ ] 2.4 - Add c64://specs/assembly resource
- [ ] 2.5 - Add c64://specs/sid resource
- [ ] 2.6 - Add c64://specs/vic resource
- [ ] 2.7 - Add c64://context/bootstrap resource
- [ ] 2.8 - Add c64://specs/printer resource
- [ ] 2.9 - Add c64://docs/sid/file-structure resource
- [ ] 2.10 - Add c64://docs/printer/guide resource
- [ ] 2.11 - Add c64://docs/printer/commodore-text resource
- [ ] 2.12 - Add c64://docs/printer/commodore-bitmap resource
- [ ] 2.13 - Add c64://docs/printer/epson-text resource
- [ ] 2.14 - Add c64://docs/printer/epson-bitmap resource
- [ ] 2.15 - Add c64://docs/printer/prompts resource
- [ ] 2.16 - Validate resources via automated tests
- [ ] 2.17 - Create consolidated knowledge bundles & index resource metadata

### Phase 4: Tools Migration (Critical)
- [ ] 3.1 - Design domain-specific tool modules & lifecycle hooks
- [ ] 3.2 - Implement centralized tool registry with enriched metadata
- [x] 3.3 - Define shared parameter/result schemas & error helpers
- [x] 3.4 - Implement ListToolsRequestSchema handler
- [x] 3.5 - Implement CallToolRequestSchema handler
- [x] 3.6 - Migrate upload_and_run_basic tool
- [x] 3.7 - Migrate upload_and_run_asm tool
- [x] 3.8 - Migrate read_screen tool
- [x] 3.9 - Migrate read_memory tool
- [x] 3.10 - Migrate write_memory tool
- [x] 3.11 - Migrate SID control tools (sid_note_on, sid_volume, etc.)
- [x] 3.12 - Migrate machine control & diagnostics tools
- [x] 3.13 - Migrate drive and disk-management tools
- [x] 3.14 - Migrate SID playback and audio analysis tools
- [x] 3.15 - Migrate graphics and PETSCII tools
- [x] 3.16 - Migrate printer workflow tools
- [x] 3.17 - Migrate RAG retrieval tools
- [x] 3.18 - Migrate program loaders & file utilities
- [x] 3.19 - Migrate configuration management tools
- [x] 3.20 - Migrate debug & developer tools
- [x] 3.21 - Migrate streaming tools
- [x] 3.22 - Test each tool works via MCP protocol

### Phase 5: Prompts Implementation
- [ ] 4.1 - Design prompt taxonomy & default context injection
- [x] 4.2 - Implement ListPromptsRequestSchema handler
- [x] 4.3 - Implement GetPromptRequestSchema handler
- [x] 4.4 - Create "basic-program" prompt
- [x] 4.5 - Create "assembly-program" prompt
- [x] 4.6 - Create "sid-music" prompt
- [x] 4.7 - Create "graphics-demo" prompt
- [x] 4.8 - Add "printer-job" and "memory-debug" prompts
- [x] 4.9 - Test prompts work with automated checks

### Phase 6: Enhanced Tool Descriptions
- [x] 5.1 - Add workflow hints to tool descriptions
- [x] 5.2 - Implement MCP platform awareness (platform resource, per-tool backend guards, optional capabilities listing; `set_platform` tool tracked for future hot swapping)
- [ ] 5.3 - Add prerequisite tool references
- [ ] 5.4 - Add examples to tool schemas
- [ ] 5.5 - Ensure tools reference resources in descriptions

### Phase 7: Testing & Validation
- [ ] 6.1 - Add automated integration tests for tools
- [ ] 6.2 - Add automated integration tests for resources
- [ ] 6.3 - Add automated integration tests for prompts
- [ ] 6.4 - Add regression tests for common error scenarios
- [ ] 6.5 - Ensure test suite runs in CI
- [ ] 6.6 - Capture test coverage report


### Phase 8: Cleanup
- [x] 7.1 - Remove src/mcpDecorators.ts
- [x] 7.2 - Remove scripts/generate-manifest.mjs
- [x] 7.3 - Remove mcp-manifest.json
- [x] 7.4 - Remove toolsCatalog.ts (if no longer needed)
- [ ] 7.5 - Update README.md with new setup instructions
- [ ] 7.6 - Update .vscode/settings.json
- [x] 7.7 - Archive old HTTP server to src/http-server.ts.backup

### Phase 9: Documentation
- [x] 8.1 - Document new architecture in doc/developer.md
- [x] 8.2 - Create MCP_SETUP.md guide
- [x] 8.3 - Update AGENTS.md if needed
- [x] 8.4 - Add troubleshooting section

---

## Notes & Issues

[Document any issues, decisions, or important notes here as you progress]

---

## Session Log

### Session 1 - [DATE]
- Started at step: X
- Completed steps: X.X, X.X
- Ended at step: X
- Issues encountered: [none/list]

### Session 2 - [DATE]
[Continue logging each work session]
```

**Save this file now. Do not proceed until MIGRATION-PROGRESS.md exists.**

---

## PHASE 1: DEPENDENCIES & STRUCTURE

### Step 0.1: Install Official MCP SDK

**Action:** Install the SDK and required types:

```bash
npm install @modelcontextprotocol/sdk
npm install --save-dev @types/node
```

**Verify:**

```bash
npm list @modelcontextprotocol/sdk
# Should show version 0.5.0 or higher
```

**Update MIGRATION-PROGRESS.md:**

```markdown
- [x] 0.1 - Install @modelcontextprotocol/sdk
```

Do NOT proceed to 0.2 until 0.1 is checked ✅

---

### Step 0.2: Create MCP Server Skeleton

**Action:** Create `src/mcp-server.ts`:

```typescript
#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./config.js";
import { C64Client } from "./c64Client.js";

async function main() {
  console.error("Starting c64-mcp MCP server...");

  const config = loadConfig();
  const baseUrl = config.baseUrl ?? `http://${config.c64_host}`;
  
  // Initialize C64 client (reuse existing)
  const client = new C64Client(baseUrl);

  // Create MCP server
  const server = new Server(
    {
      name: "c64-mcp",
      version: "0.3.0",
    },
    {
      capabilities: {
        resources: {},
        tools: {},
        prompts: {},
      },
    }
  );

  // TODO: Add handlers in subsequent steps

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error("c64-mcp MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in MCP server:", error);
  process.exit(1);
});
```

**Update MIGRATION-PROGRESS.md:**

```markdown
- [x] 0.1 - Install @modelcontextprotocol/sdk
- [x] 0.2 - Create src/mcp-server.ts skeleton
```

Do NOT proceed to 0.3 until 0.2 is checked ✅

---

### Step 0.3: Update package.json Scripts

**Action:** Update `package.json` to add MCP server command:

```json
{
  "scripts": {
    "start": "node scripts/start.mjs",
    "mcp": "node --loader ts-node/esm src/mcp-server.ts",
    "mcp:build": "npm run build && node dist/mcp-server.js",
    "build": "tsc && npm run manifest",
    "test": "echo 'Tests TBD'",
    "manifest": "node scripts/generate-manifest.mjs"
  }
}
```

**Verify:**

```bash
npm run mcp
# Should start server, output: "c64-mcp MCP server running on stdio"
# Press Ctrl+C to stop
```

**Update MIGRATION-PROGRESS.md:**

```markdown
- [x] 0.3 - Update package.json scripts
```

---

### Step 0.4: Verify Clean State

**Action:** Run a full build to ensure no TypeScript errors:

```bash
npm run build
```

**Expected:** No TypeScript errors. Warnings are OK for now.

**Update MIGRATION-PROGRESS.md:**

```markdown
- [x] 0.4 - Verify dependencies install cleanly

### Phase 1: Dependencies & Structure - COMPLETE ✅
```

**STOP HERE. Review progress. Commit changes. Continue in next step.**

---

## PHASE 2: CORE MCP SERVER SETUP

### Step 1.1: Initialize MCP Server Instance

**Status:** Already done in Step 0.2

**Update MIGRATION-PROGRESS.md:**

```markdown
- [x] 1.1 - Initialize MCP Server instance
```

---

### Step 1.2: Set Up Stdio Transport

**Status:** Already done in Step 0.2

**Update MIGRATION-PROGRESS.md:**

```markdown
- [x] 1.2 - Set up stdio transport
```

---

### Step 1.3: Add Basic Server Info Handler

**Action:** The SDK automatically handles server info. No action needed.

**Update MIGRATION-PROGRESS.md:**

```markdown
- [x] 1.3 - Add basic server info handler
```

---

### Step 1.4: Test Server Starts

**Action:** Test the server works:

```bash
npm run mcp
```

**Expected Output:**

```text
Starting c64-mcp MCP server...
c64-mcp MCP server running on stdio
```

**Update MIGRATION-PROGRESS.md:**

```markdown
- [x] 1.4 - Test server starts without errors

### Phase 2: Core MCP Server Setup - COMPLETE ✅
```

---

## PHASE 3: RESOURCES IMPLEMENTATION

### Step 2.1: Implement ListResourcesRequestSchema Handler

**Action:** Add to `src/mcp-server.ts` after server creation:

```typescript
// Add after: const server = new Server(...)

// RESOURCES: Expose C64 knowledge base
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "c64://context/bootstrap",
        name: "Workflow Rules & Best Practices",
        description: "CRITICAL: Mandatory workflow rules for all C64 programming",
        mimeType: "text/markdown",
      },
      {
        uri: "c64://specs/basic",
        name: "Commodore BASIC v2 Specification",
        description: "Complete BASIC v2 reference. READ THIS BEFORE generating any BASIC code!",
        mimeType: "text/markdown",
      },
      {
        uri: "c64://specs/assembly",
        name: "6502/6510 Assembly Reference",
        description: "Full instruction set and addressing modes. READ THIS BEFORE generating assembly!",
        mimeType: "text/markdown",
      },
      {
        uri: "c64://specs/sid",
        name: "SID Chip Programming Guide",
        description: "Sound Interface Device registers and music programming",
        mimeType: "text/markdown",
      },
      {
        uri: "c64://specs/sidwave",
        name: "SIDWAVE Music Format Specification",
        description: "YAML/JSON music composition format for SID chip",
        mimeType: "text/markdown",
      },
      {
        uri: "c64://specs/vic",
        name: "VIC-II Graphics Specification",
        description: "Video chip, sprites, raster programming, and timing",
        mimeType: "text/markdown",
      },
      {
        uri: "c64://specs/printer",
        name: "Printer Programming Guide",
        description: "Commodore MPS and Epson FX printer control",
        mimeType: "text/markdown",
      },
      {
        uri: "c64://docs/sid/file-structure",
        name: "SID File Structure Reference",
        description: "Breakdown of the SID file format layout and metadata",
        mimeType: "text/markdown",
      },
      {
        uri: "c64://docs/printer/guide",
        name: "Printer Workflow Guide",
        description: "Unified quick reference for Commodore and Epson printers",
        mimeType: "text/markdown",
      },
      {
        uri: "c64://docs/printer/commodore-text",
        name: "Commodore Printer Text Guide",
        description: "Device 4 character printing reference for Commodore MPS printers",
        mimeType: "text/markdown",
      },
      {
        uri: "c64://docs/printer/commodore-bitmap",
        name: "Commodore Printer Bitmap Guide",
        description: "Bitmap and custom character printing workflow for Commodore printers",
        mimeType: "text/markdown",
      },
      {
        uri: "c64://docs/printer/epson-text",
        name: "Epson Printer Text Guide",
        description: "Text control sequences for Epson FX-compatible printers",
        mimeType: "text/markdown",
      },
      {
        uri: "c64://docs/printer/epson-bitmap",
        name: "Epson Printer Bitmap Guide",
        description: "Bitmap printing and graphics control for Epson FX printers",
        mimeType: "text/markdown",
      },
      {
        uri: "c64://docs/printer/prompts",
        name: "Printer Prompt Templates",
        description: "Template prompts and workflow guidance for printer jobs",
        mimeType: "text/markdown",
      },
      // Add c64://docs/index in Step 2.17 once the knowledge bundle is generated.
    ],
  };
});
```

**Update MIGRATION-PROGRESS.md:**

```markdown
- [x] 2.1 - Implement ListResourcesRequestSchema handler
```

---

### Step 2.2: Implement ReadResourceRequestSchema Handler

**Action:** Add to `src/mcp-server.ts`:

```typescript
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "..");

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;

  const resourceMap: Record<string, string> = {
    "c64://context/bootstrap": "data/context/bootstrap.md",
    "c64://specs/basic": "data/basic/basic-spec.md",
    "c64://specs/assembly": "data/assembly/assembly-spec.md",
    "c64://specs/sid": "data/audio/sid-spec.md",
    "c64://specs/sidwave": "data/audio/sidwave.md",
    "c64://specs/vic": "data/video/vic-spec.md",
    "c64://specs/printer": "data/printer/printer-spec.md",
    "c64://docs/sid/file-structure": "data/audio/sid-file-structure.md",
    "c64://docs/printer/guide": "data/printer/printer-spec.md",
    "c64://docs/printer/commodore-text": "data/printer/printer-commodore.md",
    "c64://docs/printer/commodore-bitmap": "data/printer/printer-commodore-bitmap.md",
    "c64://docs/printer/epson-text": "data/printer/printer-epson.md",
    "c64://docs/printer/epson-bitmap": "data/printer/printer-epson-bitmap.md",
    "c64://docs/printer/prompts": "data/printer/printer-prompts.md",
    // Add "c64://docs/index": "generated/knowledge-index.md" in Step 2.17 when the bundle is created.
  };

  const filePath = resourceMap[uri];
  if (!filePath) {
    throw new Error(`Unknown resource: ${uri}`);
  }

  const fullPath = join(PROJECT_ROOT, filePath);
  const content = readFileSync(fullPath, "utf-8");

  return {
    contents: [
      {
        uri,
        mimeType: "text/markdown",
        text: content,
      },
    ],
  };
```

**Update MIGRATION-PROGRESS.md:**

```markdown
- [x] 2.2 - Implement ReadResourceRequestSchema handler
```

---

### Step 2.3-2.7: Verify Individual Resources Automatically

**Action:** Add automated TypeScript tests (under `test/`) that start the built MCP server, issue `ListResources` and `ReadResource` requests, and assert that each URI above returns non-empty markdown content. Reuse the helper infrastructure from existing tests (mock server, config loaders, etc.) and ensure the tests run with `npm test`.

**Expected:** Tests cover:

- `c64://specs/basic`
- `c64://specs/assembly`
- `c64://specs/sid`
- `c64://specs/vic`
- `c64://specs/printer`
- `c64://context/bootstrap`
- `c64://specs/sidwave`
- `c64://docs/sid/file-structure`
- `c64://docs/printer/guide`
- `c64://docs/printer/commodore-text`
- `c64://docs/printer/commodore-bitmap`
- `c64://docs/printer/epson-text`
- `c64://docs/printer/epson-bitmap`
- `c64://docs/printer/prompts`
- (After Step 2.17) `c64://docs/index`

**Update MIGRATION-PROGRESS.md:**

```markdown
- [x] 2.3 - Add c64://specs/basic resource
- [x] 2.4 - Add c64://specs/assembly resource
- [x] 2.5 - Add c64://specs/sid resource
- [x] 2.6 - Add c64://specs/vic resource
- [x] 2.7 - Add c64://context/bootstrap resource
```

---

### Step 2.8: Test Resource Reading

**Action:** Ensure the new resource tests run in CI by executing `npm test` locally and confirming the suite passes.

**Update MIGRATION-PROGRESS.md:**

```markdown
- [x] 2.8 - Validate resources via automated tests
```

**STOP HERE. Commit changes. Review. Continue in next phase.**

### Step 2.17: Create Knowledge Bundles & Index Metadata

**Action:** Elevate the resource surface so LLM clients gain immediate awareness of what to read and when.

- Create a `knowledgeBundles` module (for example `src/rag/knowledgeIndex.ts`) that groups resources by domain: workflow rules, language specs, audio, graphics, peripherals, troubleshooting.
- Update the ListResources handler to attach `metadata` for each item (e.g., `{ domain: "audio", priority: "critical", prompts: ["sid-music"], summary: "..." }`). Use this to signal reading order and related tools/prompts.
- Add an aggregated `c64://docs/index` resource generated from the bundle that explains how to approach the C64, linking to every URI with short summaries.
- Ensure the new index references printer docs, SID references, and any future guides so an LLM can ingest one resource and understand the ecosystem.
- Extend resource tests to assert metadata presence and verify the index renders all URIs.

**Update MIGRATION-PROGRESS.md:**

```markdown
- [x] 2.17 - Create consolidated knowledge bundles & index resource metadata

### Phase 3: Resources Implementation - COMPLETE ✅
```

**STOP HERE. Commit changes. Review. Continue in next phase.**

---

## PHASE 4: TOOLS MIGRATION (CRITICAL)

Before writing any handlers, design the tool surface so it is maintainable and easy for an LLM to reason about.

### Step 3.1: Design Domain-Specific Tool Modules & Lifecycle Hooks

**Action:** Shape the new MCP server around cohesive tool domains.

- Create dedicated modules under `src/tools/` (for example `machineControl.ts`, `storage.ts`, `audio.ts`, `graphics.ts`, `printer.ts`, `rag.ts`, `developer.ts`). Each module should export a typed interface describing its tools and provide lifecycle helpers that translate between MCP calls and the existing `C64Client` methods.
- Ensure every module exposes `describeTools()` (metadata for ListTools) and `callTool()` (invocation) so the registry can delegate cleanly.
- Capture pre/post hooks for instrumentation (logging request payloads, timing REST API calls) inside the modules rather than scattering across the switch statement.
- Document the mapping from legacy decorator-based tools to the new module structure inside the module or a shared manifest so future contributors understand the migration.

**Update MIGRATION-PROGRESS.md:**

```markdown
- [x] 3.1 - Design domain-specific tool modules & lifecycle hooks
```

---

### Step 3.2: Implement Centralized Tool Registry with Enriched Metadata

**Action:** Introduce a single registry that wires the modules into the MCP SDK.

- Create `src/tools/registry.ts` that imports every domain module and aggregates their `describeTools()` output.
- Add derived metadata for each tool: `domain`, `requires`, `relatedResources`, `relatedPrompts`, `returns`, and `safety`. Use this to enrich `ListTools` responses so an LLM can pick the right capability quickly.
- Ensure registry enforces unique tool names and provides a lookup map for fast `CallTool` routing.
- Provide helper functions to generate examples/snippets so the metadata stays centralized rather than duplicated in handlers.

**Update MIGRATION-PROGRESS.md:**

```markdown
- [x] 3.2 - Implement centralized tool registry with enriched metadata
```

---

### Step 3.3: Define Shared Parameter/Result Schemas & Error Helpers

**Action:** Standardize the way inputs and outputs are validated.

- Introduce a lightweight schema layer (Zod or custom validators) that each tool reuses to validate parameters before calling the Ultimate REST API.
- Add shared result helpers that wrap successful responses in consistent MCP content payloads (plain text for human-readable responses, structured JSON when appropriate).
- Centralize error translation so REST failures become descriptive MCP errors with actionable remediation steps for the LLM.
- Update domain modules to leverage these helpers; include unit tests for validation and error handling edge cases.

**Update MIGRATION-PROGRESS.md:**

```markdown
- [x] 3.3 - Define shared parameter/result schemas & error helpers
```

---

### Step 3.4: Implement ListToolsRequestSchema Handler

**Action:** Add comprehensive tool list to `src/mcp-server.ts`:

```typescript
import { toolRegistry } from "./tools/registry.js";

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: toolRegistry.list(),
  };
});
```

Ensure each registry entry includes:

- Rich descriptions that reference prerequisite resources/prompts.
- Examples payloads in `metadata.examples` for LLM fine-tuning.
- Safety guidance (e.g., warns when tool is destructive) and recommended verification steps.

**Update MIGRATION-PROGRESS.md:**

```markdown
- [x] 3.4 - Implement ListToolsRequestSchema handler
```

---

### Step 3.5: Implement CallToolRequestSchema Handler

**Action:** Add tool routing logic:

```typescript
import { toolRegistry } from "./tools/registry.js";

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return await toolRegistry.invoke(name, args ?? {}, {
    client,
    logger,
  });
});
```

`toolRegistry.invoke` should:

- Validate arguments using the shared schemas before touching hardware.
- Inject workflow metadata into errors so the LLM knows which resource/prompt to consult.
- Emit structured logs (tool name, duration, C64 REST endpoints hit) so failures are traceable.

**Update MIGRATION-PROGRESS.md:**

```markdown
- [x] 3.5 - Implement CallToolRequestSchema handler
```

---

### Steps 3.6-3.22: Migrate Remaining Tools

**For each tool category:**

1. Add to ListToolsRequestSchema return
2. Add case to CallToolRequestSchema switch
3. Test tool works
4. Check off in MIGRATION-PROGRESS.md

**Tool Categories to Migrate:**

```typescript
// audio.ts
export const audioTools = defineDomainTools("audio", [
  tool({
    name: "sid_note_on",
    description: "Trigger a SID voice at a specific frequency with ADSR envelope",
    schema: sidNoteSchema,
    run: async (input, ctx) => ctx.client.sid.noteOn(input),
  }),
  tool({ name: "music_generate", description: "...", run: musicGenerate }),
  // ...
]);

// machineControl.ts
export const machineControlTools = defineDomainTools("machine", [
  tool({ name: "reset_c64", run: ({ mode }, ctx) => ctx.client.reset(mode) }),
  tool({ name: "info", run: async (_, ctx) => ctx.client.info() }),
  // ...
]);

// storage.ts
export const storageTools = defineDomainTools("storage", [
  tool({ name: "drive_mount", run: driveMount }),
  tool({ name: "create_d64", run: createDiskImage }),
  // ...
]);

// Continue for printer, graphics, rag, developer, streaming domains.

toolRegistry.register(audioTools, machineControlTools, storageTools, /* ... */);
```

**Update MIGRATION-PROGRESS.md after EACH tool:**

```markdown
- [x] 3.6 - Migrate upload_and_run_basic tool
- [x] 3.7 - Migrate upload_and_run_asm tool
[continue for all 70+ tools]
```

**CRITICAL: Do NOT mark Phase 4 complete until ALL tools work!**

---

## PHASE 5: PROMPTS IMPLEMENTATION

### Step 4.1: Design Prompt Taxonomy & Default Context Injection

**Action:** Plan how prompts will teach the LLM about the hardware.

- Define prompt families that mirror the tool domains: BASIC agent, Assembly agent, SID composer, Graphics artist, Printer operator, Memory debugger, Drive manager.
- For each family, list the resources and tools that should be preloaded into the LLM context before it attempts a task.
- Decide on reusable prompt templates (`promptSegments`) that can be composed (e.g., intro workflow, verification checklist, error recovery hints).
- Capture these designs in `doc/prompts/README` (or similar) so future authors follow the same voice and safety guidance.

**Update MIGRATION-PROGRESS.md:** *(Completed on 2025-10-25 at step conclusion.)*

---

### Step 4.2: Implement ListPromptsRequestSchema Handler

**Action:** Add to `src/mcp-server.ts`:

```typescript
import { createPromptRegistry } from "./prompts/registry.js";

const promptRegistry = createPromptRegistry();

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: promptRegistry.list(),
  };
});
```

Each prompt description should highlight:

- Which tools/resources to consult before acting.
- Expected outputs and verification steps (e.g., "Compile, run, inspect screen").
- Safety notes that prevent destructive commands unless the user confirms intent.

**Update MIGRATION-PROGRESS.md:**

```markdown
- [x] 4.2 - Implement ListPromptsRequestSchema handler
```

---

### Step 4.3: Implement GetPromptRequestSchema Handler

**Action:** Delegate prompt resolution to the registry and surface reusable message templates.

```typescript
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return promptRegistry.resolve(name, args ?? {});
});
```

`promptRegistry.resolve` should:

- Merge the designed `promptSegments` (intro, checklist, verification) into final messages.
- Automatically inject references to required resources and tools.
- Support dynamic arguments (e.g., `hardware` flag for assembly prompt) without duplicating strings.
- Throw descriptive errors when a prompt is unknown or missing required arguments.

**Update MIGRATION-PROGRESS.md:**

```markdown
- [x] 4.3 - Implement GetPromptRequestSchema handler
```

### Steps 4.4-4.8: Author Prompt Packs

**Action:** Use the taxonomy from Step 4.1 to deliver high-signal prompts.

- `basic-program`: Focus on PETSCII nuances, line numbering, and mandatory post-run verification (read screen, check memory). Inject summaries from `c64://specs/basic` and `c64://context/bootstrap` via metadata.
- `assembly-program`: Provide branching segments depending on requested hardware (`sid`, `vic`, `cia`). Include register tables from resources and remind about zero-page usage and IRQ safety.
- `sid-music`: Reference `c64://specs/sid`, `c64://docs/sid/file-structure`, and audio best practices. Encourage use of `analyze_audio` tool for feedback loops.
- `graphics-demo`: Link to VIC-II docs, PETSCII resources, and sprite helpers. Highlight raster timing cautions.
- `printer-job` & `memory-debug`: Align with printer guides and memory map resources, describing safety checks (e.g., avoid clobbering important addresses).

For each prompt, add unit tests (or snapshot tests) asserting that the resolved prompt contains:

- Required workflow instructions.
- References to the correct resources and tools.
- Safety callouts tailored to the domain.

**Update MIGRATION-PROGRESS.md:**

```markdown
- [x] 4.4 - Create "basic-program" prompt
- [x] 4.5 - Create "assembly-program" prompt
- [x] 4.6 - Create "sid-music" prompt
- [x] 4.7 - Create "graphics-demo" prompt
- [x] 4.8 - Add "printer-job" and "memory-debug" prompts
- [x] 4.9 - Test prompts work with automated checks
```

---

## PHASE 6-9: TESTING, CLEANUP, DOCUMENTATION

[Continue with remaining phases following same pattern]

**Update MIGRATION-PROGRESS.md after each step.**

---

## VALIDATION CHECKPOINTS

After completing each phase, run:

```bash
# Build TypeScript output
npm run build

# Execute automated test suite (includes MCP interactions)
npm test

# Spot-check stdio launch
npm run mcp
```

**Do NOT proceed to next phase until current phase is ✅ complete!**

---

## FINAL DELIVERABLES

When ALL checkboxes are ✅:

1. ✅ `src/mcp-server.ts` - Complete MCP SDK implementation
2. ✅ All tools work via MCP protocol
3. ✅ All resources load correctly
4. ✅ Prompts execute successfully
5. ✅ Comprehensive automated tests cover resources, tools, and prompts
6. ✅ Old decorator system removed
7. ✅ `mcp-manifest.json` deleted
8. ✅ Documentation updated
9. ✅ `MIGRATION-PROGRESS.md` - Complete record

---

## SUCCESS CRITERIA

- [ ] Server starts without errors
- [ ] Automated tests exercise List/Call tools, resources, and prompts
- [ ] All 70+ tools callable via MCP
- [ ] All 7 resources readable
- [ ] All 3+ prompts work
- [ ] No broken functionality from before migration
- [ ] Old custom system completely removed

---

**Remember: Update MIGRATION-PROGRESS.md after EVERY step. Never skip ahead.**

---

### Optional Manual Verification (MCP Inspector)

If a human reviewer wants an additional manual check later, launch the MCP Inspector against the compiled server:

```bash
npx @modelcontextprotocol/inspector node dist/mcp-server.js
```

This step is optional and only for post-test spot checks.
