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

test("filesystem_stats_by_extension aggregates counts and bytes", async () => {
  const ctx = {
    client: {
      async filesInfo(pattern) {
        assert.equal(pattern, "/games/**/*");
        return [
          { path: "/games/Alpha.PRG", size: 4096 },
          { path: "/games/Beta.sid", size: 2048 },
          {
            path: "/games/Collection.d64",
            size: 174848,
            entries: [
              { path: "/games/Collection.d64#DRAGON.PRG", size: 8192 },
              { path: "/games/Collection.d64#README.TXT", size: 512 },
            ],
          },
        ];
      },
    },
    logger: createLogger(),
  };

  const res = await metaModule.invoke("filesystem_stats_by_extension", { root: "/games" }, ctx);
  assert.equal(res.metadata?.success, true);
  const data = res.structuredContent?.data ?? {};
  assert.equal(data.totals.files, 5);
  assert.equal(data.insideContainerEntries, 2);

  const prgStats = (data.extensions ?? []).find((entry) => entry.extension === "prg");
  assert.ok(prgStats, "expected prg stats");
  assert.equal(prgStats.count, 2);
  assert.equal(prgStats.totalBytes, 4096 + 8192);

  const d64Stats = (data.extensions ?? []).find((entry) => entry.extension === "d64");
  assert.ok(d64Stats, "expected d64 stats");
  assert.equal(d64Stats.count, 1);
  assert.equal(d64Stats.totalBytes, 174848);

  const containerStats = (data.containers ?? []).find((entry) => entry.container === "/games/Collection.d64");
  assert.ok(containerStats, "expected container stats");
  assert.equal(containerStats.totalBytes, 8192 + 512);
});

test("filesystem_stats_by_extension filters extensions and skips containers when requested", async () => {
  const patterns = [];
  const ctx = {
    client: {
      async filesInfo(pattern) {
        patterns.push(pattern);
        return [
          { path: "/games/ALPHA.PRG", size: 4096 },
          { path: "/games/collection.d64", size: 174848, entries: [{ path: "/games/collection.d64#BETA.PRG", size: 2048 }] },
          { path: "/games/readme.txt", size: 128 },
        ];
      },
    },
    logger: createLogger(),
  };

  const res = await metaModule.invoke("filesystem_stats_by_extension", {
    root: "/games/",
    extensions: ["prg", ".PRG"],
    includeContainers: false,
  }, ctx);

  assert.equal(res.metadata?.success, true);
  const data = res.structuredContent?.data ?? {};
  assert.equal(data.totals.files, 2);
  assert.equal(data.insideContainerEntries, 1);

  const prgStats = (data.extensions ?? []).find((entry) => entry.extension === "prg");
  assert.ok(prgStats, "expected prg stats");
  assert.equal(prgStats.count, 2);
  assert.equal(prgStats.totalBytes, 4096 + 2048);

  const hasD64 = (data.extensions ?? []).some((entry) => entry.extension === "d64");
  assert.equal(hasD64, false, "containers should be skipped when includeContainers is false");

  assert.deepEqual([...new Set(patterns)], ["/games/**/*.prg"]);
});

test("filesystem_stats_by_extension handles entries without size", async () => {
  const ctx = {
    client: {
      async filesInfo() {
        return ["/games/UNKNOWN"];
      },
    },
    logger: createLogger(),
  };

  const res = await metaModule.invoke("filesystem_stats_by_extension", { root: "/games" }, ctx);
  assert.equal(res.metadata?.success, true);
  const data = res.structuredContent?.data ?? {};
  assert.equal(data.totals.files, 1);
  const noneStats = (data.extensions ?? []).find((entry) => entry.extension === "(none)");
  assert.ok(noneStats, "expected (none) extension stats");
  assert.equal(noneStats.knownSizes, 0);
  assert.equal(noneStats.unknownSizes, 1);
});

test("find_and_run_program_by_name handles malformed state file gracefully", async () => {
  const { file, dir } = tmpPath("findrun-malformed", "state.json");
  await fs.mkdir(dir, { recursive: true });
  const previous = process.env.C64_TASK_STATE_FILE;
  process.env.C64_TASK_STATE_FILE = file;
  try {
    const stateDir = path.join(dir, "meta");
    const stateFile = path.join(stateDir, "find_and_run_program_by_name.json");
    await fs.mkdir(stateDir, { recursive: true });
    
    // Write malformed JSON (not an object)
    await fs.writeFile(stateFile, JSON.stringify("not an object"), "utf8");
    
    let runPath = null;
    const ctx = {
      client: {
        async filesInfo() { return ["/games/Test.PRG"]; },
        async runPrgFile(p) { runPath = p; return { success: true }; },
      },
      logger: createLogger(),
    };

    const res = await metaModule.invoke("find_and_run_program_by_name", { root: "/games", nameContains: "test" }, ctx);
    assert.equal(res.metadata?.success, true);
    assert.equal(runPath, "/games/Test.PRG");
    
    // Verify new state was written despite malformed previous state
    const state = JSON.parse(await fs.readFile(stateFile, "utf8"));
    assert.equal(state.lastRunPath, "/games/Test.PRG");
    assert.equal(Array.isArray(state.recentSearches), true);
  } finally {
    if (previous === undefined) delete process.env.C64_TASK_STATE_FILE;
    else process.env.C64_TASK_STATE_FILE = previous;
  }
});

