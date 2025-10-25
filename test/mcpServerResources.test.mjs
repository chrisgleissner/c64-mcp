import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import {
  ListResourcesResultSchema,
  ReadResourceResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createConnectedClient } from './helpers/mcpTestClient.mjs';

const expectedResources = [
  { uri: 'c64://docs/index', domain: 'overview', priority: 'critical' },
  { uri: 'c64://context/bootstrap', domain: 'orientation', priority: 'critical' },
  { uri: 'c64://specs/basic', domain: 'languages', priority: 'critical' },
  { uri: 'c64://specs/assembly', domain: 'languages', priority: 'critical' },
  { uri: 'c64://specs/sid', domain: 'audio', priority: 'critical' },
  { uri: 'c64://specs/sidwave', domain: 'audio', priority: 'reference' },
  { uri: 'c64://docs/sid/file-structure', domain: 'audio', priority: 'reference' },
  { uri: 'c64://specs/vic', domain: 'graphics', priority: 'critical' },
  { uri: 'c64://specs/printer', domain: 'printer', priority: 'critical' },
  { uri: 'c64://docs/printer/guide', domain: 'printer', priority: 'reference' },
  { uri: 'c64://docs/printer/commodore-text', domain: 'printer', priority: 'reference' },
  { uri: 'c64://docs/printer/commodore-bitmap', domain: 'printer', priority: 'reference' },
  { uri: 'c64://docs/printer/epson-text', domain: 'printer', priority: 'reference' },
  { uri: 'c64://docs/printer/epson-bitmap', domain: 'printer', priority: 'reference' },
  { uri: 'c64://docs/printer/prompts', domain: 'printer', priority: 'supplemental' },
];


test('MCP server exposes expected resources', async () => {
  const connection = await createConnectedClient();
  const { client } = connection;

  try {
    const listResult = await client.request(
      { method: 'resources/list', params: {} },
      ListResourcesResultSchema,
    );

    const resourcesByUri = new Map(
      listResult.resources.map((resource) => [resource.uri, resource]),
    );

    for (const expected of expectedResources) {
      const resource = resourcesByUri.get(expected.uri);
      assert.ok(resource, `resource ${expected.uri} should be listed`);
      assert.equal(resource.mimeType, 'text/markdown');
      assert.ok(resource.metadata, 'resource metadata should be present');
      assert.equal(resource.metadata.domain, expected.domain);
      assert.equal(resource.metadata.priority, expected.priority);
      assert.ok(
        typeof resource.metadata.summary === 'string' &&
          resource.metadata.summary.length > 0,
        'resource metadata should include a non-empty summary',
      );
      assert.ok(
        Array.isArray(resource.metadata.prompts),
        'metadata.prompts should be an array',
      );
      assert.ok(
        Array.isArray(resource.metadata.tools),
        'metadata.tools should be an array',
      );
      assert.ok(
        Array.isArray(resource.metadata.relatedResources),
        'metadata.relatedResources should be an array',
      );
    }

    const readUris = new Set(
      expectedResources.map((resource) => resource.uri),
    );

    for (const uri of readUris) {
      const readResult = await client.request(
        { method: 'resources/read', params: { uri } },
        ReadResourceResultSchema,
      );

      assert.ok(readResult.contents.length > 0, `${uri} should return content`);
      const [content] = readResult.contents;
      assert.equal(content.uri, uri, 'content should preserve URI');
      assert.equal(content.mimeType, 'text/markdown', 'content should be markdown');
      assert.equal(typeof content.text, 'string', 'content should include text');
      assert.ok(content.text.length > 0, `resource ${uri} should not be empty`);
    }

    const indexText = (await client.request(
      { method: 'resources/read', params: { uri: 'c64://docs/index' } },
      ReadResourceResultSchema,
    )).contents[0].text;
    for (const { uri } of expectedResources) {
      if (uri === 'c64://docs/index') {
        continue;
      }
      assert.ok(
        indexText.includes(uri),
        `knowledge index should reference ${uri}`,
      );
    }
  } finally {
    await connection.close();
    const stderrOutput = connection.stderrOutput();
    if (stderrOutput) {
      process.stderr.write(stderrOutput);
    }
  }
});
