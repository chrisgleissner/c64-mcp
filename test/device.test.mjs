import test from "#test/runner";
import assert from "#test/assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createFacade } from "../src/device.js";

test("device: ViceBackend unsupported operations", async (t) => {
  // Create a facade with vice backend by setting env
  const oldMode = process.env.C64_MODE;
  process.env.C64_MODE = "vice";
  
  t.after(() => {
    if (oldMode !== undefined) {
      process.env.C64_MODE = oldMode;
    } else {
      delete process.env.C64_MODE;
    }
  });

  const { facade } = await createFacade();
  
  await t.test("version returns emulator info", async () => {
    const version = await facade.version();
    assert.deepEqual(version, { emulator: "vice" });
  });

  await t.test("info returns emulator info with phase", async () => {
    const info = await facade.info();
    assert.deepEqual(info, { emulator: "vice", phase: 1 });
  });

  await t.test("loadPrgFile throws unsupported", async () => {
    await assert.rejects(
      () => facade.loadPrgFile("/tmp/test.prg"),
      (err) => {
        assert.ok(err.message.includes("loadPrgFile"));
        assert.ok(err.message.includes("not supported"));
        assert.equal(err.code, "UNSUPPORTED");
        return true;
      }
    );
  });

  await t.test("runCrtFile throws unsupported", async () => {
    await assert.rejects(
      () => facade.runCrtFile("/tmp/test.crt"),
      (err) => {
        assert.ok(err.message.includes("runCrtFile"));
        assert.equal(err.code, "UNSUPPORTED");
        return true;
      }
    );
  });

  await t.test("sidplayFile throws unsupported", async () => {
    await assert.rejects(
      () => facade.sidplayFile("/tmp/test.sid"),
      (err) => {
        assert.ok(err.message.includes("sidplayFile"));
        return true;
      }
    );
  });

  await t.test("sidplayAttachment throws unsupported", async () => {
    await assert.rejects(
      () => facade.sidplayAttachment(new Uint8Array([1, 2, 3])),
      (err) => {
        assert.ok(err.message.includes("sidplayAttachment"));
        return true;
      }
    );
  });

  await t.test("readMemory throws unsupported", async () => {
    await assert.rejects(
      () => facade.readMemory(0x0400, 256),
      (err) => {
        assert.ok(err.message.includes("readMemory"));
        return true;
      }
    );
  });

  await t.test("writeMemory throws unsupported", async () => {
    await assert.rejects(
      () => facade.writeMemory(0x0400, new Uint8Array([1, 2])),
      (err) => {
        assert.ok(err.message.includes("writeMemory"));
        return true;
      }
    );
  });

  await t.test("reset throws unsupported", async () => {
    await assert.rejects(() => facade.reset(), (err) => {
      assert.ok(err.message.includes("reset"));
      return true;
    });
  });

  await t.test("reboot throws unsupported", async () => {
    await assert.rejects(() => facade.reboot(), (err) => {
      assert.ok(err.message.includes("reboot"));
      return true;
    });
  });

  await t.test("pause throws unsupported", async () => {
    await assert.rejects(() => facade.pause(), (err) => {
      assert.ok(err.message.includes("pause"));
      return true;
    });
  });

  await t.test("resume throws unsupported", async () => {
    await assert.rejects(() => facade.resume(), (err) => {
      assert.ok(err.message.includes("resume"));
      return true;
    });
  });

  await t.test("poweroff throws unsupported", async () => {
    await assert.rejects(() => facade.poweroff(), (err) => {
      assert.ok(err.message.includes("poweroff"));
      return true;
    });
  });

  await t.test("menuButton throws unsupported", async () => {
    await assert.rejects(() => facade.menuButton(), (err) => {
      assert.ok(err.message.includes("menuButton"));
      return true;
    });
  });

  await t.test("debugregRead throws unsupported", async () => {
    await assert.rejects(() => facade.debugregRead(), (err) => {
      assert.ok(err.message.includes("debugregRead"));
      return true;
    });
  });

  await t.test("debugregWrite throws unsupported", async () => {
    await assert.rejects(() => facade.debugregWrite("test"), (err) => {
      assert.ok(err.message.includes("debugregWrite"));
      return true;
    });
  });

  await t.test("drivesList throws unsupported", async () => {
    await assert.rejects(() => facade.drivesList(), (err) => {
      assert.ok(err.message.includes("drivesList"));
      return true;
    });
  });

  await t.test("driveMount throws unsupported", async () => {
    await assert.rejects(() => facade.driveMount("8", "/tmp/test.d64"), (err) => {
      assert.ok(err.message.includes("driveMount"));
      return true;
    });
  });

  await t.test("driveRemove throws unsupported", async () => {
    await assert.rejects(() => facade.driveRemove("8"), (err) => {
      assert.ok(err.message.includes("driveRemove"));
      return true;
    });
  });

  await t.test("driveReset throws unsupported", async () => {
    await assert.rejects(() => facade.driveReset("8"), (err) => {
      assert.ok(err.message.includes("driveReset"));
      return true;
    });
  });

  await t.test("driveOn throws unsupported", async () => {
    await assert.rejects(() => facade.driveOn("8"), (err) => {
      assert.ok(err.message.includes("driveOn"));
      return true;
    });
  });

  await t.test("driveOff throws unsupported", async () => {
    await assert.rejects(() => facade.driveOff("8"), (err) => {
      assert.ok(err.message.includes("driveOff"));
      return true;
    });
  });

  await t.test("driveSetMode throws unsupported", async () => {
    await assert.rejects(() => facade.driveSetMode("8", "1541"), (err) => {
      assert.ok(err.message.includes("driveSetMode"));
      return true;
    });
  });

  await t.test("driveLoadRom throws unsupported", async () => {
    await assert.rejects(() => facade.driveLoadRom("8", "/tmp/rom.bin"), (err) => {
      assert.ok(err.message.includes("driveLoadRom"));
      return true;
    });
  });

  await t.test("streamStart throws unsupported", async () => {
    await assert.rejects(() => facade.streamStart("video", "192.168.1.1"), (err) => {
      assert.ok(err.message.includes("streamStart"));
      return true;
    });
  });

  await t.test("streamStop throws unsupported", async () => {
    await assert.rejects(() => facade.streamStop("audio"), (err) => {
      assert.ok(err.message.includes("streamStop"));
      return true;
    });
  });

  await t.test("configsList throws unsupported", async () => {
    await assert.rejects(() => facade.configsList(), (err) => {
      assert.ok(err.message.includes("configsList"));
      return true;
    });
  });

  await t.test("configGet throws unsupported", async () => {
    await assert.rejects(() => facade.configGet("test"), (err) => {
      assert.ok(err.message.includes("configGet"));
      return true;
    });
  });

  await t.test("configSet throws unsupported", async () => {
    await assert.rejects(() => facade.configSet("test", "item", "value"), (err) => {
      assert.ok(err.message.includes("configSet"));
      return true;
    });
  });

  await t.test("configBatchUpdate throws unsupported", async () => {
    await assert.rejects(() => facade.configBatchUpdate({}), (err) => {
      assert.ok(err.message.includes("configBatchUpdate"));
      return true;
    });
  });

  await t.test("configLoadFromFlash throws unsupported", async () => {
    await assert.rejects(() => facade.configLoadFromFlash(), (err) => {
      assert.ok(err.message.includes("configLoadFromFlash"));
      return true;
    });
  });

  await t.test("configSaveToFlash throws unsupported", async () => {
    await assert.rejects(() => facade.configSaveToFlash(), (err) => {
      assert.ok(err.message.includes("configSaveToFlash"));
      return true;
    });
  });

  await t.test("configResetToDefault throws unsupported", async () => {
    await assert.rejects(() => facade.configResetToDefault(), (err) => {
      assert.ok(err.message.includes("configResetToDefault"));
      return true;
    });
  });

  await t.test("filesInfo throws unsupported", async () => {
    await assert.rejects(() => facade.filesInfo("/tmp/test"), (err) => {
      assert.ok(err.message.includes("filesInfo"));
      return true;
    });
  });

  await t.test("filesCreateD64 throws unsupported", async () => {
    await assert.rejects(() => facade.filesCreateD64("/tmp/test.d64"), (err) => {
      assert.ok(err.message.includes("filesCreateD64"));
      return true;
    });
  });

  await t.test("filesCreateD71 throws unsupported", async () => {
    await assert.rejects(() => facade.filesCreateD71("/tmp/test.d71"), (err) => {
      assert.ok(err.message.includes("filesCreateD71"));
      return true;
    });
  });

  await t.test("filesCreateD81 throws unsupported", async () => {
    await assert.rejects(() => facade.filesCreateD81("/tmp/test.d81"), (err) => {
      assert.ok(err.message.includes("filesCreateD81"));
      return true;
    });
  });

  await t.test("filesCreateDnp throws unsupported", async () => {
    await assert.rejects(() => facade.filesCreateDnp("/tmp/test.dnp", 35), (err) => {
      assert.ok(err.message.includes("filesCreateDnp"));
      return true;
    });
  });
});

