# C64-MCP: Migration to Official TypeScript MCP SDK

You are tasked with migrating the c64-mcp project from its custom HTTP-based MCP implementation to the official @modelcontextprotocol/sdk TypeScript implementation. This migration MUST be done incrementally with strict progress tracking.

## 🚨 CRITICAL RULES

1. **NEVER skip progress tracking** - Update MIGRATION-PROGRESS.md after EVERY step
2. **ONE step at a time** - Do not proceed to next step until current is ✅ checked
3. **Test after each step** - Verify nothing breaks before continuing
4. **Preserve functionality** - All existing tools must work after migration
5. **No manifest files** - The SDK uses dynamic discovery, remove mcp-manifest.json

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
- [ ] 2.8 - Test resource reading with MCP inspector

### Phase 4: Tools Migration (Critical)
- [ ] 3.1 - Implement ListToolsRequestSchema handler
- [ ] 3.2 - Implement CallToolRequestSchema handler
- [ ] 3.3 - Migrate upload_and_run_basic tool
- [ ] 3.4 - Migrate upload_and_run_asm tool
- [ ] 3.5 - Migrate read_screen tool
- [ ] 3.6 - Migrate read_memory tool
- [ ] 3.7 - Migrate write_memory tool
- [ ] 3.8 - Migrate SID control tools (sid_note_on, sid_volume, etc.)
- [ ] 3.9 - Migrate reset/reboot tools
- [ ] 3.10 - Migrate drive management tools
- [ ] 3.11 - Migrate music tools (music_compile_and_play, etc.)
- [ ] 3.12 - Migrate graphics tools (create_petscii_image, etc.)
- [ ] 3.13 - Test each tool works via MCP protocol

### Phase 5: Prompts Implementation
- [ ] 4.1 - Implement ListPromptsRequestSchema handler
- [ ] 4.2 - Implement GetPromptRequestSchema handler
- [ ] 4.3 - Create "basic-program" prompt
- [ ] 4.4 - Create "assembly-program" prompt
- [ ] 4.5 - Create "sid-music" prompt
- [ ] 4.6 - Create "graphics-demo" prompt
- [ ] 4.7 - Test prompts work

### Phase 6: Enhanced Tool Descriptions
- [ ] 5.1 - Add workflow hints to tool descriptions
- [ ] 5.2 - Add prerequisite tool references
- [ ] 5.3 - Add examples to tool schemas
- [ ] 5.4 - Ensure tools reference resources in descriptions

### Phase 7: Testing & Validation
- [ ] 6.1 - Test with MCP Inspector CLI
- [ ] 6.2 - Test with Claude Desktop
- [ ] 6.3 - Test with VS Code Copilot Chat
- [ ] 6.4 - Verify all 70+ tools work
- [ ] 6.5 - Verify resources load correctly
- [ ] 6.6 - Verify prompts execute properly

### Phase 8: Cleanup
- [ ] 7.1 - Remove src/mcpDecorators.ts
- [ ] 7.2 - Remove scripts/generate-manifest.mjs
- [ ] 7.3 - Remove mcp-manifest.json
- [ ] 7.4 - Remove toolsCatalog.ts (if no longer needed)
- [ ] 7.5 - Update README.md with new setup instructions
- [ ] 7.6 - Update .vscode/settings.json
- [ ] 7.7 - Archive old HTTP server to src/http-server.ts.backup

### Phase 9: Documentation
- [ ] 8.1 - Document new architecture in doc/developer.md
- [ ] 8.2 - Create MCP_SETUP.md guide
- [ ] 8.3 - Update AGENTS.md if needed
- [ ] 8.4 - Add troubleshooting section

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

**Do NOT proceed to 0.2 until 0.1 is checked ✅**

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

