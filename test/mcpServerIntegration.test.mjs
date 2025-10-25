import { registerHarnessSuite, withSharedMcpClient } from "./helpers/mcpTestHarness.mjs";
import { registerMcpServerCallToolTests } from "./suites/mcpServerCallToolSuite.mjs";
import { registerMcpServerResourcesTests } from "./suites/mcpServerResourcesSuite.mjs";
import { registerMcpServerToolsTests } from "./suites/mcpServerToolsSuite.mjs";
import { registerMcpServerPromptsTests } from "./suites/mcpServerPromptsSuite.mjs";

registerHarnessSuite("mcp-server-integration");

registerMcpServerCallToolTests(withSharedMcpClient);
registerMcpServerResourcesTests(withSharedMcpClient);
registerMcpServerToolsTests(withSharedMcpClient);
registerMcpServerPromptsTests(withSharedMcpClient);
