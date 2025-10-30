import test from "#test/runner";
import assert from "#test/assert";
import { toolRegistry, describeToolModules } from "../src/tools/registry.js";

test("toolRegistry.list returns all registered tools", () => {
  const tools = toolRegistry.list();
  assert.ok(Array.isArray(tools), "should return an array");
  assert.ok(tools.length > 0, "should have at least one tool");
  
  // Check that each tool has required fields
  for (const tool of tools) {
    assert.ok(tool.name, `tool should have a name: ${JSON.stringify(tool)}`);
    assert.ok(tool.description, `tool ${tool.name} should have a description`);
    assert.ok(tool.parameters || tool.inputSchema, `tool ${tool.name} should have parameters or inputSchema`);
  }
});

test("toolRegistry.invoke executes a tool", async () => {
  process.env.C64_TEST_TARGET = "stub";
  
  const ctx = {
    c64: {
      type: "c64u",
      async ping() { return true; },
      async version() { return { version: "stub" }; },
      async info() { return { product: "stub" }; },
    },
  };
  
  // Test invoking a simple tool
  const result = await toolRegistry.invoke("version", {}, ctx);
  assert.ok(result, "should return a result");
  // Version returns firmware version data, not a success/failure structure
  assert.ok(result.content, "version should return content");
});

test("toolRegistry.invoke throws for unknown tool", async () => {
  const ctx = { c64: {} };
  
  await assert.rejects(
    () => toolRegistry.invoke("nonexistent_tool_xyz", {}, ctx),
    (err) => {
      assert.ok(err.message.includes("Unknown tool"));
      return true;
    }
  );
});

test("describeToolModules returns module descriptors", () => {
  const modules = describeToolModules();
  assert.ok(Array.isArray(modules), "should return an array");
  assert.ok(modules.length > 0, "should have at least one module");
  
  for (const module of modules) {
    assert.ok(module.domain, `module should have domain: ${JSON.stringify(module)}`);
    assert.ok(module.summary, `module ${module.domain} should have summary`);
    assert.ok(Array.isArray(module.defaultTags), `module ${module.domain} should have defaultTags array`);
    assert.ok(Array.isArray(module.workflowHints), `module ${module.domain} should have workflowHints array`);
    assert.ok(Array.isArray(module.tools), `module ${module.domain} should have tools array`);
    assert.ok(module.tools.length > 0, `module ${module.domain} should have at least one tool`);
  }
});