**Do NOT proceed to 0.3 until 0.2 is checked ✅**

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
```
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
        uri: "c64://context/bootstrap",
        name: "Workflow Rules & Best Practices",
        description: "CRITICAL: Mandatory workflow rules for all C64 programming",
        mimeType: "text/markdown",
      },
      {
        uri: "c64://specs/sidwave",
        name: "SIDWAVE Music Format Specification",
        description: "YAML/JSON music composition format for SID chip",
        mimeType: "text/markdown",
      },
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
    "c64://specs/basic": "data/basic/basic-spec.md",
    "c64://specs/assembly": "data/assembly/assembly-spec.md",
    "c64://specs/sid": "data/audio/sid-spec.md",
    "c64://specs/vic": "data/video/vic-spec.md",
    "c64://specs/printer": "data/printer/printer-spec.md",
    "c64://context/bootstrap": "data/context/bootstrap.md",
    "c64://specs/sidwave": "data/audio/sidwave.md",
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
});
```

**Update MIGRATION-PROGRESS.md:**
```markdown
- [x] 2.2 - Implement ReadResourceRequestSchema handler
```

---

### Step 2.3-2.7: Verify Individual Resources

**Action:** Test each resource loads:
```bash
# You'll need MCP Inspector for this - install if needed:
npm install -g @modelcontextprotocol/inspector

# Run server in inspector:
npx @modelcontextprotocol/inspector node dist/mcp-server.js

# In inspector UI, test reading each resource:
# - c64://specs/basic
# - c64://specs/assembly
# - c64://specs/sid
# - c64://specs/vic
# - c64://context/bootstrap
```

**Expected:** All resources return markdown content.

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

**Action:** Verify all resources work end-to-end.

**Update MIGRATION-PROGRESS.md:**
```markdown
- [x] 2.8 - Test resource reading with MCP inspector

### Phase 3: Resources Implementation - COMPLETE ✅
```

**STOP HERE. Commit changes. Review. Continue in next phase.**

---

## PHASE 4: TOOLS MIGRATION (CRITICAL)

### Step 3.1: Implement ListToolsRequestSchema Handler

**Action:** Add comprehensive tool list to `src/mcp-server.ts`:
```typescript
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // CODE GENERATION TOOLS (CRITICAL)
      {
        name: "upload_and_run_basic",
        description: `Upload and run a Commodore BASIC v2 program on the C64.

⚠️ MANDATORY WORKFLOW:
1. Read c64://specs/basic resource FIRST to verify syntax
2. Optionally read c64://context/bootstrap for workflow rules
3. Generate program using verified BASIC v2 tokens
4. Call this tool to upload and execute
5. Call read_screen to verify output

DO NOT generate BASIC code from memory - syntax is strict!`,
        inputSchema: {
          type: "object",
          properties: {
            program: {
              type: "string",
              description: 'Complete BASIC program with line numbers. Example: "10 PRINT \\"HELLO\\"\\n20 GOTO 10"',
            },
          },
          required: ["program"],
        },
      },
      {
        name: "upload_and_run_asm",
        description: `Assemble 6502/6510 code and run on C64.

⚠️ MANDATORY WORKFLOW:
1. Read c64://specs/assembly FIRST for instruction set
2. Read c64://specs/sid if using audio
3. Read c64://specs/vic if using graphics
4. Generate code with verified opcodes
5. Call this tool to assemble and execute

DO NOT guess opcodes or addressing modes!`,
        inputSchema: {
          type: "object",
          properties: {
            program: {
              type: "string",
              description: 'Assembly source with ORG directive. Example: "* = $0810\\nLDA #$00\\nRTS"',
            },
          },
          required: ["program"],
        },
      },
      {
        name: "read_screen",
        description: "Read 1KB of C64 screen memory ($0400-$07E7) and return as ASCII text. Use to verify program output.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "read_memory",
        description: "Read bytes from C64 main memory at specified address. Useful for debugging and verification.",
        inputSchema: {
          type: "object",
          properties: {
            address: {
              type: "string",
              description: "Address in hex ($XXXX), binary (%...), or decimal. Examples: $D020, 53280, %1111111100000000",
            },
            length: {
              type: "string",
              description: "Number of bytes to read (hex, bin, or decimal)",
            },
          },
          required: ["address", "length"],
        },
      },
      {
        name: "write_memory",
        description: "Write bytes directly to C64 memory. Use for direct hardware manipulation.",
        inputSchema: {
          type: "object",
          properties: {
            address: {
              type: "string",
              description: "Target address ($XXXX format preferred)",
            },
            bytes: {
              type: "string",
              description: "Hex byte sequence, e.g., '$010203' or '010203'",
            },
          },
          required: ["address", "bytes"],
        },
      },
      // Add remaining 60+ tools here following same pattern
      // ... (see full implementation below)
    ],
  };
});
```