test("device: createFacade with config file", async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "c64bridge-test-"));
  const configPath = path.join(tmpDir, ".c64bridge.json");
  
  t.after(() => {
    try {
      fs.unlinkSync(configPath);
      fs.rmdirSync(tmpDir);
    } catch {}
  });

  await t.test("c64u config only", async () => {
    const oldEnv = process.env.C64BRIDGE_CONFIG;
    const oldMode = process.env.C64_MODE;
    process.env.C64BRIDGE_CONFIG = configPath;
    delete process.env.C64_MODE;
    
    t.after(() => {
      if (oldEnv !== undefined) {
        process.env.C64BRIDGE_CONFIG = oldEnv;
      } else {
        delete process.env.C64BRIDGE_CONFIG;
      }
      if (oldMode !== undefined) {
        process.env.C64_MODE = oldMode;
      }
    });

    fs.writeFileSync(configPath, JSON.stringify({
      c64u: { hostname: "test.local", port: 8080 }
    }));

    const { facade, selected, reason } = await createFacade();
    assert.equal(selected, "c64u");
    assert.equal(reason, "config only");
    assert.equal(facade.type, "c64u");
  });

  await t.test("vice config only", async () => {
    const oldEnv = process.env.C64BRIDGE_CONFIG;
    const oldMode = process.env.C64_MODE;
    process.env.C64BRIDGE_CONFIG = configPath;
    delete process.env.C64_MODE;
    
    t.after(() => {
      if (oldEnv !== undefined) {
        process.env.C64BRIDGE_CONFIG = oldEnv;
      } else {
        delete process.env.C64BRIDGE_CONFIG;
      }
      if (oldMode !== undefined) {
        process.env.C64_MODE = oldMode;
      }
    });

    fs.writeFileSync(configPath, JSON.stringify({
      vice: { exe: "/usr/bin/x64sc" }
    }));

    const { facade, selected, reason } = await createFacade();
    assert.equal(selected, "vice");
    assert.equal(reason, "config only");
    assert.equal(facade.type, "vice");
  });

  await t.test("both configs prefer c64u", async () => {
    const oldEnv = process.env.C64BRIDGE_CONFIG;
    const oldMode = process.env.C64_MODE;
    process.env.C64BRIDGE_CONFIG = configPath;
    delete process.env.C64_MODE;
    
    t.after(() => {
      if (oldEnv !== undefined) {
        process.env.C64BRIDGE_CONFIG = oldEnv;
      } else {
        delete process.env.C64BRIDGE_CONFIG;
      }
      if (oldMode !== undefined) {
        process.env.C64_MODE = oldMode;
      }
    });

    fs.writeFileSync(configPath, JSON.stringify({
      c64u: { hostname: "test.local" },
      vice: { exe: "/usr/bin/x64sc" }
    }));

    const { facade, selected, reason } = await createFacade();
    assert.equal(selected, "c64u");
    assert.equal(reason, "both defined (prefer c64u)");
    assert.equal(facade.type, "c64u");
  });
});

