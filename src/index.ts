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
import { getChargenGlyphs } from "./chargen.js";
import { createPetsciiArt, type Bitmap } from "./petsciiArt.js";
import {
  listMemoryMap,
  listSymbols,
  getBasicV2Spec,
  searchBasicV2Spec,
  getAsmQuickReference,
  searchAsmQuickReference,
  getVicIISpec,
  searchVicIISpec,
} from "./knowledge.js";
import { initRag } from "./rag/init.js";
import type { RagLanguage } from "./rag/types.js";
import { parseSidwave } from "./sidwave.js";
import { compileSidwaveToPrg, compileSidwaveToSid } from "./sidwaveCompiler.js";

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
  // Preload chargen glyphs once at startup
  getChargenGlyphs();

  server.get("/health", async () => ({ status: "ok" }));

  // Knowledge endpoints
  server.get("/knowledge/memory_map", async () => ({ regions: listMemoryMap() }));
  server.get("/knowledge/symbols", async () => ({ symbols: listSymbols() }));
  server.get("/knowledge/sid_overview", async () => ({ guide: await import("node:fs/promises").then((fs) => fs.readFile("doc/sid-overview.md", "utf8")) }));
  server.get("/knowledge/sid_file_structure", async () => ({ guide: await import("node:fs/promises").then((fs) => fs.readFile("doc/sid-file-structure.md", "utf8")) }));
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

  // VIC-II knowledge endpoints
  server.get<{ Querystring: { topic?: string } }>(
    "/tools/vic_ii_spec",
    async (request) => {
      const { topic } = request.query ?? {};
      if (!topic) {
        return { spec: getVicIISpec() };
      }
      const results = searchVicIISpec(String(topic));
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

  // Generate a BASIC program to print text to printer (device 4) and run it
  server.post<{
    Body: { text?: string; target?: "commodore" | "epson"; secondaryAddress?: 0 | 7; formFeed?: boolean };
  }>("/tools/print_text", async (request, reply) => {
    const { text, target, secondaryAddress, formFeed } = request.body ?? {};
    if (typeof text !== "string") {
      reply.code(400);
      return { error: "Missing text" };
    }
    const result = await client.printTextOnPrinterAndRun({ text, target, secondaryAddress, formFeed });
    if (!result.success) reply.code(502);
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

  server.post<{ Body: { program?: string; lang?: RagLanguage } }>("/tools/upload_and_run_program", async (request, reply) => {
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
  server.get<{ Querystring: { q?: string; k?: string; lang?: RagLanguage } }>(
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

  // Record audio from default microphone and analyze SID playback
  server.post<{ Body: { durationSeconds?: number; expectedSidwave?: unknown } }>(
    "/tools/record_and_analyze_audio",
    async (request, reply) => {
      const { durationSeconds, expectedSidwave } = request.body ?? {};
      if (!Number.isFinite(durationSeconds as number)) {
        reply.code(400);
        return { error: "Missing or invalid durationSeconds" };
      }
      try {
        const mod = await import("./audio/record_and_analyze_audio.js");
        const result = await mod.recordAndAnalyzeAudio({
          durationSeconds: Number(durationSeconds),
          expectedSidwave,
        });
        return result;
      } catch (error) {
        request.log.error({ err: error }, "record_and_analyze_audio failed");
        reply.code(500);
        return { error: (error as Error).message };
      }
    },
  );

  // Smart audio verification tool triggered by natural language patterns
  server.post<{ Body: { request?: string; durationSeconds?: number; expectedSidwave?: unknown } }>(
    "/tools/analyze_audio",
    async (request, reply) => {
      const { request: userRequest, durationSeconds, expectedSidwave } = request.body ?? {};
      
      // Check if this is a verification/check/test request related to audio/music/sid
      const shouldAnalyze = userRequest && typeof userRequest === "string" && (
        (/(check|verify|test|analyze|listen|hear)/.test(userRequest.toLowerCase()) && 
         /(sid|audio|music|sound|song|play)/.test(userRequest.toLowerCase())) ||
        /(does.*sound|how.*sound|sound.*right|sound.*good|sound.*correct)/.test(userRequest.toLowerCase())
      );

      if (!shouldAnalyze) {
        return { 
          analyzed: false, 
          reason: "No audio verification request detected. Use keywords like 'check', 'verify', or 'test' with 'audio', 'music', or 'sid'." 
        };
      }

      const duration = Number(durationSeconds) || 3.0; // Default 3 seconds for verification
      
      try {
        const mod = await import("./audio/record_and_analyze_audio.js");
        const result = await mod.recordAndAnalyzeAudio({
          durationSeconds: duration,
          expectedSidwave,
        });
        
        return {
          analyzed: true,
          userRequest,
          result,
          feedback: generateAudioFeedback(result, userRequest)
        };
      } catch (error) {
        request.log.error({ err: error }, "analyze_audio failed");
        reply.code(500);
        return { error: (error as Error).message };
      }
    },
  );

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

  // --- SID / Music control endpoints ---
  server.post<{ Body: { volume?: number } }>("/tools/sid_volume", async (request, reply) => {
    const { volume } = request.body ?? {};
    if (typeof volume !== "number") {
      reply.code(400);
      return { error: "Missing volume" };
    }
    const result = await client.sidSetVolume(volume);
    if (!result.success) reply.code(502);
    return result;
  });

  server.post<{ Body: { hard?: boolean } }>("/tools/sid_reset", async (request, reply) => {
    const { hard } = request.body ?? {};
    const result = await client.sidReset(Boolean(hard));
    if (!result.success) reply.code(502);
    return result;
  });

  server.post<{ Body: { voice?: 1 | 2 | 3; note?: string; frequencyHz?: number; system?: "PAL" | "NTSC"; waveform?: "pulse" | "saw" | "tri" | "noise"; pulseWidth?: number; attack?: number; decay?: number; sustain?: number; release?: number } }>(
    "/tools/sid_note_on",
    async (request, reply) => {
      const result = await client.sidNoteOn(request.body ?? {} as any);
      if (!result.success) reply.code(502);
      return result;
    },
  );

  server.post<{ Body: { voice?: 1 | 2 | 3 } }>("/tools/sid_note_off", async (request, reply) => {
    const { voice } = request.body ?? {};
    if (voice !== 1 && voice !== 2 && voice !== 3) {
      reply.code(400);
      return { error: "Missing or invalid voice (1..3)" };
    }
    const result = await client.sidNoteOff(voice);
    if (!result.success) reply.code(502);
    return result;
  });

  server.post("/tools/sid_silence_all", async (_request, reply) => {
    const result = await client.sidSilenceAll();
    if (!result.success) reply.code(502);
    return result;
  });

  // Expose SID file structure doc as a simple tool for MCP clients
  server.get("/tools/sid_file_structure", async () => ({ guide: await import("node:fs/promises").then((fs) => fs.readFile("doc/sid-file-structure.md", "utf8")) }));

  // Expose printing knowledge article for MCP clients
  server.get("/tools/printing_guide", async () => ({ guide: await import("node:fs/promises").then((fs) => fs.readFile("doc/printing-commodore-epson.md", "utf8")) }));

  // Manufacturer-specific printing guides and prompts
  server.get("/tools/printing_commodore_text", async () => ({ guide: await import("node:fs/promises").then((fs) => fs.readFile("doc/printing-commodore.md", "utf8")) }));
  server.get("/tools/printing_commodore_bitmap", async () => ({ guide: await import("node:fs/promises").then((fs) => fs.readFile("doc/printing-commodore-bitmap.md", "utf8")) }));
  server.get("/tools/printing_epson_text", async () => ({ guide: await import("node:fs/promises").then((fs) => fs.readFile("doc/printing-epson.md", "utf8")) }));
  server.get("/tools/printing_epson_bitmap", async () => ({ guide: await import("node:fs/promises").then((fs) => fs.readFile("doc/printing-epson-bitmap.md", "utf8")) }));
  server.get("/tools/printing_prompts", async () => ({ guide: await import("node:fs/promises").then((fs) => fs.readFile("doc/prompts/printing-prompts.md", "utf8")) }));

  // Very simple generator: arpeggiate a triad on voice 1 for N steps
  server.post<{ Body: { root?: string; pattern?: string; steps?: number; tempoMs?: number; waveform?: "pulse" | "saw" | "tri" | "noise" } }>(
    "/tools/music_generate",
    async (request, reply) => {
      const { root = "C4", pattern = "0,4,7", steps = 16, tempoMs = 120, waveform = "pulse" } = request.body ?? {};
      const intervals = pattern
        .split(/[,\s]+/)
        .map((p) => Number.parseInt(String(p), 10))
        .filter((n) => Number.isFinite(n));
      if (intervals.length === 0) {
        reply.code(400);
        return { error: "Invalid pattern" };
      }
      try {
        const baseHz = (client as any).noteNameToHz?.(root) ?? 261.63;
        const timeline: Array<{ t: number; note: string }> = [];
        let t = 0;
        for (let i = 0; i < steps; i += 1) {
          const iv = intervals[i % intervals.length];
          timeline.push({ t, note: transpose(root, iv) });
          t += tempoMs;
        }
        // Fire-and-forget naive scheduler (non-realtime guarantees)
        void (async () => {
          await client.sidSetVolume(8);
          for (let i = 0; i < steps; i += 1) {
            const iv = intervals[i % intervals.length];
            await client.sidNoteOn({ voice: 1, note: transpose(root, iv), waveform, pulseWidth: 0x0800, attack: 1, decay: 2, sustain: 8, release: 3 });
            await sleep(tempoMs);
          }
          await client.sidNoteOff(1);
        })();
        return { ok: true, timeline } as any;
      } catch (err) {
        reply.code(500);
        return { error: (err as Error).message };
      }
    },
  );

  // Compile and run a CPG (Compressed Pattern Graph) song (YAML or JSON). Returns metadata and run details.
  server.post<{
    Body: { sidwave?: string | object; cpg?: string | object; format?: "yaml" | "json"; output?: "prg" | "sid"; dryRun?: boolean };
  }>("/tools/music_compile_and_play", async (request, reply) => {
    const { sidwave, cpg, output = "prg", dryRun } = request.body ?? {} as any;
    const payload = sidwave ?? cpg;
    if (!payload) {
      reply.code(400);
      return { error: "Missing sidwave (YAML or JSON)" };
    }
    try {
      const doc = typeof payload === "string" ? parseSidwave(payload) : parseSidwave(payload);
      let result: any = { success: true, ranOnC64: false };
      let ranOnC64 = false;
      let runDetails: any = undefined;
      const prgCompiled = compileSidwaveToPrg(doc);
      if (!dryRun) {
        if (output === "sid") {
          const sid = compileSidwaveToSid(doc, prgCompiled.prg);
          const res = await client.sidplayAttachment(sid.sid);
          if (!res.success) reply.code(502);
          result = res;
          ranOnC64 = Boolean(res.success);
          runDetails = res.details;
        } else {
          const run = await client.runPrg(prgCompiled.prg);
          if (!run.success) reply.code(502);
          result = run;
          ranOnC64 = Boolean(run.success);
          runDetails = run.details;
        }
      }
      return {
        success: true,
        ranOnC64,
        runDetails,
        song: { title: doc.song.title, tempo: doc.song.tempo, mode: doc.song.mode, length_bars: doc.song.length_bars },
        voices: doc.voices.map((v) => ({ id: v.id, name: v.name, waveform: v.waveform, pulse_width: v.pulse_width, adsr: v.adsr })),
        format: output,
      } as any;
    } catch (error) {
      reply.code(400);
      const message = error instanceof Error ? error.message : String(error);
      return { error: message };
    }
  });

  // Expose the SIDWAVE format specification as a tool for clients
  server.get("/tools/sidwave_spec", async () => ({ spec: await import("node:fs/promises").then((fs) => fs.readFile("doc/sidwave.md", "utf8")) }));

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

  // Graphics helpers
  server.post<{
    Body: {
      sprite?: string; // hex or base64 string, or array-like
      index?: number;
      x?: number;
      y?: number;
      color?: number;
      multicolour?: boolean;
    };
  }>("/tools/generate_sprite_prg", async (request, reply) => {
    const { sprite, index, x, y, color, multicolour } = request.body ?? {};
    if (!sprite) {
      reply.code(400);
      return { error: "Missing sprite (63 bytes)" };
    }
    let bytes: Uint8Array = new Uint8Array();
    try {
      if (typeof sprite === "string") {
        try {
          bytes = Uint8Array.from(Buffer.from(sprite, "base64"));
        } catch {
          const cleaned = sprite.startsWith("$") ? sprite.slice(1) : sprite;
          bytes = Uint8Array.from(Buffer.from(cleaned.replace(/[^0-9a-fA-F]/g, ""), "hex"));
        }
      } else if (Array.isArray((sprite as any))) {
        bytes = Uint8Array.from(sprite as any);
      }
    } catch (e) {
      reply.code(400);
      return { error: "Unable to parse sprite bytes" };
    }
    if (bytes.length !== 63) {
      reply.code(400);
      return { error: "Sprite must be exactly 63 bytes" };
    }
    const result = await client.generateAndRunSpritePrg({ spriteBytes: bytes, spriteIndex: index, x, y, color, multicolour });
    if (!result.success) reply.code(502);
    return result;
  });

  server.post<{
    Body: {
      prompt?: string;
      text?: string;
      maxWidth?: number;
      maxHeight?: number;
      borderColor?: number;
      backgroundColor?: number;
      foregroundColor?: number;
      dryRun?: boolean;
      bitmap?: { width?: number; height?: number; pixels?: Array<number> };
    };
  }>(
    "/tools/create_petscii_image",
    async (request, reply) => {
      const body = request.body ?? {};
      const {
        prompt,
        text,
        maxWidth,
        maxHeight,
        borderColor,
        backgroundColor,
        foregroundColor,
        dryRun,
      } = body;

      let explicitBitmap: Bitmap | undefined;
      if (body.bitmap) {
        const { width, height, pixels } = body.bitmap;
        if (!Number.isFinite(width) || !Number.isFinite(height)) {
          reply.code(400);
          return { error: "Bitmap width and height must be numbers" };
        }
        if (!Array.isArray(pixels)) {
          reply.code(400);
          return { error: "Bitmap pixels must be an array of numbers" };
        }
        const w = Number(width);
        const h = Number(height);
        if (w <= 0 || h <= 0 || w > 320 || h > 200) {
          reply.code(400);
          return { error: "Bitmap dimensions must be within 1..320x1..200" };
        }
        if (pixels.length !== w * h) {
          reply.code(400);
          return { error: "Bitmap pixel array length must equal width*height" };
        }
        explicitBitmap = {
          width: w,
          height: h,
          pixels: Uint8Array.from(pixels.map((value) => (value ? 1 : 0))),
        };
      }

      if (!prompt && !text && !explicitBitmap) {
        reply.code(400);
        return { error: "Provide a prompt, text, or explicit bitmap definition" };
      }

      try {
        // Optionally enrich the prompt using the local RAG retriever
        let ragRefs: string[] | undefined = undefined;
        let usedPrompt: string | undefined = prompt;
        try {
          if (typeof prompt === "string" && prompt.trim().length > 0) {
            // retrieve top-3 references using inferred language
            ragRefs = await rag.retrieve(prompt, 3, pickRagLanguage(prompt));
            if (Array.isArray(ragRefs) && ragRefs.length > 0) {
              usedPrompt = prompt + "\n\nREFERENCES:\n" + ragRefs.join("\n\n");
            }
          }
        } catch (e) {
          request.log.warn({ err: e }, "RAG retrieval failed; proceeding without enrichment");
        }

        const art = createPetsciiArt({
          prompt: usedPrompt,
          text,
          maxWidth,
          maxHeight,
          borderColor,
          backgroundColor,
          foregroundColor,
          bitmap: explicitBitmap,
        });

        let result;
        if (!dryRun) {
          result = await client.uploadAndRunBasic(art.program);
          if (!result.success) {
            reply.code(502);
          }
        }

        const runSuccess = dryRun ? true : result?.success ?? false;

        return {
          success: runSuccess,
          ranOnC64: !dryRun && Boolean(result?.success),
          runDetails: result?.details,
          program: art.program,
          bitmapHex: art.bitmapHex,
          rowHex: art.rowHex,
          width: art.bitmap.width,
          height: art.bitmap.height,
          charColumns: art.charColumns,
          charRows: art.charRows,
          petsciiCodes: art.petsciiCodes,
          usedShape: art.usedShape,
          sourceText: art.sourceText,
          ragRefs,
        };
      } catch (error) {
        request.log.error(error, "Failed to generate PETSCII art");
        reply.code(500);
        return { error: (error as Error).message };
      }
    },
  );

  server.post<{ Body: { text?: string; borderColor?: number; backgroundColor?: number } }>(
    "/tools/render_petscii_screen",
    async (request, reply) => {
      const { text, borderColor, backgroundColor } = request.body ?? {};
      if (typeof text !== "string") {
        reply.code(400);
        return { error: "Missing text" };
      }
      const result = await client.renderPetsciiScreenAndRun({ text, borderColor, backgroundColor });
      if (!result.success) reply.code(502);
      return result;
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
  explicit?: RagLanguage,
): RagLanguage | undefined {
  if (explicit === "basic" || explicit === "asm" || explicit === "mixed" || explicit === "hardware" || explicit === "other") {
    return explicit;
  }
  const lowered = query.toLowerCase();
  if (/(sid|vic-?ii|vicii|cia|6510|6502|hardware|register|sprite|raster)/.test(lowered)) {
    return "hardware";
  }
  if (/(\bmachine\s*code\b|\bassembly\b|\basm\b|\b6510\b|\bfast\s+(program|code)\b)/.test(lowered)) {
    return "asm";
  }
  if (/(\bbasic\b)/.test(lowered)) {
    return "basic";
  }
  return undefined;
}

function generateAudioFeedback(analysisResult: any, userRequest: string): string {
  try {
    const analysis = analysisResult?.analysis;
    if (!analysis) {
      return "Audio analysis completed but no musical content detected. Ensure the C64 is playing audio.";
    }

    const voices = analysis.voices || [];
    const globalMetrics = analysis.global_metrics || {};
    
    // Generate feedback based on detected notes and patterns
    let feedback = `Audio analysis detected ${voices.length} voice(s) over ${analysis.durationSeconds}s:\n\n`;
    
    voices.forEach((voice: any, index: number) => {
      const notes = voice.detected_notes || [];
      const validNotes = notes.filter((n: any) => n.note && n.frequency);
      
      if (validNotes.length > 0) {
        feedback += `Voice ${voice.id || index + 1}: ${validNotes.length} note(s) - `;
        feedback += validNotes.slice(0, 5).map((n: any) => `${n.note}(${Math.round(n.frequency)}Hz)`).join(', ');
        if (validNotes.length > 5) feedback += '...';
        
        if (voice.average_deviation !== null) {
          feedback += ` [avg deviation: ${Math.round(voice.average_deviation * 10) / 10} cents]`;
        }
        feedback += '\n';
      } else {
        feedback += `Voice ${voice.id || index + 1}: No clear notes detected\n`;
      }
    });

    // Add global metrics
    if (globalMetrics.average_pitch_deviation !== null) {
      feedback += `\nOverall pitch accuracy: ${Math.round(globalMetrics.average_pitch_deviation * 10) / 10} cents deviation`;
    }
    if (globalMetrics.detected_bpm !== null) {
      feedback += `\nDetected tempo: ${Math.round(globalMetrics.detected_bpm)} BPM`;
    }

    // Provide specific feedback based on user request
    if (/(sound.*right|sound.*good|sound.*correct)/.test(userRequest.toLowerCase())) {
      const avgDeviation = Math.abs(globalMetrics.average_pitch_deviation || 0);
      if (avgDeviation < 20) {
        feedback += "\n\n✓ The music sounds accurate with good pitch stability.";
      } else if (avgDeviation < 50) {
        feedback += "\n\n⚠ The music has some pitch variation but is generally recognizable.";
      } else {
        feedback += "\n\n✗ The music shows significant pitch deviation - check SID programming or playback.";
      }
    }

    return feedback;
  } catch (error) {
    return `Audio feedback generation failed: ${(error as Error).message}`;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function transpose(note: string, semitones: number): string {
  // Convert to MIDI
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(note.trim());
  if (!m) return note;
  const letter = m[1].toUpperCase();
  const accidental = m[2];
  const octave = Number(m[3]);
  const map: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let semi = map[letter] ?? 0;
  if (accidental === "#") semi += 1;
  if (accidental === "b") semi -= 1;
  let midi = (octave + 1) * 12 + semi + semitones;
  const letters = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const newOct = Math.floor(midi / 12) - 1;
  const name = letters[((midi % 12) + 12) % 12];
  return `${name}${newOct}`;
}

async function logConnectivity(server: FastifyInstance, client: C64Client, baseUrl: string): Promise<void> {
  try {
    const response = await axios.get(baseUrl, { timeout: 2000 });
    server.log.info(
      { status: response.status },
      `Connectivity check succeeded for c64 device at ${baseUrl}`,
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
      `Connectivity check failed for c64 device at ${baseUrl}: ${message}`,
    );
  }
}
