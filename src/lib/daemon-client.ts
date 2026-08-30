import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { DaemonHealth, IconKind, LocalAppConfig, LocalAppStatus, LocalAppView } from "@/lib/contracts";

/**
 * Server-side client for vibe-daemon.
 *
 * Reads the token + port files written by `npm run daemon` and forwards
 * authenticated requests. Browser code MUST NOT use this — it has no
 * access to the token file. All browser calls go through /api/local-apps/*.
 */

export class DaemonUnreachableError extends Error {
  readonly code = "daemon_unreachable" as const;
  constructor(
    message = "vibe-daemon is not running. Start it with: npm run daemon",
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "DaemonUnreachableError";
  }
}

export class DaemonTimeoutError extends Error {
  readonly code = "daemon_timeout" as const;
  constructor(message = "vibe-daemon request timed out (is the daemon responsive?).", options?: ErrorOptions) {
    super(message, options);
    this.name = "DaemonTimeoutError";
  }
}

export class DaemonApiError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "DaemonApiError";
  }
}

interface DaemonEndpoint {
  port: number;
  token: string;
}

let endpointOverride: DaemonEndpoint | null | undefined;
let testDataDir: string | undefined;

function daemonDataDirs(): string[] {
  if (testDataDir) return [testDataDir];
  const override = process.env.VIBE_DAEMON_DATA_DIR?.trim();
  if (override) return [path.resolve(override)];

  const configuredDataHome = process.env.XDG_DATA_HOME?.trim();
  const dataHome = configuredDataHome && path.isAbsolute(configuredDataHome)
    ? configuredDataHome
    : path.join(os.homedir(), ".local", "share");

  // The installed daemon is the durable owner used by the add_app Skill and
  // login service. Repository .data remains a development fallback.
  return [
    path.join(dataHome, "vibed-vibedesktop"),
    path.resolve(process.cwd(), ".data")
  ];
}

async function readEndpoint(): Promise<DaemonEndpoint | null> {
  if (endpointOverride !== undefined) return endpointOverride;
  for (const dataDir of daemonDataDirs()) {
    try {
      const [portRaw, tokenRaw] = await Promise.all([
        readFile(path.join(dataDir, "daemon.port"), "utf8"),
        readFile(path.join(dataDir, "daemon.token"), "utf8")
      ]);
      const port = Number.parseInt(portRaw.trim(), 10);
      const token = tokenRaw.trim();
      if (Number.isInteger(port) && port >= 1 && port <= 65535 && token.length >= 32) {
        return { port, token };
      }
    } catch {
      // Try the next owner path.
    }
  }
  return null;
}

/** Test harness hook: force the endpoint for unit tests. */
export function __setDaemonEndpointForTests(endpoint: DaemonEndpoint | null | undefined): void {
  endpointOverride = endpoint;
}

/** Test harness hook: isolate endpoint-file discovery from the user's .data directory. */
export function __setDaemonDataDirForTests(dataDir: string | undefined): void {
  testDataDir = dataDir;
}

/**
 * The daemon merges status fields flat into each config object (running,
 * pid, startedAt, url, lastExitCode, lastError). This is the raw wire shape.
 */
type DaemonAppWire = LocalAppConfig & {
  running?: boolean;
  pid?: number | null;
  startedAt?: string | null;
  url?: string;
  lastExitCode?: number | null;
  lastError?: string | null;
  restartCount?: number;
  healthy?: boolean;
  cpuPercent?: number;
  memoryBytes?: number;
  processCount?: number;
  readBytes?: number;
  writeBytes?: number;
  sampledAt?: string | null;
};

