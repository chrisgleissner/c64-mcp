import test from "node:test";
import assert from "node:assert/strict";
import { printerModule } from "../src/tools/printer.js";

function createLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

test("print_text prints via Commodore workflow", async () => {
  const calls = [];
  const ctx = {
    client: {
      async printTextOnPrinterAndRun(payload) {
        calls.push(payload);
        return { success: true, details: { lines: 3 } };
      },
    },
    logger: createLogger(),
  };

  const result = await printerModule.invoke(
    "print_text",
    { text: "HELLO", target: "commodore", secondaryAddress: 7, formFeed: true },
    ctx,
  );

  assert.equal(result.content[0].type, "text");
  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.target, "commodore");
  assert.equal(result.metadata.secondaryAddress, 7);
  assert.equal(result.metadata.formFeed, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { text: "HELLO", target: "commodore", secondaryAddress: 7, formFeed: true });
});

test("print_text validates required text", async () => {
  const ctx = {
    client: {
      async printTextOnPrinterAndRun() {
        throw new Error("should not run");
      },
    },
    logger: createLogger(),
  };

  const result = await printerModule.invoke("print_text", { text: "" }, ctx);
  assert.equal(result.isError, true);
  assert.equal(result.metadata.error.kind, "validation");
});

test("print_bitmap_commodore delegates to client", async () => {
  const calls = [];
  const ctx = {
    client: {
      async printBitmapOnCommodoreAndRun(payload) {
        calls.push(payload);
        return { success: true, details: { repeats: payload.repeats ?? 1 } };
      },
    },
    logger: createLogger(),
  };

  const result = await printerModule.invoke(
    "print_bitmap_commodore",
    { columns: [0, 255], repeats: 2, useSubRepeat: 3, secondaryAddress: 0, ensureMsb: true },
    ctx,
  );

  assert.equal(result.content[0].type, "text");
  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.columnCount, 2);
  assert.equal(result.metadata.repeats, 2);
  assert.equal(result.metadata.useSubRepeat, 3);
  assert.equal(result.metadata.secondaryAddress, 0);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    columns: [0, 255],
    repeats: 2,
    useSubRepeat: 3,
    secondaryAddress: 0,
    ensureMsb: true,
  });
});

test("print_bitmap_epson requires density for '*' mode", async () => {
  const ctx = {
    client: {
      async printBitmapOnEpsonAndRun() {
        throw new Error("should not run");
      },
    },
    logger: createLogger(),
  };

  const result = await printerModule.invoke(
    "print_bitmap_epson",
    { columns: [1, 2, 3], mode: "*" },
    ctx,
  );

  assert.equal(result.isError, true);
  assert.equal(result.metadata.error.kind, "validation");
});

test("define_printer_chars uploads character bitmap", async () => {
  const calls = [];
  const ctx = {
    client: {
      async defineCustomCharsOnCommodoreAndRun(payload) {
        calls.push(payload);
        return { success: true, details: { uploaded: payload.chars.length } };
      },
    },
    logger: createLogger(),
  };

  const result = await printerModule.invoke(
    "define_printer_chars",
    {
      firstChar: 65,
      secondaryAddress: 7,
      chars: [
        { a: 1, columns: Array.from({ length: 11 }, () => 0x7f) },
        { columns: Array.from({ length: 11 }, (_, i) => i) },
      ],
    },
    ctx,
  );

  assert.equal(result.content[0].type, "text");
  assert.equal(result.metadata.success, true);
  assert.equal(result.metadata.firstChar, 65);
  assert.equal(result.metadata.count, 2);
  assert.equal(result.metadata.secondaryAddress, 7);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].firstChar, 65);
  assert.equal(calls[0].chars.length, 2);
  assert.equal(calls[0].chars[0].a, 1);
  assert.deepEqual(calls[0].chars[0].columns, Array(11).fill(0x7f));
});
