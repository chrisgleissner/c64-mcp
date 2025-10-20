import Fastify from "fastify";
import { C64Client } from "./c64Client.js";
import { loadConfig } from "./config.js";

async function main() {
  const config = loadConfig();
  const client = new C64Client(config.baseUrl ?? `http://${config.c64_ip}`);
  const port = Number(process.env.PORT ?? 8000);

  const server = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  server.get("/health", async () => ({ status: "ok" }));

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
