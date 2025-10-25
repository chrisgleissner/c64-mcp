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

function createDefaultConfigs() {
  return {
    Audio: {
      Volume: "6",
      Balance: "center",
    },
    Video: {
      Mode: "PAL",
    },
  };
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) {
    return Buffer.alloc(0);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  try {
    const body = await readRequestBody(req);
    if (body.length === 0) {
      return {};
    }
    return JSON.parse(body.toString("utf8"));
  } catch {
    return {};
  }
}

function createInitialState() {
  return {
    lastPrg: null,
    runCount: 0,
    resets: 0,
    reboots: 0,
    memory: new Uint8Array(0x10000),
    lastWrite: null,
    lastRequest: null,
    drives: {},
    lastDriveOperation: null,
    createdImages: [],
    lastFileInfo: null,
    sidplayCount: 0,
    lastSidplay: null,
    sidAttachmentCount: 0,
    lastSidAttachment: null,
    modplayCount: 0,
    lastModplay: null,
    paused: false,
    debugreg: "00",
    configs: createDefaultConfigs(),
    flashSnapshot: null,
    lastConfigAction: null,
    streams: {
      video: { active: false, target: null },
      audio: { active: false, target: null },
      debug: { active: false, target: null },
    },
    lastStreamAction: null,
  };
}

function seedReadyPrompt(state) {
  state.memory.set(Buffer.from([0x12, 0x52, 0x45, 0x41, 0x44, 0x59, 0x2E, 0x0D]), 0x0400);
}

