import test from "#test/runner";
import assert from "#test/assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createFacade } from "../src/device.js";
import { startViceMockServer } from "../src/vice/mockServer.js";

test("device: ViceBackend basic operations", async (t) => {
  const server = await startViceMockServer({ host: "127.0.0.1", port: 0 });
  const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), "vice-config-"));
  const cfgPath = path.join(cfgDir, "c64bridge.json");
  fs.writeFileSync(cfgPath, JSON.stringify({ vice: { host: "127.0.0.1", port: server.port } }), "utf8");

  const oldConfig = process.env.C64BRIDGE_CONFIG;
  const oldMode = process.env.C64_MODE;
  process.env.C64BRIDGE_CONFIG = cfgPath;
  process.env.C64_MODE = "vice";

  t.after(async () => {
    await server.stop();
    if (oldConfig !== undefined) {
      process.env.C64BRIDGE_CONFIG = oldConfig;
    } else {
      delete process.env.C64BRIDGE_CONFIG;
    }
    if (oldMode !== undefined) {
      process.env.C64_MODE = oldMode;
    } else {
      delete process.env.C64_MODE;
    }
    fs.rmSync(cfgDir, { recursive: true, force: true });
  });

  const { facade } = await createFacade();

  await t.test("ping succeeds", async () => {
    assert.equal(await facade.ping(), true);
  });

  await t.test("version returns endpoint info", async () => {
    const version = await facade.version();
    assert.deepEqual(version, { emulator: "vice", host: "127.0.0.1", port: server.port });
  });

  await t.test("info returns endpoint info", async () => {
    const info = await facade.info();
    assert.deepEqual(info, { emulator: "vice", host: "127.0.0.1", port: server.port });
  });

  await t.test("readMemory returns READY.", async () => {
    const data = await facade.readMemory(0x0400, 6);
    assert.deepEqual(Array.from(data), [0x12, 0x05, 0x01, 0x04, 0x19, 0x2E]);
  });

  await t.test("writeMemory updates memory", async () => {
    await facade.writeMemory(0x0400, new Uint8Array([0x01, 0x02]));
    const data = await facade.readMemory(0x0400, 2);
    assert.deepEqual(Array.from(data), [0x01, 0x02]);
  });

  await t.test("reset restores screen", async () => {
    await facade.writeMemory(0x0400, new Uint8Array([0x00, 0x00]));
    await facade.reset();
    const data = await facade.readMemory(0x0400, 6);
    assert.deepEqual(Array.from(data), [0x12, 0x05, 0x01, 0x04, 0x19, 0x2E]);
  });

  await t.test("pause/resume return success", async () => {
    assert.deepEqual(await facade.pause(), { success: true });
    assert.deepEqual(await facade.resume(), { success: true });
  });

  await t.test("loadPrgFile throws unsupported", async () => {
    await assert.rejects(() => facade.loadPrgFile("/tmp/test.prg"));
  });

  await t.test("runCrtFile throws unsupported", async () => {
    await assert.rejects(() => facade.runCrtFile("/tmp/test.crt"));
  });

  await t.test("sidplayFile throws unsupported", async () => {
    await assert.rejects(() => facade.sidplayFile("/tmp/test.sid"));
  });

  await t.test("sidplayAttachment throws unsupported", async () => {
    await assert.rejects(() => facade.sidplayAttachment(new Uint8Array([1, 2, 3])));
  });

  await t.test("poweroff throws unsupported", async () => {
    await assert.rejects(() => facade.poweroff());
  });

  await t.test("menuButton throws unsupported", async () => {
    await assert.rejects(() => facade.menuButton());
  });
});
