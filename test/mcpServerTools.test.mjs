import test from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import { ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { createConnectedClient } from "./helpers/mcpTestClient.mjs";
import { toolRegistry } from "../src/tools/registry.js";

function assertDescriptorMetadata(metadata) {
  assert.ok(metadata, "tool metadata should exist");
  assert.equal(typeof metadata.domain, "string", "metadata.domain should be string");
  assert.ok(metadata.domain.length > 0, "metadata.domain should not be empty");
  assert.equal(typeof metadata.summary, "string", "metadata.summary should be string");
  assert.ok(metadata.summary.length > 0, "metadata.summary should not be empty");
  assert.ok(Array.isArray(metadata.resources), "metadata.resources should be array");
  assert.ok(Array.isArray(metadata.prompts), "metadata.prompts should be array");
  assert.ok(Array.isArray(metadata.tags), "metadata.tags should be array");
  if (metadata.examples !== undefined) {
    assert.ok(Array.isArray(metadata.examples), "metadata.examples should be array when present");
  }
}

test("MCP server exposes tool descriptors from registry", async () => {
  const connection = await createConnectedClient();
  const { client } = connection;

  try {
    const listResult = await client.request(
      { method: "tools/list", params: {} },
      ListToolsResultSchema,
    );

    assert.ok(Array.isArray(listResult.tools), "tools should be an array");

    const registryDescriptors = toolRegistry.list();
    assert.equal(
      listResult.tools.length,
      registryDescriptors.length,
      "ListTools should mirror registry tool count",
    );

    const listedByName = new Map(listResult.tools.map((tool) => [tool.name, tool]));

    for (const descriptor of registryDescriptors) {
      const listed = listedByName.get(descriptor.name);
      assert.ok(listed, `tool ${descriptor.name} should be returned`);
      assert.equal(listed.description, descriptor.description, "description should match registry");
      if (descriptor.inputSchema) {
        assert.deepEqual(listed.inputSchema, descriptor.inputSchema, "input schema should match registry");
      } else {
        assert.ok(
          listed.inputSchema === undefined || listed.inputSchema === null,
          "input schema should be absent when registry omits it",
        );
      }

      assertDescriptorMetadata(listed.metadata);
      assert.equal(listed.metadata.domain, descriptor.metadata.domain);
      assert.equal(listed.metadata.summary, descriptor.metadata.summary);
      assert.equal(listed.metadata.lifecycle, descriptor.metadata.lifecycle);
      assert.deepEqual(listed.metadata.resources, descriptor.metadata.resources);
      assert.deepEqual(listed.metadata.prompts, descriptor.metadata.prompts);
      assert.deepEqual(listed.metadata.tags, descriptor.metadata.tags);

      if (descriptor.metadata.examples) {
        assert.deepEqual(listed.metadata.examples, descriptor.metadata.examples);
      } else {
        assert.ok(
          listed.metadata.examples === undefined || listed.metadata.examples === null,
          "examples should be absent when registry omits them",
        );
      }
    }
  } finally {
    await connection.close();
    const stderrOutput = connection.stderrOutput();
    if (stderrOutput) {
      process.stderr.write(stderrOutput);
    }
  }
});
