import { createServer } from "node:http";
import { once } from "node:events";
import { Buffer } from "node:buffer";

function parseNumeric(value, defaultRadix = 16) {
  if (!value) {
    return 0;
  }
  const trimmed = value.trim().toLowerCase();
  if (trimmed.startsWith("$")) {
    return Number.parseInt(trimmed.slice(1), 16);
  }
  if (trimmed.startsWith("0x")) {
    return Number.parseInt(trimmed.slice(2), 16);
  }
  if (trimmed.startsWith("%")) {
    return Number.parseInt(trimmed.slice(1), 2);
  }
  return Number.parseInt(trimmed, defaultRadix);
}

function normaliseHexString(input) {
  if (!input) {
    return "";
  }
  return input.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
}

export async function startMockC64Server() {
  const state = {
    lastPrg: null,
    runCount: 0,
    resets: 0,
    reboots: 0,
    memory: new Uint8Array(0x10000),
    lastWrite: null,
  };

  // seed memory with READY prompt at $0400
  state.memory.set(Buffer.from("READY.\n", "ascii"), 0x0400);

  const server = createServer(async (req, res) => {
    const { method, url } = req;

    if (!method || !url) {
      res.statusCode = 400;
      res.end();
      return;
    }

    if (method === "GET" && url === "/v1/version") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ version: "0.1-mock", errors: [] }));
      return;
    }

    if (method === "GET" && url === "/v1/info") {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({ product: "U64-MOCK", firmware_version: "3.12-mock", hostname: "mockc64", errors: [] }),
      );
      return;
    }

    if (method === "PUT" && url === "/v1/machine:pause") {
      state.paused = true;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ result: "paused" }));
      return;
    }

    if (method === "PUT" && url === "/v1/machine:resume") {
      state.paused = false;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ result: "resumed" }));
      return;
    }

    if (method === "GET" && url === "/v1/machine:debugreg") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ value: state.debugreg ?? "00", errors: [] }));
      return;
    }

    if (method === "PUT" && url.startsWith("/v1/machine:debugreg")) {
      const routeUrl = new URL(url, "http://mock.local");
      const value = (routeUrl.searchParams.get("value") ?? "00").toUpperCase();
      state.debugreg = value;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ value, errors: [] }));
      return;
    }

    if (method === "POST" && url === "/v1/runners:run_prg") {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }

      const prg = Buffer.concat(chunks);
      state.lastPrg = prg;
      state.runCount += 1;

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ result: "ok", bytes: prg.length }));
      return;
    }

    if (method === "GET" && url.startsWith("/v1/machine:readmem")) {
      const routeUrl = new URL(url, "http://mock.local");
      const addressValue = routeUrl.searchParams.get("address") ?? "0";
      const lengthValue = routeUrl.searchParams.get("length") ?? "256";
      const address = parseNumeric(addressValue);
      const length = Math.max(0, parseNumeric(lengthValue, 10));
      const bytes = state.memory.slice(address, address + length);

      res.setHeader("Content-Type", "application/json");
      const payload = Buffer.from(bytes).toString("base64");
      res.end(JSON.stringify({ data: payload }));
      return;
    }

    if (method === "PUT" && url === "/v1/machine:reset") {
      state.resets += 1;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ result: "reset" }));
      return;
    }

    if (method === "PUT" && url === "/v1/machine:reboot") {
      state.reboots += 1;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ result: "reboot" }));
      return;
    }

    if (method === "PUT" && url.startsWith("/v1/machine:writemem")) {
      const routeUrl = new URL(url, "http://mock.local");
      const addressValue = routeUrl.searchParams.get("address") ?? "0";
      const dataValue = normaliseHexString(routeUrl.searchParams.get("data") ?? "");
      const address = parseNumeric(addressValue);
      const bytes = Buffer.from(dataValue, "hex");

      state.memory.set(bytes, address);
      state.lastWrite = { address, bytes };

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ result: "wrote", address, length: bytes.length }));
      return;
    }

    res.statusCode = 404;
    res.end();
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to determine mock server address");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    state,
    async close() {
      server.close();
      await once(server, "close");
    },
  };
}
