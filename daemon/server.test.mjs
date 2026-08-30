// @ts-check
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const serverPath = path.resolve("daemon/server.mjs");

/** @type {Array<{ proc: import("node:child_process").ChildProcess; dataDir: string }>} */
const runtimes = [];

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map(stopRuntime));
});

describe("vibe-daemon — running config update", () => {
  it("restarts a running app with its persisted updated configuration", async () => {
    const runtime = await startIsolatedDaemon();

    const created = await request(runtime, "/apps", {
      method: "POST",
      body: {
        name: "Fixture",
        command: process.execPath,
        args: ["-e", "setInterval(() => {}, 60000)"],
        port: 65530
      }
    });
    expect(created.response.ok).toBe(true);
    const app = await created.response.json();

    const invalidControl = await request(runtime, `/apps/${app.id}/control`, {
      method: "POST",
      body: { action: "status" }
    });
    expect(invalidControl.response.status).toBe(400);
    await expect(invalidControl.response.json()).resolves.toEqual({
      error: { code: "invalid_request", message: "action must be start | stop | restart" }
    });

    const started = await request(runtime, `/apps/${app.id}/control`, {
      method: "POST",
      body: { action: "start" }
    });
    expect(started.response.ok).toBe(true);

    const updated = await request(runtime, `/apps/${app.id}`, {
      method: "PATCH",
      body: { name: "Fixture updated" }
    });
    expect(updated.response.ok).toBe(true);
    await expect(updated.response.json()).resolves.toMatchObject({
      id: app.id,
      name: "Fixture updated",
      running: true
    });
  }, 20_000);

  it("applies edited configuration instead of allowing a stale crash timer to restart the old command", async () => {
    const runtime = await startIsolatedDaemon();
    const crashing = `console.error("CRASH_ONCE");setTimeout(()=>process.exit(7),25);`;
    const stable = `console.log("STABLE_AFTER_EDIT");setInterval(()=>{},60000);`;

    const created = await request(runtime, "/apps", {
      method: "POST",
      body: {
        name: "Pending edit fixture",
        command: process.execPath,
        args: ["-e", crashing],
        port: 65529,
        restart: "on-crash"
      }
    });
    const app = await created.response.json();
    await request(runtime, `/apps/${app.id}/control`, {
      method: "POST",
      body: { action: "start" }
    });
    await waitForApp(runtime, app.id, (status) => !status.running && status.restartCount === 1);

    const updated = await request(runtime, `/apps/${app.id}`, {
      method: "PATCH",
      body: { args: ["-e", stable] }
    });
    expect(updated.response.ok).toBe(true);
    await expect(updated.response.json()).resolves.toMatchObject({ running: true });
    await delay(1_300);

    const current = await request(runtime, `/apps/${app.id}`, { method: "GET" });
    await expect(current.response.json()).resolves.toMatchObject({ running: true, restartCount: 0 });
    const logs = await request(runtime, `/apps/${app.id}/logs`, { method: "GET" });
    const logBody = await logs.response.json();
    expect(logBody.logs.filter((line) => line.includes("CRASH_ONCE"))).toHaveLength(1);
    expect(logBody.logs.some((line) => line.includes("STABLE_AFTER_EDIT"))).toBe(true);
  }, 20_000);

  it("cancels a pending supervised restart before deleting an app", async () => {
    const runtime = await startIsolatedDaemon();
    const crashing = `console.error("DELETE_CRASH");setTimeout(()=>process.exit(7),25);`;

    const created = await request(runtime, "/apps", {
      method: "POST",
      body: {
        name: "Pending delete fixture",
        command: process.execPath,
        args: ["-e", crashing],
        port: 65528,
        restart: "on-crash"
      }
    });
    const app = await created.response.json();
    await request(runtime, `/apps/${app.id}/control`, {
      method: "POST",
      body: { action: "start" }
    });
    await waitForApp(runtime, app.id, (status) => !status.running && status.restartCount === 1);

    const deleted = await request(runtime, `/apps/${app.id}`, { method: "DELETE" });
    expect(deleted.response.ok).toBe(true);
    await delay(1_300);

    const logs = await request(runtime, `/apps/${app.id}/logs`, { method: "GET" });
    const logBody = await logs.response.json();
    expect(logBody.logs.filter((line) => line.includes("DELETE_CRASH"))).toHaveLength(0);
  }, 20_000);

  it("keeps logs across daemon restarts and removes them when the app is deleted", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "vd-daemon-durable-"));
    const firstRuntime = await startIsolatedDaemon(dataDir);
    const source = `console.log("DURABLE_LOG_LINE");setInterval(()=>{},60000);`;
    const created = await request(firstRuntime, "/apps", {
      method: "POST",
      body: {
        name: "Durable log fixture",
        command: process.execPath,
        args: ["-e", source],
        port: 65527,
        restart: "no"
      }
    });
    const app = await created.response.json();
    await request(firstRuntime, `/apps/${app.id}/control`, {
      method: "POST",
      body: { action: "start" }
    });
    await waitForLogs(firstRuntime, app.id, "DURABLE_LOG_LINE");

    await stopRuntime(firstRuntime, { removeData: false });
    runtimes.splice(runtimes.indexOf(firstRuntime), 1);
    const secondRuntime = await startIsolatedDaemon(dataDir);
    const persisted = await request(secondRuntime, `/apps/${app.id}/logs`, { method: "GET" });
    await expect(persisted.response.json()).resolves.toMatchObject({
      logs: [expect.stringContaining("DURABLE_LOG_LINE")]
    });

    await request(secondRuntime, `/apps/${app.id}`, { method: "DELETE" });
    const removed = await request(secondRuntime, `/apps/${app.id}/logs`, { method: "GET" });
    await expect(removed.response.json()).resolves.toEqual({ logs: [] });
  }, 20_000);
});

