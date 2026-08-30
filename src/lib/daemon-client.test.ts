import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __setDaemonDataDirForTests,
  __setDaemonEndpointForTests,
  controlLocalApp,
  DaemonApiError,
  DaemonTimeoutError,
  DaemonUnreachableError,
  getDaemonHealth,
  getLocalApp,
  listLocalApps
} from "@/lib/daemon-client";

const realFetch = globalThis.fetch;

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body
  };
}

function stubFetch(impl: (...args: unknown[]) => Promise<unknown>): void {
  globalThis.fetch = vi.fn(impl) as unknown as typeof fetch;
}

afterEach(() => {
  __setDaemonEndpointForTests(null);
  __setDaemonDataDirForTests(undefined);
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

const ENDPOINT = { port: 7780, token: "t".repeat(32) };

describe("daemon-client — health", () => {
  it("reports not-healthy when no daemon endpoint is configured", async () => {
    __setDaemonEndpointForTests(null);
    await expect(getDaemonHealth()).resolves.toEqual({ ok: false });
  });

  it("maps a healthy daemon response and sends the bearer token", async () => {
    __setDaemonEndpointForTests(ENDPOINT);
    const mock = vi.fn(async () => jsonResponse({ ok: true, version: "0.1.0", uptime: 42 }));
    globalThis.fetch = mock as unknown as typeof fetch;

    const health = await getDaemonHealth();
    expect(health).toEqual({ ok: true, version: "0.1.0", uptime: 42 });

    expect(mock).toHaveBeenCalledOnce();
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:7780/health");
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${ENDPOINT.token}` });
  });

  it("discovers an endpoint that appears after an earlier missing read", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "vd-daemon-client-"));
    try {
      __setDaemonEndpointForTests(undefined);
      __setDaemonDataDirForTests(dataDir);
      await expect(getDaemonHealth()).resolves.toEqual({ ok: false });

      await Promise.all([
        writeFile(path.join(dataDir, "daemon.port"), "7781\n", "utf8"),
        writeFile(path.join(dataDir, "daemon.token"), "l".repeat(32), "utf8")
      ]);
      const mock = vi.fn(async () => jsonResponse({ ok: true, version: "0.1.0", uptime: 1 }));
      globalThis.fetch = mock as unknown as typeof fetch;

      await expect(getDaemonHealth()).resolves.toEqual({ ok: true, version: "0.1.0", uptime: 1 });
      expect(mock).toHaveBeenCalledWith("http://127.0.0.1:7781/health", expect.any(Object));
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it("rereads endpoint files after a stale daemon connection fails", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "vd-daemon-client-"));
    try {
      __setDaemonEndpointForTests(undefined);
      __setDaemonDataDirForTests(dataDir);
      await Promise.all([
        writeFile(path.join(dataDir, "daemon.port"), "7781\n", "utf8"),
        writeFile(path.join(dataDir, "daemon.token"), "o".repeat(32), "utf8")
      ]);

      const mock = vi.fn(async (url: string) => {
        if (url.includes(":7781/")) throw new TypeError("fetch failed");
        return jsonResponse({ ok: true, version: "0.1.0", uptime: 2 });
      });
      globalThis.fetch = mock as unknown as typeof fetch;

      await expect(getDaemonHealth()).resolves.toEqual({ ok: false });
      await Promise.all([
        writeFile(path.join(dataDir, "daemon.port"), "7782\n", "utf8"),
        writeFile(path.join(dataDir, "daemon.token"), "n".repeat(32), "utf8")
      ]);

      await expect(getDaemonHealth()).resolves.toEqual({ ok: true, version: "0.1.0", uptime: 2 });
      expect(mock.mock.calls.map(([url]) => url)).toEqual([
        "http://127.0.0.1:7781/health",
        "http://127.0.0.1:7782/health"
      ]);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });
});

describe("daemon-client — wire mapping", () => {
  it("splits the daemon's flat wire shape into config + status via toView", async () => {
    __setDaemonEndpointForTests(ENDPOINT);
    stubFetch(async () =>
      jsonResponse({
        apps: [
          {
            id: "a",
            name: "Foo",
            command: "node",
            args: ["a.js"],
            cwd: "/tmp",
            port: 3000,
            env: { X: "1" },
            autoStart: false,
            createdAt: "ts",
            updatedAt: "ts",
            running: true,
            pid: 123,
            startedAt: "s",
            url: "http://127.0.0.1:3000",
            lastExitCode: null,
            lastError: null
          }
        ]
      })
    );

    const apps = await listLocalApps();
    expect(apps).toHaveLength(1);
    const [app] = apps;
    expect(app.name).toBe("Foo");
    expect(app.env).toEqual({ X: "1" });
    expect(app.status.running).toBe(true);
    expect(app.status.pid).toBe(123);
    expect(app.status.url).toBe("http://127.0.0.1:3000");
    expect(app.status.lastExitCode).toBeNull();
  });

  it("defaults missing status fields on the wire", async () => {
    __setDaemonEndpointForTests(ENDPOINT);
    stubFetch(async () =>
      jsonResponse({
        id: "a",
        name: "Foo",
        command: "node",
        port: 3000,
        createdAt: "ts",
        updatedAt: "ts"
      })
    );

    const app = await getLocalApp("a");
    expect(app.status).toEqual({
      id: "a",
      running: false,
      pid: null,
      startedAt: null,
      url: "",
      lastExitCode: null,
      lastError: null,
      restartCount: 0,
      healthy: false,
      cpuPercent: 0,
      memoryBytes: 0,
      processCount: 0,
      readBytes: 0,
      writeBytes: 0,
      sampledAt: null
    });
  });
});

describe("daemon-client — error mapping", () => {
  it("raises DaemonApiError on non-ok responses and preserves the daemon code", async () => {
    __setDaemonEndpointForTests(ENDPOINT);
    stubFetch(async () =>
      jsonResponse({ error: { code: "not_found", message: "no such app" } }, { ok: false, status: 404 })
    );

    await expect(getLocalApp("missing")).rejects.toBeInstanceOf(DaemonApiError);
    await expect(getLocalApp("missing")).rejects.toMatchObject({ name: "DaemonApiError", code: "not_found" });
  });

  it("raises DaemonTimeoutError when the request is aborted", async () => {
    __setDaemonEndpointForTests(ENDPOINT);
    const aborted = new Error("aborted");
    aborted.name = "AbortError";
    stubFetch(async () => {
      throw aborted;
    });

    await expect(controlLocalApp("a", "restart")).rejects.toBeInstanceOf(DaemonTimeoutError);
  });

  it("raises DaemonUnreachableError on connection failure and keeps the cause", async () => {
    __setDaemonEndpointForTests(ENDPOINT);
    const cause = new TypeError("fetch failed");
    stubFetch(async () => {
      throw cause;
    });

    try {
      await listLocalApps();
      throw new Error("expected daemon-client to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(DaemonUnreachableError);
      expect((error as DaemonUnreachableError).cause).toBe(cause);
    }
  });

  it("treats an unreachable daemon as not-healthy (no throw)", async () => {
    __setDaemonEndpointForTests(ENDPOINT);
    stubFetch(async () => {
      throw new TypeError("fetch failed");
    });

    await expect(getDaemonHealth()).resolves.toEqual({ ok: false });
  });
});
