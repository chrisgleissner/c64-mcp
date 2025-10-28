import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import {
  loggerFor,
  payloadByteLength,
  formatPayloadForDebug,
  formatErrorMessage,
} from "../src/logger.js";

// Save original NODE_ENV
const originalEnv = process.env.NODE_ENV;

test.after(() => {
  // Restore NODE_ENV
  if (originalEnv !== undefined) {
    process.env.NODE_ENV = originalEnv;
  } else {
    delete process.env.NODE_ENV;
  }
});

// --- loggerFor ---

test("loggerFor returns logger with prefix", () => {
  const logger = loggerFor("test");
  assert.equal(logger.prefix, "test");
  assert.equal(typeof logger.debug, "function");
  assert.equal(typeof logger.info, "function");
  assert.equal(typeof logger.warn, "function");
  assert.equal(typeof logger.error, "function");
  assert.equal(typeof logger.isDebugEnabled, "function");
});

test("loggerFor caches loggers by prefix", () => {
  const logger1 = loggerFor("cache-test");
  const logger2 = loggerFor("cache-test");
  assert.strictEqual(logger1, logger2);
});

test("loggerFor creates separate loggers for different prefixes", () => {
  const logger1 = loggerFor("prefix1");
  const logger2 = loggerFor("prefix2");
  assert.notStrictEqual(logger1, logger2);
  assert.equal(logger1.prefix, "prefix1");
  assert.equal(logger2.prefix, "prefix2");
});

test("logger methods can be called in test env (they just skip)", () => {
  const logger = loggerFor("silent");
  // These should not throw in test env
  logger.debug("debug message");
  logger.info("info message");
  logger.warn("warn message");
  logger.error("error message");
  assert.ok(true);
});

test("logger isDebugEnabled returns false in test env", () => {
  const logger = loggerFor("debug-check");
  assert.equal(logger.isDebugEnabled(), false);
});

test("logger methods accept optional details", () => {
  const logger = loggerFor("with-details");
  // Should not throw
  logger.info("message with details", { key: "value", count: 42 });
  logger.warn("warning", { error: "something went wrong" });
  assert.ok(true);
});

// --- payloadByteLength ---

test("payloadByteLength returns 0 for null", () => {
  assert.equal(payloadByteLength(null), 0);
});

test("payloadByteLength returns 0 for undefined", () => {
  assert.equal(payloadByteLength(undefined), 0);
});

test("payloadByteLength handles Buffer", () => {
  const buf = Buffer.from("hello");
  assert.equal(payloadByteLength(buf), 5);
});

test("payloadByteLength handles string", () => {
  assert.equal(payloadByteLength("hello world"), 11);
  assert.equal(payloadByteLength(""), 0);
});

test("payloadByteLength handles UTF-8 string", () => {
  const utf8 = "café";
  assert.equal(payloadByteLength(utf8), Buffer.byteLength(utf8, "utf8"));
});

test("payloadByteLength handles URLSearchParams", () => {
  const params = new URLSearchParams({ key: "value", foo: "bar" });
  assert.equal(payloadByteLength(params), Buffer.byteLength(params.toString(), "utf8"));
});

test("payloadByteLength handles plain object", () => {
  const obj = { name: "test", value: 123 };
  const json = JSON.stringify(obj);
  assert.equal(payloadByteLength(obj), Buffer.byteLength(json));
});

test("payloadByteLength handles array", () => {
  const arr = [1, 2, 3, "test"];
  const json = JSON.stringify(arr);
  assert.equal(payloadByteLength(arr), Buffer.byteLength(json));
});

test("payloadByteLength handles number", () => {
  assert.equal(payloadByteLength(42), Buffer.byteLength("42"));
  assert.equal(payloadByteLength(3.14159), Buffer.byteLength("3.14159"));
});

test("payloadByteLength handles boolean", () => {
  assert.equal(payloadByteLength(true), Buffer.byteLength("true"));
  assert.equal(payloadByteLength(false), Buffer.byteLength("false"));
});

test("payloadByteLength handles bigint", () => {
  assert.equal(payloadByteLength(BigInt(123)), Buffer.byteLength("123"));
});

test("payloadByteLength handles ArrayBuffer", () => {
  const ab = new ArrayBuffer(10);
  assert.equal(payloadByteLength(ab), 10);
});

test("payloadByteLength handles TypedArray", () => {
  const arr = new Uint8Array([1, 2, 3, 4, 5]);
  assert.equal(payloadByteLength(arr), 5);
});

