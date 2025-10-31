import test from "#test/runner";
import assert from "#test/assert";
import {
  OPERATION_DISCRIMINATOR,
  VERIFY_PROPERTY_NAME,
  VERIFY_PROPERTY_SCHEMA,
  operationSchema,
  discriminatedUnionSchema,
  createOperationDispatcher,
} from "../src/tools/types.ts";
import { ToolValidationError } from "../src/tools/errors.ts";

const stubStatus = Object.freeze({ id: "c64u", features: [], limitedFeatures: [] });

const stubCtx = Object.freeze({
  client: {},
  rag: {},
  logger: {
    debug() {},
    info() {},
    warn() {},
    error() {},
  },
  platform: stubStatus,
  setPlatform() {
    return stubStatus;
  },
});

test("operationSchema builds op-discriminated schema", () => {
  const schema = operationSchema("read", {
    description: "Read a range of memory.",
    properties: {
      address: { type: "integer", minimum: 0 },
      length: { type: "integer", minimum: 1, default: 256 },
      [VERIFY_PROPERTY_NAME]: VERIFY_PROPERTY_SCHEMA,
    },
    required: ["address"],
  });

  assert.deepEqual(schema, {
    type: "object",
    description: "Read a range of memory.",
    properties: {
      [OPERATION_DISCRIMINATOR]: {
        const: "read",
        description: "Selects the read operation.",
      },
      address: { type: "integer", minimum: 0 },
      length: { type: "integer", minimum: 1, default: 256 },
      [VERIFY_PROPERTY_NAME]: VERIFY_PROPERTY_SCHEMA,
    },
    required: [OPERATION_DISCRIMINATOR, "address"],
    additionalProperties: false,
  });
});

test("discriminatedUnionSchema composes variant schemas", () => {
  const readSchema = operationSchema("read", {
    properties: {
      address: { type: "integer" },
      length: { type: "integer" },
    },
    required: ["address"],
  });

  const writeSchema = operationSchema("write", {
    properties: {
      address: { type: "integer" },
      data: { type: "string" },
    },
    required: ["address", "data"],
  });

  const union = discriminatedUnionSchema({
    description: "Memory operations",
    variants: [readSchema, writeSchema],
  });

  assert.deepEqual(union, {
    description: "Memory operations",
    oneOf: [readSchema, writeSchema],
    discriminator: { propertyName: OPERATION_DISCRIMINATOR },
    type: "object",
  });
});

test("createOperationDispatcher routes to matching handlers", async () => {
  const calls = [];

  const dispatcher = createOperationDispatcher(
    "c64.memory",
    {
      read: async (args) => {
        calls.push({ type: "read", args });
        return {
          content: [
            {
              type: "text",
              text: "read",
            },
          ],
        };
      },
      write: async (args) => {
        calls.push({ type: "write", args });
        return {
          content: [
            {
              type: "text",
              text: "write",
            },
          ],
        };
      },
    },
  );

  const readResult = await dispatcher({ op: "read", address: 4096 }, stubCtx);
  assert.equal(readResult.content[0].text, "read");
  assert.equal(calls[0].type, "read");
  assert.equal(calls[0].args.address, 4096);
  assert.equal(calls[0].args.op, "read");

  const writeResult = await dispatcher({ op: "write", address: 12288, data: "A", verify: true }, stubCtx);
  assert.equal(writeResult.content[0].text, "write");
  assert.equal(calls[1].type, "write");
  assert.equal(calls[1].args.address, 12288);
  assert.equal(calls[1].args.data, "A");
  assert.equal(calls[1].args.verify, true);
});

test("createOperationDispatcher validates op presence", async () => {
  const dispatcher = createOperationDispatcher(
    "c64.memory",
    {
      read: async () => ({ content: [] }),
    },
  );

  await assert.rejects(
    () => dispatcher({}, stubCtx),
    (error) => {
      assert.ok(error instanceof ToolValidationError);
      assert.equal(error.path, "$.op");
      return true;
    },
  );
});

test("createOperationDispatcher rejects unknown ops", async () => {
  const dispatcher = createOperationDispatcher(
    "c64.memory",
    {
      read: async () => ({ content: [] }),
      write: async () => ({ content: [] }),
    },
  );

  await assert.rejects(
    () => dispatcher({ op: "invalid" }, stubCtx),
    (error) => {
      assert.ok(error instanceof ToolValidationError);
      assert.equal(error.path, "$.op");
      assert.deepEqual(error.details?.allowed, ["read", "write"]);
      return true;
    },
  );
});