test("find_and_run_program_by_name handles state with invalid recentSearches", async () => {
  const { file, dir } = tmpPath("findrun-invalid-searches", "state.json");
  await fs.mkdir(dir, { recursive: true });
  const previous = process.env.C64_TASK_STATE_FILE;
  process.env.C64_TASK_STATE_FILE = file;
  try {
    const stateDir = path.join(dir, "meta");
    const stateFile = path.join(stateDir, "find_and_run_program_by_name.json");
    await fs.mkdir(stateDir, { recursive: true });
    
    // Write state with recentSearches as non-array
    await fs.writeFile(stateFile, JSON.stringify({ recentSearches: "not an array" }), "utf8");
    
    let runPath = null;
    const ctx = {
      client: {
        async filesInfo() { return ["/games/Demo.PRG"]; },
        async runPrgFile(p) { runPath = p; return { success: true }; },
      },
      logger: createLogger(),
    };

    const res = await metaModule.invoke("find_and_run_program_by_name", { root: "/games", nameContains: "demo" }, ctx);
    assert.equal(res.metadata?.success, true);
    assert.equal(runPath, "/games/Demo.PRG");
  } finally {
    if (previous === undefined) delete process.env.C64_TASK_STATE_FILE;
    else process.env.C64_TASK_STATE_FILE = previous;
  }
});

test("find_and_run_program_by_name handles state with entries missing pattern field", async () => {
  const { file, dir } = tmpPath("findrun-missing-pattern", "state.json");
  await fs.mkdir(dir, { recursive: true });
  const previous = process.env.C64_TASK_STATE_FILE;
  process.env.C64_TASK_STATE_FILE = file;
  try {
    const stateDir = path.join(dir, "meta");
    const stateFile = path.join(stateDir, "find_and_run_program_by_name.json");
    await fs.mkdir(stateDir, { recursive: true });
    
    // Write state with entries missing pattern field
    await fs.writeFile(stateFile, JSON.stringify({
      recentSearches: [
        { root: "/games" }, // missing pattern
        null, // null entry
        "not an object", // string entry
        { pattern: "valid", root: "/valid" } // valid entry
      ],
      lastRunPath: "/games/Old.PRG"
    }), "utf8");
    
    let runPath = null;
    const ctx = {
      client: {
        async filesInfo() { return ["/games/New.PRG"]; },
        async runPrgFile(p) { runPath = p; return { success: true }; },
      },
      logger: createLogger(),
    };

    const res = await metaModule.invoke("find_and_run_program_by_name", { root: "/games", nameContains: "new" }, ctx);
    assert.equal(res.metadata?.success, true);
    assert.equal(runPath, "/games/New.PRG");
    
    // Verify state was updated and invalid entries were filtered out
    const state = JSON.parse(await fs.readFile(stateFile, "utf8"));
    assert.equal(state.lastRunPath, "/games/New.PRG");
    assert.equal(Array.isArray(state.recentSearches), true);
    assert.equal(state.recentSearches.length, 2); // new entry + valid old entry
    assert.equal(state.recentSearches[1].pattern, "valid");
  } finally {
    if (previous === undefined) delete process.env.C64_TASK_STATE_FILE;
    else process.env.C64_TASK_STATE_FILE = previous;
  }
});

test("find_and_run_program_by_name handles empty state file", async () => {
  const { file, dir } = tmpPath("findrun-empty", "state.json");
  await fs.mkdir(dir, { recursive: true });
  const previous = process.env.C64_TASK_STATE_FILE;
  process.env.C64_TASK_STATE_FILE = file;
  try {
    const stateDir = path.join(dir, "meta");
    const stateFile = path.join(stateDir, "find_and_run_program_by_name.json");
    await fs.mkdir(stateDir, { recursive: true });
    
    // Write empty object
    await fs.writeFile(stateFile, JSON.stringify({}), "utf8");
    
    let runPath = null;
    const ctx = {
      client: {
        async filesInfo() { return ["/games/Test.PRG"]; },
        async runPrgFile(p) { runPath = p; return { success: true }; },
      },
      logger: createLogger(),
    };

    const res = await metaModule.invoke("find_and_run_program_by_name", { root: "/games", nameContains: "test" }, ctx);
    assert.equal(res.metadata?.success, true);
    assert.equal(runPath, "/games/Test.PRG");
  } finally {
    if (previous === undefined) delete process.env.C64_TASK_STATE_FILE;
    else process.env.C64_TASK_STATE_FILE = previous;
  }
});