async function waitForApp(runtime, id, predicate) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await request(runtime, `/apps/${id}`, { method: "GET" });
    const status = await result.response.json();
    if (predicate(status)) return status;
    await delay(25);
  }
  throw new Error(`app ${id} did not reach the expected state`);
}

async function waitForLogs(runtime, id, pattern) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await request(runtime, `/apps/${id}/logs`, { method: "GET" });
    const body = await result.response.json();
    if (body.logs.some((line) => line.includes(pattern))) return;
    await delay(25);
  }
  throw new Error(`logs for ${id} did not contain ${pattern}`);
}

/**
 * Starts a daemon with an empty temporary config directory. It never reads the
 * developer's live `.data`, so its only managed process is the Node fixture
 * created by this test.
 */
async function startIsolatedDaemon(existingDataDir) {
  const dataDir = existingDataDir || await mkdtemp(path.join(tmpdir(), "vd-daemon-server-"));
  const proc = spawn(process.execPath, [serverPath], {
    cwd: path.resolve("."),
    env: { ...process.env, VIBE_DAEMON_DATA_DIR: dataDir },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const runtime = { proc, dataDir, port: 0, token: "" };
  runtimes.push(runtime);

  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      const [portRaw, tokenRaw] = await Promise.all([
        readFile(path.join(dataDir, "daemon.port"), "utf8"),
        readFile(path.join(dataDir, "daemon.token"), "utf8")
      ]);
      const port = Number.parseInt(portRaw.trim(), 10);
      const token = tokenRaw.trim();
      if (Number.isInteger(port) && port > 0 && token.length >= 32) {
        runtime.port = port;
        runtime.token = token;
        try {
          const health = await request(runtime, "/health", { method: "GET" });
          if (health.response.ok) return runtime;
        } catch {
          // Port/token files can be from the just-stopped daemon; keep polling
          // until the replacement has actually bound the listener.
        }
      }
    } catch {
      // The daemon has not finished its first-run file writes yet.
    }
    if (proc.exitCode !== null) {
      throw new Error(`isolated daemon exited before becoming ready (${proc.exitCode})`);
    }
    await delay(25);
  }
  throw new Error("isolated daemon did not become ready in time");
}

/**
 * @param {{ port: number; token: string }} runtime
 * @param {string} pathname
 * @param {{ method: string; body?: unknown }} init
 */
async function request(runtime, pathname, init) {
  const response = await fetch(`http://127.0.0.1:${runtime.port}${pathname}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${runtime.token}`,
      ...(init.body === undefined ? {} : { "content-type": "application/json" })
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) })
  });
  return { response };
}

/** @param {{ proc: import("node:child_process").ChildProcess; dataDir: string }} runtime */
async function stopRuntime(runtime, options = {}) {
  if (runtime.proc.exitCode === null) {
    runtime.proc.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => runtime.proc.once("exit", resolve)),
      delay(3_000)
    ]);
    if (runtime.proc.exitCode === null) runtime.proc.kill("SIGKILL");
  }
  if (options.removeData !== false) await rm(runtime.dataDir, { recursive: true, force: true });
}

/** @param {number} ms */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