**Update MIGRATION-PROGRESS.md:**
```markdown
- [x] 3.1 - Implement ListToolsRequestSchema handler
```

---

### Step 3.2: Implement CallToolRequestSchema Handler

**Action:** Add tool routing logic:
```typescript
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "upload_and_run_basic": {
        const program = args?.program as string;
        if (!program) throw new Error("program parameter required");
        const result = await client.uploadAndRunBasic(program);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "upload_and_run_asm": {
        const program = args?.program as string;
        if (!program) throw new Error("program parameter required");
        const result = await client.uploadAndRunAsm(program);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "read_screen": {
        const screen = await client.readScreen();
        return {
          content: [
            {
              type: "text",
              text: screen,
            },
          ],
        };
      }

      case "read_memory": {
        const address = args?.address as string;
        const length = args?.length as string;
        if (!address || !length) throw new Error("address and length required");
        const result = await client.readMemory(address, length);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "write_memory": {
        const address = args?.address as string;
        const bytes = args?.bytes as string;
        if (!address || !bytes) throw new Error("address and bytes required");
        const result = await client.writeMemory(address, bytes);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      // Add remaining tool cases...

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: false, error: message }, null, 2),
        },
      ],
      isError: true,
    };
  }
});
```

**Update MIGRATION-PROGRESS.md:**
```markdown
- [x] 3.2 - Implement CallToolRequestSchema handler
```

---

### Steps 3.3-3.13: Migrate Remaining Tools

**For each tool category:**

1. Add to ListToolsRequestSchema return
2. Add case to CallToolRequestSchema switch
3. Test tool works
4. Check off in MIGRATION-PROGRESS.md

**Tool Categories to Migrate:**
```typescript
// SID/Music tools
case "sid_note_on":
case "sid_note_off":
case "sid_volume":
case "sid_reset":
case "music_compile_and_play":
case "music_generate":

// Graphics tools  
case "create_petscii_image":
case "generate_sprite_prg":
case "render_petscii_screen":

// System tools
case "reset_c64":
case "reboot_c64":
case "pause":
case "resume":
case "poweroff":

// Drive tools
case "drive_mount":
case "drive_remove":
case "drives_list":
// ... etc

// Config tools
case "config_get":
case "config_set":
// ... etc
```

**Update MIGRATION-PROGRESS.md after EACH tool:**
```markdown
- [x] 3.3 - Migrate upload_and_run_basic tool
- [x] 3.4 - Migrate upload_and_run_asm tool
[continue for all 70+ tools]
```

**CRITICAL: Do NOT mark Phase 4 complete until ALL tools work!**

---

## PHASE 5: PROMPTS IMPLEMENTATION

### Step 4.1-4.2: Implement Prompt Handlers

