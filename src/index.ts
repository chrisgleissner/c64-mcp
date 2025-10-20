/*
C64 MCP - An MCP Server for the Commodore 64 Ultimate
Copyright (C) 2025 Christian Gleissner

Licensed under the GNU General Public License v2.0 or later.
See <https://www.gnu.org/licenses/> for details.
*/

import Fastify, { FastifyInstance } from "fastify";
import axios from "axios";
import { C64Client } from "./c64Client.js";
import { loadConfig } from "./config.js";
import {
  listMemoryMap,
  listSymbols,
  getBasicV2Spec,
  searchBasicV2Spec,
  getAsmQuickReference,
  searchAsmQuickReference,
} from "./knowledge.js";
import { initRag } from "./rag/init.js";

async function main() {
  const config = loadConfig();
  const baseUrl = config.baseUrl ?? `http://${config.c64_host}`;
  const client = new C64Client(baseUrl);
  const port = Number(process.env.PORT ?? 8000);

  const server = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  // Initialize local RAG (builds index on first run or when data changes)
  const rag = await initRag();

  server.get("/health", async () => ({ status: "ok" }));

  // Knowledge endpoints
  server.get("/knowledge/memory_map", async () => ({ regions: listMemoryMap() }));
  server.get("/knowledge/symbols", async () => ({ symbols: listSymbols() }));
  server.get<{ Querystring: { topic?: string } }>(
    "/tools/basic_v2_spec",
    async (request) => {
      const { topic } = request.query ?? {};
      if (!topic) {
        return { spec: getBasicV2Spec() };
      }
      const results = searchBasicV2Spec(String(topic));
      return { topic, results };
    },
  );
  server.get<{ Querystring: { topic?: string } }>(
    "/tools/asm_quick_reference",
    async (request) => {
      const { topic } = request.query ?? {};
      if (!topic) {
        return { guide: getAsmQuickReference() };
      }
      const results = searchAsmQuickReference(String(topic));
      return { topic, results };
    },
  );

  server.post<{ Body: { program: string } }>("/tools/upload_and_run_basic", async (request, reply) => {
    const { program } = request.body ?? {};

    if (!program || typeof program !== "string") {
      reply.code(400);
      return { error: "Missing BASIC program string" };
    }

    const result = await client.uploadAndRunBasic(program);
    if (!result.success) {
      reply.code(502);
    }

    return result;
  });

  server.post<{ Body: { program: string } }>("/tools/upload_and_run_asm", async (request, reply) => {
    const { program } = request.body ?? {};

    if (!program || typeof program !== "string") {
      reply.code(400);
      return { error: "Missing assembly program string" };
    }

    const result = await client.uploadAndRunAsm(program);
    if (!result.success) {
      reply.code(502);
    }

    return result;
  });

  server.post<{ Body: { program?: string; lang?: "basic" | "asm" } }>("/tools/upload_and_run_program", async (request, reply) => {
    const { program, lang } = request.body ?? {};
    if (!program || typeof program !== "string") {
      reply.code(400);
      return { error: "Missing program string" };
    }

    const inferred = pickRagLanguage(program, lang);
    // Heuristic: look for assembly intent keywords
    const wantsAsm = inferred === "asm" || /\b(game|demo|interrupt|irq|nmi|sprite|multiplex|sprites|raster|vblank|machine\s*code)\b/i.test(program);

    const result = wantsAsm ? await client.uploadAndRunAsm(program) : await client.uploadAndRunBasic(program);
    if (!result.success) {
      reply.code(502);
    }
    return { ...result, language: wantsAsm ? "asm" : "basic" } as any;
  });

  // RAG helper endpoints for MCP clients (optional but useful for validation)
  server.get<{ Querystring: { q?: string; k?: string; lang?: "basic" | "asm" } }>(
    "/rag/retrieve",
    async (request, reply) => {
      const { q, k, lang } = request.query ?? {};
      if (!q) {
        reply.code(400);
        return { error: "Missing q" };
      }
      const topK = k ? Number(k) : 3;
      const inferredLang = pickRagLanguage(q, lang);
      const refs = await rag.retrieve(q, topK, inferredLang);
      return { refs, language: inferredLang ?? "auto" };
    },
  );

  server.post<{ Body: { path?: string } }>("/tools/run_prg_file", async (request, reply) => {
    const { path } = request.body ?? {};
    if (!path) {
      reply.code(400);
      return { error: "Missing path" };
    }
    const result = await client.runPrgFile(path);
    if (!result.success) reply.code(502);
    return result;
  });

  server.post<{ Body: { path?: string } }>("/tools/load_prg_file", async (request, reply) => {
    const { path } = request.body ?? {};
    if (!path) {
      reply.code(400);
      return { error: "Missing path" };
    }
    const result = await client.loadPrgFile(path);
    if (!result.success) reply.code(502);
    return result;
  });

  server.post<{ Body: { path?: string } }>("/tools/run_crt_file", async (request, reply) => {
    const { path } = request.body ?? {};
    if (!path) {
      reply.code(400);
      return { error: "Missing path" };
    }
    const result = await client.runCrtFile(path);
    if (!result.success) reply.code(502);
    return result;
  });

  server.post<{ Body: { path?: string; songnr?: number } }>("/tools/sidplay_file", async (request, reply) => {
    const { path, songnr } = request.body ?? {};
    if (!path) {
      reply.code(400);
      return { error: "Missing path" };
    }
    const result = await client.sidplayFile(path, songnr);
    if (!result.success) reply.code(502);
    return result;
  });

  server.post<{ Body: { path?: string } }>("/tools/modplay_file", async (request, reply) => {
    const { path } = request.body ?? {};
    if (!path) {
      reply.code(400);
      return { error: "Missing path" };
    }
    const result = await client.modplayFile(path);
    if (!result.success) reply.code(502);
    return result;
  });

  // Expose RAG retrieval as MCP tools for convenience
  server.post<{ Body: { q?: string; k?: number } }>("/tools/rag_retrieve_basic", async (request, reply) => {
    const { q, k } = request.body ?? {};
    if (!q) {
      reply.code(400);
      return { error: "Missing q" };
    }
    const refs = await rag.retrieve(q, k ?? 3, "basic");
    return { refs };
  });

  server.post<{ Body: { q?: string; k?: number } }>("/tools/rag_retrieve_asm", async (request, reply) => {
    const { q, k } = request.body ?? {};
    if (!q) {
      reply.code(400);
      return { error: "Missing q" };
    }
    const refs = await rag.retrieve(q, k ?? 3, "asm");
    return { refs };
  });

  server.get("/tools/read_screen", async () => {
    const screen = await client.readScreen();
    return { screen };
  });

  server.post("/tools/reset_c64", async (request, reply) => {
    const result = await client.reset();
    if (!result.success) {
      reply.code(502);
    }
    return result;
  });

  server.post("/tools/reboot_c64", async (request, reply) => {
    const result = await client.reboot();
    if (!result.success) {
      reply.code(502);
    }
    return result;
  });

  // Additional REST API feature tools
  server.get("/tools/version", async () => ({ details: await client.version() }));
  server.get("/tools/info", async () => ({ details: await client.info() }));
  server.post("/tools/pause", async () => await client.pause());
  server.post("/tools/resume", async () => await client.resume());
  server.post("/tools/poweroff", async () => await client.poweroff());
  server.post("/tools/menu_button", async () => await client.menuButton());
  server.get("/tools/debugreg_read", async () => await client.debugregRead());
  server.post<{ Body: { value?: string } }>("/tools/debugreg_write", async (request, reply) => {
    const { value } = request.body ?? {};
    if (!value) {
      reply.code(400);
      return { error: "Missing value" };
    }
    return client.debugregWrite(value);
  });
  server.get("/tools/drives", async () => ({ details: await client.drivesList() }));
  server.post<{ Body: { drive?: string; image?: string; type?: string; mode?: string } }>(
    "/tools/drive_mount",
    async (request, reply) => {
      const { drive, image, type, mode } = request.body ?? {};
      if (!drive || !image) {
        reply.code(400);
        return { error: "Missing drive or image" };
      }
      return client.driveMount(drive, image, { type: type as any, mode: mode as any });
    },
  );
  server.post<{ Body: { drive?: string } }>("/tools/drive_remove", async (request, reply) => {
    const { drive } = request.body ?? {};
    if (!drive) {
      reply.code(400);
      return { error: "Missing drive" };
    }
    return client.driveRemove(drive);
  });
  server.post<{ Body: { drive?: string } }>("/tools/drive_reset", async (request, reply) => {
    const { drive } = request.body ?? {};
    if (!drive) {
      reply.code(400);
      return { error: "Missing drive" };
    }
    return client.driveReset(drive);
  });
  server.post<{ Body: { drive?: string } }>("/tools/drive_on", async (request, reply) => {
    const { drive } = request.body ?? {};
    if (!drive) {
      reply.code(400);
      return { error: "Missing drive" };
    }
    return client.driveOn(drive);
  });
  server.post<{ Body: { drive?: string } }>("/tools/drive_off", async (request, reply) => {
    const { drive } = request.body ?? {};
    if (!drive) {
      reply.code(400);
      return { error: "Missing drive" };
    }
    return client.driveOff(drive);
  });
  server.post<{ Body: { drive?: string; mode?: "1541" | "1571" | "1581" } }>(
    "/tools/drive_mode",
    async (request, reply) => {
      const { drive, mode } = request.body ?? {};
      if (!drive || !mode) {
        reply.code(400);
        return { error: "Missing drive or mode" };
      }
      return client.driveSetMode(drive, mode);
    },
  );
  server.post<{ Body: { stream?: "video" | "audio" | "debug"; ip?: string } }>(
    "/tools/stream_start",
    async (request, reply) => {
      const { stream, ip } = request.body ?? {};
      if (!stream || !ip) {
        reply.code(400);
        return { error: "Missing stream or ip" };
      }
      return client.streamStart(stream, ip);
    },
  );
  server.post<{ Body: { stream?: "video" | "audio" | "debug" } }>(
    "/tools/stream_stop",
    async (request, reply) => {
      const { stream } = request.body ?? {};
      if (!stream) {
        reply.code(400);
        return { error: "Missing stream" };
      }
      return client.streamStop(stream);
    },
  );
  server.get<{ Querystring: { category?: string; item?: string } }>(
    "/tools/config_get",
    async (request, reply) => {
      const { category, item } = request.query ?? {};
      if (!category) {
        reply.code(400);
        return { error: "Missing category" };
      }
      return { details: await client.configGet(category, item) };
    },
  );
  server.get("/tools/config_list", async () => ({ details: await client.configsList() }));
  server.post<{ Body: { category?: string; item?: string; value?: string } }>(
    "/tools/config_set",
    async (request, reply) => {
      const { category, item, value } = request.body ?? {};
      if (!category || !item || !value) {
        reply.code(400);
        return { error: "Missing category, item, or value" };
      }
      return client.configSet(category, item, value);
    },
  );
  server.post<{ Body: { payload?: Record<string, object> } }>(
    "/tools/config_batch_update",
    async (request, reply) => {
      const { payload } = request.body ?? {};
      if (!payload || typeof payload !== "object") {
        reply.code(400);
        return { error: "Missing payload" };
      }
      return client.configBatchUpdate(payload);
    },
  );
  server.post("/tools/config_load_from_flash", async () => await client.configLoadFromFlash());
  server.post("/tools/config_save_to_flash", async () => await client.configSaveToFlash());
  server.post("/tools/config_reset_to_default", async () => await client.configResetToDefault());
  server.get<{ Querystring: { path?: string } }>("/tools/file_info", async (request, reply) => {
    const { path } = request.query ?? {};
    if (!path) {
      reply.code(400);
      return { error: "Missing path" };
    }
    return { details: await client.filesInfo(path) };
  });
  server.post<{ Body: { path?: string; tracks?: number; diskname?: string } }>(
    "/tools/create_d64",
    async (request, reply) => {
      const { path, tracks, diskname } = request.body ?? {};
      if (!path) {
        reply.code(400);
        return { error: "Missing path" };
      }
      return client.filesCreateD64(path, { tracks: tracks as any, diskname });
    },
  );
  server.post<{ Body: { path?: string; diskname?: string } }>("/tools/create_d71", async (request, reply) => {
    const { path, diskname } = request.body ?? {};
    if (!path) {
      reply.code(400);
      return { error: "Missing path" };
    }
    return client.filesCreateD71(path, { diskname });
  });
  server.post<{ Body: { path?: string; diskname?: string } }>("/tools/create_d81", async (request, reply) => {
    const { path, diskname } = request.body ?? {};
    if (!path) {
      reply.code(400);
      return { error: "Missing path" };
    }
    return client.filesCreateD81(path, { diskname });
  });
  server.post<{ Body: { path?: string; tracks?: number; diskname?: string } }>(
    "/tools/create_dnp",
    async (request, reply) => {
      const { path, tracks, diskname } = request.body ?? {};
      if (!path || !tracks) {
        reply.code(400);
        return { error: "Missing path or tracks" };
      }
      return client.filesCreateDnp(path, Number(tracks), { diskname });
    },
  );

  server.post<{ Body: { address?: string; length?: string } }>("/tools/read_memory", async (request, reply) => {
    const { address, length } = request.body ?? {};

    if (!address || !length) {
      reply.code(400);
      return { error: "Missing address or length" };
    }

    const result = await client.readMemory(address, length);
    if (!result.success) {
      reply.code(502);
    }
    return result;
  });

  server.post<{ Body: { address?: string; bytes?: string } }>("/tools/write_memory", async (request, reply) => {
    const { address, bytes } = request.body ?? {};

    if (!address || !bytes) {
      reply.code(400);
      return { error: "Missing address or bytes" };
    }

    const result = await client.writeMemory(address, bytes);
    if (!result.success) {
      reply.code(502);
    }
    return result;
  });

  await logConnectivity(server, client, baseUrl);

  try {
    await server.listen({ port, host: "0.0.0.0" });
    server.log.info(`c64-mcp server listening on port ${port}`);
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error starting server", error);
  process.exit(1);
});

