// @ts-check
/**
 * ConfigStore — atomic JSON persistence for LocalAppConfig records.
 *
 * File layout: <dataDir>/daemon-config.json
 * Shape: { version: 1, apps: LocalAppConfig[] }
 *
 * Mirrors the atomic-write pattern of src/lib/store.ts (temp file + rename).
 */
import { readFile, writeFile, rename, mkdir, chmod } from "node:fs/promises";
import path from "node:path";

const FILENAME = "daemon-config.json";
const SCHEMA_VERSION = 1;

/** @typedef {{
 *   id: string; name: string; command: string; args?: string[];
 *   cwd?: string; port: number; env?: Record<string, string>;
 *   autoStart?: boolean; restart?: "no" | "on-crash" | "always";
 *   iconKind?: "favicon" | "custom_local" | "fallback";
 *   iconUrl?: string | null;
 *   createdAt: string; updatedAt: string;
 * }} LocalAppConfig */

export class ConfigStore {
  /**
   * @param {string} dataDir
   */
  constructor(dataDir) {
    this.filePath = path.join(dataDir, FILENAME);
    this.dataDir = dataDir;
    // Atomic rename prevents a partial file from being observed, but it does
    // not stop concurrent read-modify-write operations from overwriting each
    // other. The daemon is the single writer, so a per-store queue is the
    // smallest reliable serialization boundary.
    this.mutationTail = Promise.resolve();
  }

  /** @returns {Promise<LocalAppConfig[]>} */
  async load() {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.apps)) return [];
      return parsed.apps.filter(isValidConfig);
    } catch (err) {
      if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") return [];
      throw err;
    }
  }

  async #save(/** @type {LocalAppConfig[]} */ apps) {
    await mkdir(this.dataDir, { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") await chmod(this.dataDir, 0o700);
    const payload = JSON.stringify({ version: SCHEMA_VERSION, apps }, null, 2) + "\n";
    const tmp = `${this.filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await writeFile(tmp, payload, { encoding: "utf8", mode: 0o600 });
    await rename(tmp, this.filePath);
    // App configs can contain local paths, launch recipes, and environment
    // overrides. Keep an existing file private too, even if it was created by
    // an older daemon version with a permissive umask-derived mode.
    if (process.platform !== "win32") await chmod(this.filePath, 0o600);
  }

  /**
   * Serialize read-modify-write mutations without allowing one rejected write
   * to poison later operations in the queue.
   *
   * @template T
   * @param {() => Promise<T>} operation
   * @returns {Promise<T>}
   */
  #mutate(operation) {
    const result = this.mutationTail.then(operation, operation);
    this.mutationTail = result.catch(() => undefined);
    return result;
  }

  /**
   * @param {Partial<LocalAppConfig>} input
   * @returns {Promise<LocalAppConfig>}
   */
  async create(input) {
    return this.#mutate(async () => {
      const apps = await this.load();
      const now = new Date().toISOString();
      const cfg = /** @type {LocalAppConfig} */ ({
        id: crypto.randomUUID(),
        name: requireStr(input.name, "name"),
        command: requireStr(input.command, "command"),
        args: Array.isArray(input.args) ? input.args.filter(Boolean) : undefined,
        cwd: input.cwd || undefined,
        port: requirePort(input.port),
        env: input.env && typeof input.env === "object" ? input.env : undefined,
        autoStart: input.autoStart === true,
        restart: normalizeRestart(input.restart),
        iconKind: normalizeIconKind(input.iconKind),
        iconUrl: normalizeIconUrl(input.iconUrl),
        createdAt: now,
        updatedAt: now,
      });
      apps.push(cfg);
      await this.#save(apps);
      return cfg;
    });
  }

  /**
   * @param {string} id
   * @returns {Promise<LocalAppConfig>}
   */
  async get(id) {
    const apps = await this.load();
    const cfg = apps.find((a) => a.id === id);
    if (!cfg) throw notFound(id);
    return cfg;
  }

  /**
   * @param {string} id
   * @param {Partial<LocalAppConfig>} updates
   * @returns {Promise<LocalAppConfig>}
   */
  async update(id, updates) {
    return this.#mutate(async () => {
      const apps = await this.load();
      const idx = apps.findIndex((a) => a.id === id);
      if (idx < 0) throw notFound(id);
      const current = apps[idx];
      const next = {
        ...current,
        ...(updates.name !== undefined ? { name: requireStr(updates.name, "name") } : {}),
        ...(updates.command !== undefined ? { command: requireStr(updates.command, "command") } : {}),
        ...(updates.args !== undefined ? { args: updates.args.filter(Boolean) } : {}),
        ...(updates.cwd !== undefined ? { cwd: updates.cwd || undefined } : {}),
        ...(updates.port !== undefined ? { port: requirePort(updates.port) } : {}),
        ...(updates.env !== undefined ? { env: updates.env } : {}),
        ...(updates.autoStart !== undefined ? { autoStart: updates.autoStart === true } : {}),
        ...(updates.restart !== undefined ? { restart: normalizeRestart(updates.restart) } : {}),
        ...(updates.iconKind !== undefined ? { iconKind: normalizeIconKind(updates.iconKind) } : {}),
        ...(updates.iconUrl !== undefined ? { iconUrl: normalizeIconUrl(updates.iconUrl) } : {}),
        updatedAt: new Date().toISOString(),
      };
      apps[idx] = next;
      await this.#save(apps);
      return next;
    });
  }

  /**
   * @param {string} id
   */
  async remove(id) {
    return this.#mutate(async () => {
      const apps = await this.load();
      const next = apps.filter((a) => a.id !== id);
      if (next.length === apps.length) throw notFound(id);
      await this.#save(next);
    });
  }
}

/** @param {unknown} v @returns {string} */
function requireStr(v, field) {
  if (typeof v !== "string" || !v.trim()) {
    throw Object.assign(new Error(`${field} is required`), { code: "invalid_request" });
  }
  return v.trim();
}

/** @param {unknown} v @returns {number} */
function requirePort(v) {
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n) || n < 1 || n > 65535) {
    throw Object.assign(new Error("port must be 1..65535"), { code: "invalid_request" });
  }
  return n;
}

/** @param {unknown} v @returns {"no" | "on-crash" | "always"} */
function normalizeRestart(v) {
  return v === "always" || v === "on-crash" ? v : "no";
}

/**
 * Local apps only use a subset of IconKind: a URL-backed icon (catalog SVG or
 * favicon), a browser-uploaded icon (custom_local), or initials (fallback).
 * @param {unknown} v @returns {"favicon" | "custom_local" | "fallback"}
 */
function normalizeIconKind(v) {
  return v === "favicon" || v === "custom_local" ? v : "fallback";
}

/** @param {unknown} v @returns {string | null} */
function normalizeIconUrl(v) {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed ? trimmed : null;
}

/** @param {string} id */
function notFound(id) {
  return Object.assign(new Error(`app ${id} not found`), { code: "not_found" });
}

/** @param {unknown} v @returns {boolean} */
function isValidConfig(v) {
  return v && typeof v === "object" && typeof v.id === "string" && typeof v.command === "string" && typeof v.port === "number";
}
