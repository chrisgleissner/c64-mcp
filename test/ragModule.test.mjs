import test from "node:test";
import assert from "node:assert/strict";
import { ragModule } from "../src/tools/rag.js";

function createLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

test("rag_retrieve_basic returns refs", async () => {
  const calls = [];
  const ctx = {
    client: {},
    rag: {
      async retrieve(query, limit, language) {
        calls.push({ query, limit, language });
        return [
          {
            snippet: '10 PRINT "HELLO"',
            origin: "doc/basic/example.md#Loop",
            uri: "https://example.com/basic/example#Loop",
            score: 0.9876,
            sourcePath: "doc/basic/example.md",
          },
        ];
      },
    },
    logger: createLogger(),
  };

  const result = await ragModule.invoke("rag_retrieve_basic", { q: "hello world" }, ctx);

  assert.equal(result.content[0].type, "text");
  assert.match(result.content[0].text, /Supplemental RAG references:/);
  assert.match(result.content[0].text, /10 PRINT "HELLO"/);
  assert.match(result.content[0].text, /score=/);
  assert.equal(result.structuredContent?.type, "json");
  assert.deepEqual(result.structuredContent?.data?.refs, [
    {
      snippet: '10 PRINT "HELLO"',
      score: 0.9876,
      origin: "doc/basic/example.md#Loop",
      uri: "https://example.com/basic/example#Loop",
      sourcePath: "doc/basic/example.md",
    },
  ]);
  assert.ok(Array.isArray(result.structuredContent?.data?.primaryResources));
  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.language, "basic");
  assert.equal(result.metadata.limit, 3);
  assert.equal(result.metadata.count, 1);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { query: "hello world", limit: 3, language: "basic" });
});

test("rag_retrieve_asm passes through custom limit", async () => {
  const calls = [];
  const ctx = {
    client: {},
    rag: {
      async retrieve(query, limit, language) {
        calls.push({ query, limit, language });
        return [
          { snippet: "LDX #$00", score: 0.8 },
          { snippet: "JMP LOOP", score: 0.7 },
        ];
      },
    },
    logger: createLogger(),
  };

  const result = await ragModule.invoke("rag_retrieve_asm", { q: "border color", k: 5 }, ctx);

  assert.equal(result.metadata.limit, 5);
  assert.equal(result.metadata.language, "asm");
  assert.equal(result.metadata.count, 2);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { query: "border color", limit: 5, language: "asm" });
});

test("rag retrieval validates query", async () => {
  const ctx = {
    client: {},
    rag: {
      async retrieve() {
        throw new Error("should not be called");
      },
    },
    logger: createLogger(),
  };

  const result = await ragModule.invoke("rag_retrieve_basic", { q: "" }, ctx);

  assert.equal(result.isError, true);
  assert.equal(result.metadata.error.kind, "validation");
});