test("payloadByteLength handles object with circular reference", () => {
  const obj = { name: "test" };
  obj.self = obj;
  // Should fallback to String(payload)
  assert.ok(payloadByteLength(obj) > 0);
});

test("payloadByteLength returns 0 for unknown type", () => {
  const sym = Symbol("test");
  assert.equal(payloadByteLength(sym), 0);
});

// --- formatPayloadForDebug ---

test("formatPayloadForDebug returns null for null", () => {
  assert.equal(formatPayloadForDebug(null), null);
});

test("formatPayloadForDebug returns undefined for undefined", () => {
  assert.equal(formatPayloadForDebug(undefined), undefined);
});

test("formatPayloadForDebug converts Buffer to hex", () => {
  const buf = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
  assert.equal(formatPayloadForDebug(buf), "48656c6c6f");
});

test("formatPayloadForDebug converts ArrayBuffer to hex", () => {
  const ab = new ArrayBuffer(3);
  const view = new Uint8Array(ab);
  view[0] = 0xAA;
  view[1] = 0xBB;
  view[2] = 0xCC;
  assert.equal(formatPayloadForDebug(ab), "aabbcc");
});

test("formatPayloadForDebug converts TypedArray to hex", () => {
  const arr = new Uint8Array([0x12, 0x34, 0x56]);
  assert.equal(formatPayloadForDebug(arr), "123456");
});

test("formatPayloadForDebug converts URLSearchParams to string", () => {
  const params = new URLSearchParams({ a: "1", b: "2" });
  const result = formatPayloadForDebug(params);
  assert.equal(typeof result, "string");
  assert.ok(result.includes("a=1"));
  assert.ok(result.includes("b=2"));
});

test("formatPayloadForDebug clones plain object", () => {
  const obj = { name: "test", nested: { value: 42 } };
  const result = formatPayloadForDebug(obj);
  assert.deepEqual(result, obj);
  assert.notStrictEqual(result, obj);
});

test("formatPayloadForDebug handles object with circular reference", () => {
  const obj = { name: "test" };
  obj.self = obj;
  const result = formatPayloadForDebug(obj);
  assert.strictEqual(result, obj);
});

test("formatPayloadForDebug returns primitive values as-is", () => {
  assert.equal(formatPayloadForDebug("string"), "string");
  assert.equal(formatPayloadForDebug(123), 123);
  assert.equal(formatPayloadForDebug(true), true);
});

// --- formatErrorMessage ---

test("formatErrorMessage extracts Error message", () => {
  const error = new Error("Something went wrong");
  assert.equal(formatErrorMessage(error), "Something went wrong");
});

test("formatErrorMessage uses Error name if no message", () => {
  const error = new Error();
  error.message = "";
  const result = formatErrorMessage(error);
  assert.ok(result.includes("Error") || result === "");
});

test("formatErrorMessage handles null", () => {
  assert.equal(formatErrorMessage(null), "unknown error");
});

test("formatErrorMessage handles undefined", () => {
  assert.equal(formatErrorMessage(undefined), "unknown error");
});

test("formatErrorMessage converts non-Error to string", () => {
  assert.equal(formatErrorMessage("plain string error"), "plain string error");
  assert.equal(formatErrorMessage(404), "404");
});

test("formatErrorMessage collapses whitespace", () => {
  const error = new Error("Multi  line\n  error   message");
  assert.equal(formatErrorMessage(error), "Multi line error message");
});

test("formatErrorMessage trims whitespace", () => {
  const error = new Error("  padded message  ");
  assert.equal(formatErrorMessage(error), "padded message");
});

// Test with FormData if available (Node 18+)
if (typeof FormData !== "undefined") {
  test("formatPayloadForDebug handles FormData", () => {
    const fd = new FormData();
    fd.append("key1", "value1");
    fd.append("key2", "value2");
    const result = formatPayloadForDebug(fd);
    assert.ok(typeof result === "object");
    assert.ok(result.key1);
    assert.ok(result.key2);
  });

  test("formatPayloadForDebug handles FormData with Blob", () => {
    const fd = new FormData();
    fd.append("text", "data");
    // Create a simple blob if Blob is available
    if (typeof Blob !== "undefined") {
      const blob = new Blob(["test"], { type: "text/plain" });
      fd.append("file", blob);
      const result = formatPayloadForDebug(fd);
      assert.ok(typeof result === "object");
      assert.ok(result.file);
    }
  });
}