function pickRagLanguage(
  query: string,
  explicit?: "basic" | "asm",
): "basic" | "asm" | undefined {
  if (explicit === "basic" || explicit === "asm") {
    return explicit;
  }
  const lowered = query.toLowerCase();
  if (/(\bmachine\s*code\b|\bassembly\b|\basm\b|\b6510\b|\bfast\s+(program|code)\b)/.test(lowered)) {
    return "asm";
  }
  if (/(\bbasic\b)/.test(lowered)) {
    return "basic";
  }
  return undefined;
}

async function logConnectivity(server: FastifyInstance, client: C64Client, baseUrl: string): Promise<void> {
  try {
    const response = await axios.get(baseUrl, { timeout: 2000 });
    server.log.info(
      { status: response.status },
      `Connectivity check succeeded for Ultimate 64 at ${baseUrl}`,
    );

    try {
      const memoryAddress = "$0000";
      const expected = "$2F";
      const memoryResult = await client.readMemory(memoryAddress, "1");

      if (memoryResult.success && memoryResult.data) {
        const matches = memoryResult.data.toUpperCase() === expected;
        const suffix = matches ? " (matches expected $2F)" : ` (expected ${expected})`;
        server.log.info(`Zero-page probe @ ${memoryAddress}: ${memoryResult.data}${suffix}`);
      } else {
        server.log.warn({ details: memoryResult.details }, "Zero-page probe failed");
      }
    } catch (memoryError) {
      server.log.warn({ err: memoryError }, "Zero-page probe threw an error");
    }
  } catch (error) {
    let message = "unknown error";
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      message = status ? `${error.message} (status ${status})` : error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }
    server.log.warn(
      { err: error },
      `Connectivity check failed for Ultimate 64 at ${baseUrl}: ${message}`,
    );
  }
}