async function daemonFetch<T>(pathname: string, init?: RequestInit): Promise<T> {
  // Endpoint discovery is intentionally uncached: a daemon can appear after
  // Next.js starts, and a restart may select a different loopback port.
  const ep = await readEndpoint();
  if (!ep) throw new DaemonUnreachableError();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`http://127.0.0.1:${ep.port}${pathname}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${ep.token}`,
        ...(init?.headers ?? {})
      }
    });

    const body = (await res.json()) as T & { error?: { code: string; message: string } };

    if (!res.ok) {
      const code = body.error?.code ?? "daemon_error";
      const message = body.error?.message ?? `daemon returned ${res.status}`;
      throw new DaemonApiError(code, message);
    }

    return body as T;
  } catch (error) {
    if (error instanceof DaemonApiError) throw error;
    if (error instanceof DaemonUnreachableError) throw error;
    // Our explicit AbortController fires only on the request timeout above.
    if (error instanceof Error && error.name === "AbortError") {
      throw new DaemonTimeoutError();
    }
    // Connection refused, DNS, JSON parse failure, etc. — preserve the cause
    // so callers (and logs) can still see what actually went wrong.
    throw new DaemonUnreachableError(undefined, { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

function toView(raw: DaemonAppWire): LocalAppView {
  const {
    running, pid, startedAt, url, lastExitCode, lastError, restartCount, healthy,
    cpuPercent, memoryBytes, processCount, readBytes, writeBytes, sampledAt,
    ...config
  } = raw;
  const status: LocalAppStatus = {
    id: config.id,
    running: running ?? false,
    pid: pid ?? null,
    startedAt: startedAt ?? null,
    url: url ?? "",
    lastExitCode: lastExitCode ?? null,
    lastError: lastError ?? null,
    restartCount: restartCount ?? 0,
    healthy: healthy ?? false,
    cpuPercent: cpuPercent ?? 0,
    memoryBytes: memoryBytes ?? 0,
    processCount: processCount ?? 0,
    readBytes: readBytes ?? 0,
    writeBytes: writeBytes ?? 0,
    sampledAt: sampledAt ?? null
  };
  return { ...config, status };
}

/* ------------------------------------------------------------------ *
 * Public API — mirrors the daemon's REST surface
 * ------------------------------------------------------------------ */

export async function getDaemonHealth(): Promise<DaemonHealth> {
  try {
    return await daemonFetch<DaemonHealth>("/health");
  } catch (error) {
    // A daemon that is down OR unresponsive is, from the UI's perspective,
    // simply not healthy.
    if (error instanceof DaemonUnreachableError || error instanceof DaemonTimeoutError) {
      return { ok: false };
    }
    throw error;
  }
}

export async function listLocalApps(): Promise<LocalAppView[]> {
  const body = await daemonFetch<{ apps: DaemonAppWire[] }>("/apps");
  return body.apps.map(toView);
}

export async function getLocalApp(id: string): Promise<LocalAppView> {
  const raw = await daemonFetch<DaemonAppWire>(`/apps/${id}`);
  return toView(raw);
}

export async function createLocalApp(input: {
  name: string;
  command: string;
  args?: string[];
  cwd?: string;
  port: number;
  env?: Record<string, string>;
  autoStart?: boolean;
  restart?: "no" | "on-crash" | "always";
  iconKind?: IconKind;
  iconUrl?: string | null;
}): Promise<LocalAppView> {
  const raw = await daemonFetch<DaemonAppWire>("/apps", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return toView(raw);
}

export async function updateLocalApp(
  id: string,
  updates: Partial<{
    name: string;
    command: string;
    args: string[];
    cwd: string;
    port: number;
    env: Record<string, string>;
    autoStart: boolean;
    restart: "no" | "on-crash" | "always";
    iconKind: IconKind;
    iconUrl: string | null;
  }>
): Promise<LocalAppView> {
  const raw = await daemonFetch<DaemonAppWire>(`/apps/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(updates)
  });
  return toView(raw);
}

export async function deleteLocalApp(id: string): Promise<void> {
  await daemonFetch<{ deleted: string }>(`/apps/${id}`, { method: "DELETE" });
}

export async function controlLocalApp(
  id: string,
  action: "start" | "stop" | "restart"
): Promise<LocalAppView> {
  const raw = await daemonFetch<DaemonAppWire>(`/apps/${id}/control`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action })
  });
  return toView(raw);
}

export async function getLocalAppLogs(id: string): Promise<string[]> {
  const body = await daemonFetch<{ logs: string[] }>(`/apps/${id}/logs`);
  return body.logs ?? [];
}