export async function startMockC64Server() {
  const state = createInitialState();

  // seed memory with READY prompt at $0400 and support PETSCII mapper used by petsciiToAscii
  seedReadyPrompt(state);

  function ensureDriveState(id) {
    if (!state.drives[id]) {
      state.drives[id] = {
        mountedImage: null,
        mode: "1541",
        power: "off",
        resetCount: 0,
        lastRom: null,
      };
    }
    return state.drives[id];
  }

  ensureDriveState("drive8");

  function resetState() {
    const fresh = createInitialState();
    Object.assign(state, fresh);
    seedReadyPrompt(state);
    ensureDriveState("drive8");
  }

  const server = createServer(async (req, res) => {
    const { method, url } = req;

    if (!method || !url) {
      res.statusCode = 400;
      res.end();
      return;
    }

    // Track last request metadata
    state.lastRequest = { method, url, headers: req.headers };

    if (method === "GET" && (url === "/" || url.startsWith("/?"))) {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ status: "ok", host: "mock" }));
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

    if (method === "GET" && url === "/v1/drives") {
      res.setHeader("Content-Type", "application/json");
      const drives = {};
      for (const [driveId, driveState] of Object.entries(state.drives)) {
        drives[driveId] = {
          enabled: driveState.power !== "off",
          power: driveState.power,
          mode: driveState.mode,
          image: driveState.mountedImage,
        };
      }
      res.end(JSON.stringify({ drives }));
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

    if (url.startsWith("/v1/runners:sidplay")) {
      let routeUrl;
      try {
        routeUrl = new URL(url, "http://mock.local");
      } catch {
        routeUrl = null;
      }

      if (routeUrl) {
        const songnrParam = routeUrl.searchParams.get("songnr");
        const songnr = songnrParam === null ? null : Number.parseInt(songnrParam, 10);

        if (method === "PUT") {
          const file = routeUrl.searchParams.get("file") ?? "";
          state.sidplayCount += 1;
          state.lastSidplay = { file, songnr };
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ result: "sidplay", file, songnr, errors: [] }));
          return;
        }

        if (method === "POST") {
          const chunks = [];
          for await (const chunk of req) {
            chunks.push(chunk);
          }

          const attachment = Buffer.concat(chunks);
          state.sidAttachmentCount += 1;
          state.lastSidAttachment = { songnr, bytes: attachment.length };
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ result: "sidplay_attachment", bytes: attachment.length, songnr, errors: [] }));
          return;
        }
      }
    }

    if (url.startsWith("/v1/runners:modplay")) {
      let routeUrl;
      try {
        routeUrl = new URL(url, "http://mock.local");
      } catch {
        routeUrl = null;
      }

      if (routeUrl) {
        if (method === "PUT") {
          const file = routeUrl.searchParams.get("file") ?? "";
          state.modplayCount += 1;
          state.lastModplay = { file };
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ result: "modplay", file, errors: [] }));
          return;
        }

        if (method === "POST") {
          const chunks = [];
          for await (const chunk of req) {
            chunks.push(chunk);
          }

          const attachment = Buffer.concat(chunks);
          state.modplayCount += 1;
          state.lastModplay = { file: null, bytes: attachment.length };
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ result: "modplay_attachment", bytes: attachment.length, errors: [] }));
          return;
        }
      }
    }

    if (method === "GET" && url.startsWith("/v1/machine:readmem")) {
      const routeUrl = new URL(url, "http://mock.local");
      const addressValue = routeUrl.searchParams.get("address") ?? "0";
      const lengthValue = routeUrl.searchParams.get("length") ?? "256";
      const address = parseNumeric(addressValue);
      const length = Math.max(0, parseNumeric(lengthValue, 10));
      const bytes = state.memory.slice(address, address + length);

      const accept = String(req.headers["accept"] || "");
      if (accept.includes("application/octet-stream")) {
        res.setHeader("Content-Type", "application/octet-stream");
        res.end(Buffer.from(bytes));
      } else {
        res.setHeader("Content-Type", "application/json");
        const payload = Buffer.from(bytes).toString("base64");
        res.end(JSON.stringify({ data: payload }));
      }
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

    if (method === "POST" && url.startsWith("/v1/machine:writemem")) {
      const routeUrl = new URL(url, "http://mock.local");
      const addressValue = routeUrl.searchParams.get("address") ?? "0";
      const address = parseNumeric(addressValue);

      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);

      state.memory.set(bytes, address);
      state.lastWrite = { address, bytes };

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ result: "wrote", address, length: bytes.length }));
      return;
    }

    if (method === "GET" && url === "/v1/configs") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ categories: Object.keys(state.configs), configs: state.configs }));
      return;
    }

    if (method === "POST" && url === "/v1/configs") {
      const payload = await readJson(req);
      if (payload && typeof payload === "object") {
        for (const [category, items] of Object.entries(payload)) {
          if (!state.configs[category]) {
            state.configs[category] = {};
          }
          if (items && typeof items === "object") {
            for (const [item, value] of Object.entries(items)) {
              state.configs[category][item] = String(value);
            }
          }
        }
      }
      state.lastConfigAction = { action: "batch_update", payload };
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ result: "batch_update", categories: Object.keys(payload ?? {}) }));
      return;
    }

    if (url.startsWith("/v1/configs:")) {
      const routeUrl = new URL(url, "http://mock.local");
      const action = routeUrl.pathname.slice("/v1/configs:".length);

      if (method === "PUT" && action === "load_from_flash") {
        if (state.flashSnapshot) {
          state.configs = JSON.parse(JSON.stringify(state.flashSnapshot));
        }
        state.lastConfigAction = { action: "load_from_flash" };
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ result: "loaded", restored: Boolean(state.flashSnapshot) }));
        return;
      }

      if (method === "PUT" && action === "save_to_flash") {
        state.flashSnapshot = JSON.parse(JSON.stringify(state.configs));
        state.lastConfigAction = { action: "save_to_flash" };
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ result: "saved" }));
        return;
      }

      if (method === "PUT" && action === "reset_to_default") {
        state.configs = createDefaultConfigs();
        state.lastConfigAction = { action: "reset_to_default" };
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ result: "reset" }));
        return;
      }
    }

    if (url.startsWith("/v1/configs/")) {
      const routeUrl = new URL(url, "http://mock.local");
      const segments = routeUrl.pathname.split("/").filter(Boolean).slice(2); // remove v1 + configs

      if (segments.length === 1) {
        const [category] = segments;

        if (method === "GET") {
          const categoryData = state.configs[category] ?? {};
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(categoryData));
          return;
        }
      }

      if (segments.length === 2) {
        const [category, item] = segments;
        if (method === "GET") {
          const categoryData = state.configs[category] ?? {};
          const value = categoryData[item];
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ value }));
          return;
        }

        if (method === "PUT") {
          const queryValue = routeUrl.searchParams.get("value");
          const body = await readJson(req);
          const value = queryValue ?? body?.value ?? "";
          if (!state.configs[category]) {
            state.configs[category] = {};
          }
          state.configs[category][item] = String(value);
          state.lastConfigAction = { action: "set", category, item, value: String(value) };
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ result: "updated", category, item, value: String(value) }));
          return;
        }
      }
    }

    if (url.startsWith("/v1/streams/")) {
      const routeUrl = new URL(url, "http://mock.local");
      const match = /^\/v1\/streams\/([^:]+):(start|stop)$/.exec(routeUrl.pathname);
      if (match) {
        const stream = decodeURIComponent(match[1]);
        const action = match[2];
        if (!state.streams[stream]) {
          state.streams[stream] = { active: false, target: null };
        }

        if (action === "start" && method === "PUT") {
          const body = await readJson(req);
          const target = routeUrl.searchParams.get("ip") ?? routeUrl.searchParams.get("target") ?? body?.ip ?? body?.target ?? null;
          state.streams[stream] = { active: true, target };
          state.lastStreamAction = { action: "start", stream, target };
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ result: "started", stream, target }));
          return;
        }

        if (action === "stop" && method === "PUT") {
          state.streams[stream] = { active: false, target: null };
          state.lastStreamAction = { action: "stop", stream };
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ result: "stopped", stream }));
          return;
        }
      }
    }

    if (url.startsWith("/v1/drives/")) {
      let routeUrl;
      try {
        routeUrl = new URL(url, "http://mock.local");
      } catch {
        routeUrl = null;
      }
      if (routeUrl) {
        const match = /^\/v1\/drives\/([^:]+):(mount|remove|reset|on|off|load_rom|set_mode)$/.exec(routeUrl.pathname);
        if (match) {
          const driveId = decodeURIComponent(match[1]);
          const action = match[2];
          const driveState = ensureDriveState(driveId);

          const respond = (payload) => {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(payload));
          };

          state.lastDriveOperation = {
            action,
            drive: driveId,
            params: Object.fromEntries(routeUrl.searchParams.entries()),
            method,
          };

          if (action === "mount" && method === "PUT") {
            const image = routeUrl.searchParams.get("image") ?? "";
            const type = routeUrl.searchParams.get("type") ?? null;
            const mode = routeUrl.searchParams.get("mode") ?? null;
            driveState.mountedImage = {
              image,
              type,
              mode,
            };
            respond({ result: "mounted", drive: driveId, image, type, mode });
            return;
          }

          if (action === "remove" && method === "PUT") {
            driveState.mountedImage = null;
            respond({ result: "removed", drive: driveId });
            return;
          }

          if (action === "reset" && method === "PUT") {
            driveState.resetCount += 1;
            respond({ result: "reset", drive: driveId, count: driveState.resetCount });
            return;
          }

          if (action === "on" && method === "PUT") {
            driveState.power = "on";
            respond({ result: "power_on", drive: driveId });
            return;
          }

          if (action === "off" && method === "PUT") {
            driveState.power = "off";
            respond({ result: "power_off", drive: driveId });
            return;
          }

          if (action === "load_rom" && (method === "PUT" || method === "POST")) {
            const file = routeUrl.searchParams.get("file") ?? "";
            driveState.lastRom = file;
            respond({ result: "rom_loaded", drive: driveId, file });
            return;
          }

          if (action === "set_mode" && method === "PUT") {
            const mode = routeUrl.searchParams.get("mode") ?? "1541";
            driveState.mode = mode;
            respond({ result: "mode_set", drive: driveId, mode });
            return;
          }
        }
      }
    }

    if (url.startsWith("/v1/files/")) {
      let routeUrl;
      try {
        routeUrl = new URL(url, "http://mock.local");
      } catch {
        routeUrl = null;
      }
      if (routeUrl) {
        const match = /^\/v1\/files\/([^:]+):(info|create_d64|create_d71|create_d81|create_dnp)$/.exec(routeUrl.pathname);
        if (match) {
          const encodedPath = match[1];
          const action = match[2];
          const decodedPath = decodeURIComponent(encodedPath);

          const respond = (payload) => {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(payload));
          };

          if (action === "info" && method === "GET") {
            state.lastFileInfo = decodedPath;
            respond({ path: decodedPath, size: 4096, type: "file" });
            return;
          }

          if (action === "create_d64" && method === "PUT") {
            const tracks = Number.parseInt(routeUrl.searchParams.get("tracks") ?? "35", 10);
            const diskname = routeUrl.searchParams.get("diskname") ?? null;
            state.createdImages.push({ type: "d64", path: decodedPath, tracks, diskname });
            respond({ result: "created", type: "d64", path: decodedPath, tracks, diskname });
            return;
          }

          if (action === "create_d71" && method === "PUT") {
            const diskname = routeUrl.searchParams.get("diskname") ?? null;
            state.createdImages.push({ type: "d71", path: decodedPath, diskname });
            respond({ result: "created", type: "d71", path: decodedPath, diskname });
            return;
          }

          if (action === "create_d81" && method === "PUT") {
            const diskname = routeUrl.searchParams.get("diskname") ?? null;
            state.createdImages.push({ type: "d81", path: decodedPath, diskname });
            respond({ result: "created", type: "d81", path: decodedPath, diskname });
            return;
          }

          if (action === "create_dnp" && method === "PUT") {
            const tracks = Number.parseInt(routeUrl.searchParams.get("tracks") ?? "0", 10);
            const diskname = routeUrl.searchParams.get("diskname") ?? null;
            state.createdImages.push({ type: "dnp", path: decodedPath, tracks, diskname });
            respond({ result: "created", type: "dnp", path: decodedPath, tracks, diskname });
            return;
          }
        }
      }
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
    reset: resetState,
  };
}
