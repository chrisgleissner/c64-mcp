import test from "node:test";
import assert from "node:assert/strict";
import {
  stringSchema,
  numberSchema,
  integerSchema,
  booleanSchema,
  literalSchema,
  arraySchema,
  optionalSchema,
  objectSchema,
  mergeSchemas,
} from "../src/tools/schema.ts";
import {
  ToolValidationError,
  ToolExecutionError,
  toolErrorResult,
  unknownErrorResult,
} from "../src/tools/errors.ts";

const assertThrowsValidation = async (fn, messageIncludes) => {
  try {
    await fn();
    assert.fail("Expected ToolValidationError");
  } catch (error) {
    assert.ok(error instanceof ToolValidationError, "Expected validation error instance");
    if (messageIncludes) {
      assert.match(error.message, messageIncludes);
    }
  }
};

test("string schema validation", async (t) => {
  const schema = stringSchema({ minLength: 3, maxLength: 5, pattern: /^[A-Z]+$/ });

  assert.equal(schema.parse("ABC"), "ABC");
  assert.equal(schema.parse("Z".repeat(5)), "ZZZZZ");

  await assertThrowsValidation(() => schema.parse("AB"), /length/);
  await assertThrowsValidation(() => schema.parse("TOOLONG"), /length/);
  await assertThrowsValidation(() => schema.parse("abc"), /pattern/);

  const defaultSchema = stringSchema({ default: "HELLO" });
  assert.equal(defaultSchema.parse(undefined), "HELLO");
});

test("number schema validation", async () => {
  const schema = numberSchema({ minimum: 0, maximum: 10 });
  assert.equal(schema.parse(3), 3);

  await assertThrowsValidation(() => schema.parse(-1), /minimum/);
  await assertThrowsValidation(() => schema.parse(20), /maximum/);

  const intSchema = integerSchema();
  assert.equal(intSchema.parse(42), 42);
  await assertThrowsValidation(() => intSchema.parse(1.5), /integer/);

  const defaultSchema = numberSchema({ default: 7 });
  assert.equal(defaultSchema.parse(undefined), 7);
});

test("boolean and literal schemas", async () => {
  const boolSchema = booleanSchema();
  assert.equal(boolSchema.parse(true), true);
  await assertThrowsValidation(() => boolSchema.parse("yes"), /boolean/);

  const literal = literalSchema("RUN");
  assert.equal(literal.parse("RUN"), "RUN");
  await assertThrowsValidation(() => literal.parse("STOP"), /literal/);
});

test("array schema validation", async () => {
  const schema = arraySchema(integerSchema({ minimum: 0 }), { minItems: 1, maxItems: 3 });
  assert.deepEqual(schema.parse([1, 2]), [1, 2]);

  await assertThrowsValidation(() => schema.parse([]), /few/);
  await assertThrowsValidation(() => schema.parse([1, 2, 3, 4]), /many/);
});

test("optional schema defaults", () => {
  const base = integerSchema({ minimum: 0 });
  const optional = optionalSchema(base, 5);

  assert.equal(optional.parse(2), 2);
  assert.equal(optional.parse(undefined), 5);
  assert.equal(optional.parse(null), 5);
});

test("object schema validation", async () => {
  const schema = objectSchema({
    description: "Example payload",
    properties: {
      name: stringSchema({ minLength: 1 }),
      retries: optionalSchema(integerSchema({ minimum: 0 }), 0),
    },
    required: ["name"],
    additionalProperties: false,
  });

  const parsed = schema.parse({ name: "C64", retries: 3 });
  assert.deepEqual(parsed, { name: "C64", retries: 3 });

  await assertThrowsValidation(() => schema.parse({ retries: 1 }), /Missing required property/);
  await assertThrowsValidation(() => schema.parse({ name: "C64", extra: true }), /Unexpected property/);
});

test("object schema applies defaults when optional provided", () => {
  const schema = objectSchema({
    properties: {
      title: optionalSchema(stringSchema({ default: "Untitled" }), "Untitled"),
    },
    additionalProperties: false,
  });

  const parsed = schema.parse({});
  assert.deepEqual(parsed, { title: "Untitled" });
});

test("merge schemas combines structures", () => {
  const a = objectSchema({
    properties: {
      name: stringSchema(),
    },
    additionalProperties: false,
  });

  const b = objectSchema({
    properties: {
      enabled: booleanSchema({ default: true }),
    },
    additionalProperties: false,
  });

  const merged = mergeSchemas(a, b);
  assert.deepEqual(merged.parse({ name: "tool", enabled: false }), { name: "tool", enabled: false });
});

test("tool error helpers produce consistent metadata", () => {
  const error = new ToolExecutionError("Failed", { code: "E_FAIL", details: { endpoint: "/rest" } });
  const result = toolErrorResult(error);
  assert.equal(result.isError, true);
  assert.deepEqual(result.metadata?.error, {
    kind: "execution",
    code: "E_FAIL",
    details: { endpoint: "/rest" },
  });
});

test("unknown errors wrap safely", () => {
  const result = unknownErrorResult(new Error("Oops"));
  assert.equal(result.isError, true);
  assert.equal(result.metadata?.error.kind, "unknown");
});
