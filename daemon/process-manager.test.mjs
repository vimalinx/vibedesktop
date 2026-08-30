// @ts-check
import { describe, expect, it } from "vitest";
import { createServer } from "node:net";
import { ProcessManager } from "./process-manager.mjs";

/**
 * Regression test for the process-group teardown fix.
 *
 * A launcher like `npm run dev` forks a child (node) and waits on it. Killing
 * only the direct child used to orphan the grandchild, which kept holding the
 * port. With `detached: true` + group kill, stop() must reap the whole tree.
 */

/** @param {number | null | undefined} pid */
function isAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Stays alive, spawns a long-lived grandchild, prints its pid, then idles.
const LAUNCHER = `const{spawn}=require("child_process");const c=spawn(process.execPath,["-e","setInterval(()=>{},60000)"],{stdio:"ignore"});console.log("GPID="+c.pid);setInterval(()=>{},1000);`;
const HTTP_APP = `const http=require("http");const port=Number(process.argv[1]);http.createServer((_req,res)=>res.end("ok")).listen(port,"127.0.0.1",()=>console.log("READY"));setInterval(()=>{},1000);`;
const CRASHING_APP = `console.error("INTENTIONAL_CRASH");setTimeout(()=>process.exit(7),25);`;

describe("ProcessManager — process-group teardown", () => {
  it("kills the launcher and its grandchild together", async () => {
    const manager = new ProcessManager();
    try {
      await manager.start({
        id: "launcher",
        name: "Launcher",
        command: process.execPath,
        args: ["-e", LAUNCHER],
        cwd: undefined,
        port: 0,
        env: {},
        autoStart: false,
        createdAt: "ts",
        updatedAt: "ts"
      });

      const runtime = manager.runtimes.get("launcher");
      const launcherPid = runtime?.proc.pid ?? null;
      expect(isAlive(launcherPid)).toBe(true);

      // Poll captured logs until the launcher reports its grandchild's pid.
      let grandchildPid = null;
      for (let i = 0; i < 80 && !grandchildPid; i += 1) {
        const match = (await manager.getLogs("launcher")).join("\n").match(/GPID=(\d+)/);
        if (match) grandchildPid = Number(match[1]);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(grandchildPid).not.toBeNull();
      expect(isAlive(grandchildPid)).toBe(true);
      await manager._sampleMetrics();
      expect(manager.withStatus({ id: "launcher", port: 0 }).processCount).toBeGreaterThanOrEqual(2);

      await manager.stop("launcher");
      // Give the kernel a beat to reap the group.
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(isAlive(launcherPid)).toBe(false);
      expect(isAlive(grandchildPid)).toBe(false);
    } finally {
      await manager.stopAll();
    }
  }, 20000);
});

describe("ProcessManager — serialized local control", () => {
  it("runs one process for duplicate starts and reports health, logs, restart, and stop", async () => {
    const manager = new ProcessManager();
    const port = await findUnusedPort();
    const cfg = {
      id: "http-app",
      name: "HTTP fixture",
      command: process.execPath,
      args: ["-e", HTTP_APP, String(port)],
      cwd: undefined,
      port,
      env: {},
      autoStart: false,
      createdAt: "ts",
      updatedAt: "ts"
    };

    try {
      await Promise.all([
        manager.control(cfg.id, "start", cfg),
        manager.control(cfg.id, "start", cfg)
      ]);
      await waitFor(async () => (await manager.getLogs(cfg.id)).some((line) => line.includes("READY")));
      const firstPid = manager.withStatus(cfg).pid;
      expect(firstPid).toEqual(expect.any(Number));
      expect((await manager.getLogs(cfg.id)).join("\n")).toContain("READY");

      await manager._probeHealth();
      expect(manager.withStatus(cfg)).toMatchObject({ running: true, healthy: true });
      await manager._sampleMetrics();
      expect(manager.withStatus(cfg)).toMatchObject({
        processCount: expect.any(Number),
        memoryBytes: expect.any(Number),
        cpuPercent: expect.any(Number)
      });
      expect(manager.withStatus(cfg).processCount).toBeGreaterThanOrEqual(1);
      expect(manager.withStatus(cfg).memoryBytes).toBeGreaterThan(0);

      await manager.control(cfg.id, "restart", cfg);
      await waitFor(async () => (await manager.getLogs(cfg.id)).filter((line) => line.includes("READY")).length >= 2);
      expect(manager.withStatus(cfg)).toMatchObject({ running: true, healthy: false });
      expect(manager.withStatus(cfg).pid).not.toBe(firstPid);

      await manager.control(cfg.id, "stop");
      expect(manager.withStatus(cfg)).toMatchObject({ running: false, pid: null });
    } finally {
      await manager.stopAll();
      manager.stopHealthMonitor();
    }
  }, 20_000);

  it("cancels a pending supervised restart when the user stops a crashed app", async () => {
    const manager = new ProcessManager();
    const cfg = {
      id: "crashing-app",
      name: "Crashing fixture",
      command: process.execPath,
      args: ["-e", CRASHING_APP],
      cwd: undefined,
      port: await findUnusedPort(),
      env: {},
      autoStart: false,
      restart: "on-crash",
      createdAt: "ts",
      updatedAt: "ts"
    };

    try {
      await manager.control(cfg.id, "start", cfg);
      await waitFor(() => manager.withStatus(cfg).restartCount === 1);
      await manager.control(cfg.id, "stop");
      await new Promise((resolve) => setTimeout(resolve, 1_300));

      expect(manager.withStatus(cfg)).toMatchObject({ running: false, pid: null, restartCount: 0 });
      expect((await manager.getLogs(cfg.id)).filter((line) => line.includes("INTENTIONAL_CRASH"))).toHaveLength(1);
    } finally {
      await manager.stopAll();
      manager.stopHealthMonitor();
    }
  }, 10_000);
});

async function findUnusedPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("could not reserve a local test port");
  }
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}

/** @param {() => boolean | Promise<boolean>} condition */
async function waitFor(condition) {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("timed out waiting for local process fixture");
}