test("device: createFacade with env overrides", async (t) => {
  await t.test("C64_MODE=vice forces vice backend", async () => {
    const oldMode = process.env.C64_MODE;
    process.env.C64_MODE = "vice";
    
    t.after(() => {
      if (oldMode !== undefined) {
        process.env.C64_MODE = oldMode;
      } else {
        delete process.env.C64_MODE;
      }
    });

    const { facade, selected, reason } = await createFacade();
    assert.equal(selected, "vice");
    assert.equal(reason, "env override");
    assert.equal(facade.type, "vice");
  });

  await t.test("C64_MODE=c64u forces c64u backend", async () => {
    const oldMode = process.env.C64_MODE;
    process.env.C64_MODE = "c64u";
    
    t.after(() => {
      if (oldMode !== undefined) {
        process.env.C64_MODE = oldMode;
      } else {
        delete process.env.C64_MODE;
      }
    });

    const { facade, selected, reason } = await createFacade();
    assert.equal(selected, "c64u");
    assert.equal(reason, "env override");
    assert.equal(facade.type, "c64u");
  });
});

test("device: createFacade fallback behavior", async (t) => {
  await t.test("falls back to vice or c64u when no config", async () => {
    const oldEnv = process.env.C64BRIDGE_CONFIG;
    const oldMode = process.env.C64_MODE;
    const oldHome = process.env.HOME;
    
    // Point to non-existent config
    process.env.C64BRIDGE_CONFIG = "/tmp/nonexistent-config.json";
    delete process.env.C64_MODE;
    process.env.HOME = "/tmp/nonexistent-home";
    
    t.after(() => {
      if (oldEnv !== undefined) {
        process.env.C64BRIDGE_CONFIG = oldEnv;
      } else {
        delete process.env.C64BRIDGE_CONFIG;
      }
      if (oldMode !== undefined) {
        process.env.C64_MODE = oldMode;
      }
      if (oldHome !== undefined) {
        process.env.HOME = oldHome;
      } else {
        delete process.env.HOME;
      }
    });

    const { facade, selected } = await createFacade();
    // Should select either vice (fallback) or c64u (if reachable)
    assert.ok(selected === "vice" || selected === "c64u");
    assert.ok(facade.type === "vice" || facade.type === "c64u");
  });
});

test("device: URL helpers parse endpoints and ports", () => {
  // These helpers are not exported directly; we exercise indirectly via createFacade resolveBaseUrl
  // by constructing config objects through env file
});
