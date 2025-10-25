import test from "node:test";
import assert from "node:assert/strict";
import { streamingModule } from "../src/tools/streaming.js";

function createCtx() {
  return {
    client: {
      streamStart: async () => ({ success: true }),
      streamStop: async () => ({ success: true }),
    },
    logger: {
      info() {},
    },
  };
}

test("stream_start forwards parsed payload", async () => {
  const ctx = createCtx();
  const calls = [];
  ctx.client.streamStart = async (stream, target) => {
    calls.push({ stream, target });
    return { success: true, details: { mode: stream } };
  };

  const result = await streamingModule.invoke(
    "stream_start",
    { stream: "audio", target: "127.0.0.1:1234" },
    ctx,
  );

  assert.equal(result.content[0].type, "text");
  assert.equal(result.metadata.success, true);
  assert.deepEqual(calls, [{ stream: "audio", target: "127.0.0.1:1234" }]);
  assert.deepEqual(result.metadata.details, { mode: "audio" });
});

test("stream_start surfaces firmware failure", async () => {
  const ctx = createCtx();
  ctx.client.streamStart = async () => ({ success: false, details: { reason: "busy" } });

  const result = await streamingModule.invoke(
    "stream_start",
    { stream: "video", target: "127.0.0.1:9000" },
    ctx,
  );

  assert.equal(result.isError, true);
  assert.equal(result.metadata.error.kind, "execution");
  assert.deepEqual(result.metadata.error.details, { reason: "busy" });
});

test("stream_stop forwards parsed payload", async () => {
  const ctx = createCtx();
  const calls = [];
  ctx.client.streamStop = async (stream) => {
    calls.push(stream);
    return { success: true, details: { stopped: stream } };
  };

  const result = await streamingModule.invoke(
    "stream_stop",
    { stream: "debug" },
    ctx,
  );

  assert.equal(result.content[0].type, "text");
  assert.equal(result.metadata.success, true);
  assert.deepEqual(calls, ["debug"]);
  assert.deepEqual(result.metadata.details, { stopped: "debug" });
});

test("stream_stop surfaces firmware failure", async () => {
  const ctx = createCtx();
  ctx.client.streamStop = async () => ({ success: false, details: { reason: "not-running" } });

  const result = await streamingModule.invoke(
    "stream_stop",
    { stream: "audio" },
    ctx,
  );

  assert.equal(result.isError, true);
  assert.equal(result.metadata.error.kind, "execution");
  assert.deepEqual(result.metadata.error.details, { reason: "not-running" });
});