**Action:** Add to `src/mcp-server.ts`:
```typescript
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: "basic-program",
        description: "Generate a Commodore BASIC v2 program with proper workflow",
        arguments: [
          {
            name: "task",
            description: "What should the program do?",
            required: true,
          },
        ],
      },
      {
        name: "assembly-program",
        description: "Generate 6502/6510 assembly with spec verification",
        arguments: [
          {
            name: "task",
            description: "What should the program do?",
            required: true,
          },
          {
            name: "hardware",
            description: "Hardware to use (sid, vic, both, none)",
            required: false,
          },
        ],
      },
      {
        name: "sid-music",
        description: "Create SID chip music composition",
        arguments: [
          {
            name: "style",
            description: "Music style (e.g., 'chiptune', 'classical', 'game music')",
            required: true,
          },
          {
            name: "tempo",
            description: "BPM (default 120)",
            required: false,
          },
        ],
      },
    ],
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "basic-program") {
    const task = args?.task as string;
    return {
      description: "Guided BASIC program generation workflow",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Create a Commodore 64 BASIC v2 program: ${task}

⚠️ MANDATORY WORKFLOW - Follow these steps exactly:

1. Read c64://specs/basic resource to understand BASIC v2 syntax
2. Read c64://context/bootstrap for workflow rules
3. Review the syntax carefully - BASIC v2 is strict!
4. Generate your program using ONLY verified tokens
5. Call upload_and_run_basic with your code
6. Call read_screen to verify the output

CRITICAL REMINDERS:
- Line numbers required (10, 20, 30...)
- Use PETSCII character codes where needed
- No ELSE statement in BASIC v2!
- Strings use double quotes only
- GOTO/GOSUB use line numbers, not labels

Begin now by reading the specs.`,
          },
        },
      ],
    };
  }

  if (name === "assembly-program") {
    const task = args?.task as string;
    const hardware = args?.hardware as string;
    return {
      description: "Guided assembly programming workflow",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Create 6502/6510 assembly code: ${task}
${hardware ? `Hardware: ${hardware}` : ""}

⚠️ MANDATORY WORKFLOW - Follow these steps exactly:

1. Read c64://specs/assembly for 6502 instruction set
${hardware?.includes("sid") ? "2. Read c64://specs/sid for SID registers\n" : ""}${hardware?.includes("vic") ? "2. Read c64://specs/vic for VIC-II programming\n" : ""}3. Verify ALL opcodes against the spec
4. Use correct addressing modes
5. Include ORG directive (e.g., * = $0810)
6. Generate your assembly code
7. Call upload_and_run_asm
8. Verify with read_memory if needed

CRITICAL REMINDERS:
- All opcodes MUST be valid 6502 instructions
- Use correct addressing mode syntax
- Memory addresses in $XXXX format
- Don't guess - verify everything!

Begin now by reading the assembly spec.`,
          },
        },
      ],
    };
  }

  throw new Error(`Unknown prompt: ${name}`);
});
```

**Update MIGRATION-PROGRESS.md:**
```markdown
- [x] 4.1 - Implement ListPromptsRequestSchema handler
- [x] 4.2 - Implement GetPromptRequestSchema handler
- [x] 4.3 - Create "basic-program" prompt
- [x] 4.4 - Create "assembly-program" prompt
- [x] 4.5 - Create "sid-music" prompt
```

---

## PHASE 6-9: TESTING, CLEANUP, DOCUMENTATION

[Continue with remaining phases following same pattern]

**Update MIGRATION-PROGRESS.md after each step.**

---

## VALIDATION CHECKPOINTS

After completing each phase, run:
```bash
# Build
npm run build

# Test MCP server
npm run mcp

# Verify in MCP Inspector
npx @modelcontextprotocol/inspector node dist/mcp-server.js
```

**Do NOT proceed to next phase until current phase is ✅ complete!**

---

## FINAL DELIVERABLES

When ALL checkboxes are ✅:

1. ✅ `src/mcp-server.ts` - Complete MCP SDK implementation
2. ✅ All tools work via MCP protocol
3. ✅ All resources load correctly
4. ✅ Prompts execute successfully
5. ✅ Old decorator system removed
6. ✅ `mcp-manifest.json` deleted
7. ✅ Documentation updated
8. ✅ `MIGRATION-PROGRESS.md` - Complete record

---

## SUCCESS CRITERIA

- [ ] Server starts without errors
- [ ] All 70+ tools callable via MCP
- [ ] All 7 resources readable
- [ ] All 3+ prompts work
- [ ] Works with Claude Desktop
- [ ] Works with VS Code Copilot
- [ ] No broken functionality from before migration
- [ ] Old custom system completely removed

---

**Remember: Update MIGRATION-PROGRESS.md after EVERY step. Never skip ahead.**