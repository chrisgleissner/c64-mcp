import test from "#test/runner";
import assert from "#test/assert";
import fs from "node:fs/promises";
import path from "node:path";
import { metaModule } from "../../src/tools/meta/index.js";
import { createLogger, tmpPath } from "./helpers.mjs";

test("find_paths_by_name filters by substring and extension", async () => {
  const ctx = {
    client: {
      async filesInfo() { return ["/games/demo.prg", "/games/other.crt", "/music/demo.sid"]; },
    },
    logger: createLogger(),
  };
  const res = await metaModule.invoke("find_paths_by_name", { root: "/", nameContains: "demo", extensions: ["prg", "sid"] }, ctx);
  assert.equal(res.metadata?.success, true);
  const results = res.structuredContent?.data?.results ?? [];
  assert.deepEqual(results.sort(), ["/games/demo.prg", "/music/demo.sid"].sort());
});

test("find_paths_by_name supports object payload shape from firmware", async () => {
  const ctx = {
    client: {
      async filesInfo() { return { paths: ["/USB0/Demo1.PRG", "/USB0/Readme.TXT"] }; },
    },
    logger: createLogger(),
  };
  const res = await metaModule.invoke("find_paths_by_name", { root: "/USB0", nameContains: "demo", caseInsensitive: true }, ctx);
  assert.equal(res.metadata?.success, true);
  const results = res.structuredContent?.data?.results ?? [];
  assert.ok(results.includes("/USB0/Demo1.PRG"));
});

test("find_paths_by_name limits by maxResults and honors case sensitive flag", async () => {
  const paths = ["/a/demo.prg", "/b/DEMO.prg", "/c/demo.sid", "/d/other.txt"];
  const ctx = { client: { async filesInfo() { return paths; } }, logger: createLogger() };
  const res1 = await metaModule.invoke("find_paths_by_name", { root: "/", nameContains: "demo", maxResults: 2 }, ctx);
  assert.equal((res1.metadata?.count ?? 0) <= 2, true);
  const res2 = await metaModule.invoke("find_paths_by_name", { root: "/", nameContains: "DEMO", caseInsensitive: false }, ctx);
  const results2 = res2.structuredContent?.data?.results ?? [];
  assert.deepEqual(results2, ["/b/DEMO.prg"]);
});

test("find_and_run_program_by_name runs first matching PRG and records state", async () => {
  const { file, dir } = tmpPath("findrun", "state.json");
  await fs.mkdir(dir, { recursive: true });
  const previous = process.env.C64_TASK_STATE_FILE;
  process.env.C64_TASK_STATE_FILE = file;
  try {
    let runPath = null;
    const ctx = {
      client: {
        async filesInfo(pattern) {
          if (pattern.toLowerCase().includes(".prg")) {
            return ["/games/Alpha.PRG", "/games/Beta.PRG"];
          }
          return [];
        },
        async runPrgFile(p) { runPath = p; return { success: true }; },
      },
      logger: createLogger(),
    };

    const res = await metaModule.invoke("find_and_run_program_by_name", { root: "/games", nameContains: "alpha" }, ctx);
    assert.equal(res.metadata?.success, true);
    assert.equal(runPath, "/games/Alpha.PRG");

    const stateFile = path.join(dir, "meta", "find_and_run_program_by_name.json");
    const state = JSON.parse(await fs.readFile(stateFile, "utf8"));
    assert.equal(state.lastRunPath, "/games/Alpha.PRG");
    assert.equal(Array.isArray(state.recentSearches), true);
  } finally {
    if (previous === undefined) delete process.env.C64_TASK_STATE_FILE;
    else process.env.C64_TASK_STATE_FILE = previous;
  }
});

test("find_and_run_program_by_name honors alphabetical sort and CRT extension", async () => {
  const { file, dir } = tmpPath("findrun2", "state.json");
  await fs.mkdir(dir, { recursive: true });
  const previous = process.env.C64_TASK_STATE_FILE;
  process.env.C64_TASK_STATE_FILE = file;
  try {
    let crtPath = null;
    let prgCalls = 0;
    const ctx = {
      client: {
        async filesInfo(pattern) {
          if (pattern.toLowerCase().includes(".crt")) {
            return ["/games/ZZZ.CRT", "/games/Alpha.CRT", "/games/omega.crt"];
          }
          if (pattern.toLowerCase().includes(".prg")) {
            return ["/games/Zeta.PRG"];
          }
          return [];
        },
        async runCrtFile(p) { crtPath = p; return { success: true }; },
        async runPrgFile() { prgCalls += 1; return { success: true }; },
      },
      logger: createLogger(),
    };

    const res = await metaModule.invoke("find_and_run_program_by_name", {
      root: "/games",
      nameContains: "a",
      extensions: ["crt"],
      sort: "alphabetical",
    }, ctx);

    assert.equal(res.metadata?.success, true);
    assert.equal(crtPath, "/games/Alpha.CRT");
    assert.equal(prgCalls, 0);
  } finally {
    if (previous === undefined) delete process.env.C64_TASK_STATE_FILE;
    else process.env.C64_TASK_STATE_FILE = previous;
  }
});

test("find_and_run_program_by_name reports error when no program matches", async () => {
  const ctx = {
    client: { async filesInfo() { return []; } },
    logger: createLogger(),
  };
  const res = await metaModule.invoke("find_and_run_program_by_name", { root: "/games", nameContains: "missing" }, ctx);
  assert.equal(res.isError, true);
  assert.equal(res.metadata?.error?.kind, "execution");
});
