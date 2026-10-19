import { execFile } from "node:child_process";
import { readFile, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { LocalAppBundle, LocalAppBundleService, LocalAppImportPlan, LocalAppImportResult } from "@/lib/contracts";

const MAX_OUTPUT_BYTES = 1024 * 1024;
const MAX_BUNDLE_FILE_BYTES = 256 * 1024;
const PLAN_TIMEOUT_MS = 30_000;
// Registration plus `--start` waits up to 30s for health inside add.py.
const IMPORT_TIMEOUT_MS = 90_000;

export type LocalAppImportErrorCode =
  | "invalid_request"
  | "not_detected"
  | "already_registered"
  | "conflict"
  | "daemon_unreachable"
  | "rolled_back"
  | "import_failed";

export class LocalAppImportError extends Error {
  constructor(
    readonly code: LocalAppImportErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "LocalAppImportError";
  }
}

export function localAppImportErrorStatus(code: LocalAppImportErrorCode): number {
  if (code === "invalid_request" || code === "not_detected") return 400;
  if (code === "already_registered" || code === "conflict") return 409;
  if (code === "daemon_unreachable") return 503;
  return 502;
}

type AddRunner = (scriptPath: string, args: string[], timeoutMs: number) => Promise<string>;

export interface LocalAppImportOptions {
  projectRoot?: string;
  run?: AddRunner;
}

/** Read-only: detect services, allocate ports, and report the bundle that would be generated. */
export async function planLocalAppImport(
  input: { path: string; name?: string },
  options: LocalAppImportOptions = {}
): Promise<LocalAppImportPlan> {
  const result = await runAdd([projectPath(input.path), "--plan", ...nameArgs(input.name)], PLAN_TIMEOUT_MS, options);
  if (result.status !== "planned") throw new LocalAppImportError("import_failed", "The importer returned an unexpected result.");
  return normalizePlan(result.plan);
}

/** Generate, register, and optionally start-and-verify one project bundle. add.py rolls back failures. */
export async function importLocalAppProject(
  input: { path: string; name?: string; start: boolean },
  options: LocalAppImportOptions = {}
): Promise<LocalAppImportResult> {
  const args = [projectPath(input.path), ...(input.start ? ["--start"] : []), ...nameArgs(input.name)];
  const result = await runAdd(args, IMPORT_TIMEOUT_MS, options);
  if (result.status !== "registered" && result.status !== "started") {
    throw new LocalAppImportError("import_failed", "The importer returned an unexpected result.");
  }
  const appId = boundedString(result.appId, 160);
  const manifestPath = boundedString(result.manifestPath, 4096);
  if (!appId || !manifestPath) throw new LocalAppImportError("import_failed", "The importer did not report the registered app.");
  return {
    status: result.status,
    appId,
    manifestPath,
    url: boundedString(result.url, 2048),
    plan: normalizePlan(result.plan)
  };
}

/**
 * The bundle behind a project-imported app, located through the wrapper the daemon runs.
 * Only `<managed root>/<bundle>/run.sh` qualifies, so this never reads arbitrary files.
 */
export async function readLocalAppBundle(command: string, env: NodeJS.ProcessEnv = process.env): Promise<LocalAppBundle | null> {
  if (!path.isAbsolute(command) || path.basename(command) !== "run.sh") return null;
  let root: string;
  let scriptPath: string;
  try {
    root = await realpath(managedAppsRoot(env));
    scriptPath = await realpath(command);
  } catch {
    return null;
  }
  const bundleDir = path.dirname(scriptPath);
  if (path.dirname(bundleDir) !== root) return null;

  const manifestPath = path.join(bundleDir, "manifest.json");
  let manifest: Record<string, unknown>;
  let script: string;
  try {
    [manifest, script] = await Promise.all([
      readBounded(manifestPath).then((text) => JSON.parse(text) as Record<string, unknown>),
      readBounded(scriptPath)
    ]);
  } catch {
    return null;
  }
  const services = normalizeServices(manifest.services);
  const projectRoot = boundedString(manifest.projectRoot, 4096);
  if (!projectRoot || services.length === 0) return null;
  return {
    manifestPath,
    scriptPath,
    projectRoot,
    generatedAt: boundedString(manifest.generatedAt, 64),
    services,
    script
  };
}

/** Remove the generated bundle after its daemon registration is gone; other commands are left alone. */
export async function removeLocalAppBundle(command: string, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const bundle = await readLocalAppBundle(command, env);
  if (!bundle) return false;
  await rm(path.dirname(bundle.scriptPath), { recursive: true, force: true });
  return true;
}

/** Mirrors `managed_root()` in add_app/manager.py. */
export function managedAppsRoot(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.VIBE_MANAGED_APPS_DIR?.trim();
  if (override) return path.resolve(expandHome(override));
  const dataHome = env.XDG_DATA_HOME?.trim();
  const base = dataHome && path.isAbsolute(dataHome) ? dataHome : path.join(os.homedir(), ".local", "share");
  return path.join(base, "vibedesktop", "managed-apps");
}

function projectPath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 4096 || trimmed.includes("\0")) {
    throw new LocalAppImportError("invalid_request", "Enter a project directory.");
  }
  const expanded = expandHome(trimmed);
  // A relative path would resolve against the desktop server's own directory.
  if (!path.isAbsolute(expanded)) {
    throw new LocalAppImportError("invalid_request", "Use an absolute project directory, or one starting with ~/.");
  }
  return path.resolve(expanded);
}

function nameArgs(name: string | undefined): string[] {
  const trimmed = name?.trim();
  if (!trimmed) return [];
  if (trimmed.length > 160) throw new LocalAppImportError("invalid_request", "The name is too long.");
  return ["--name", trimmed];
}

function expandHome(value: string): string {
  if (value === "~") return os.homedir();
  return value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
}

async function runAdd(args: string[], timeoutMs: number, options: LocalAppImportOptions): Promise<Record<string, unknown>> {
  const scriptPath = path.join(options.projectRoot ?? process.cwd(), ".claude", "skills", "add_app", "add.py");
  const run = options.run ?? defaultRunner;
  let stdout: string;
  try {
    stdout = await run(scriptPath, [...args, "--json"], timeoutMs);
  } catch (error) {
    // add.py exits non-zero for refused imports but still prints its JSON verdict.
    const output = (error as { stdout?: unknown }).stdout;
    if (typeof output !== "string" || !output.trim()) {
      throw new LocalAppImportError("import_failed", "The project importer could not run.", { cause: error });
    }
    stdout = output;
  }

  let result: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(stdout.trim().split("\n").at(-1) ?? "");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    result = parsed as Record<string, unknown>;
  } catch (error) {
    throw new LocalAppImportError("import_failed", "The project importer returned invalid output.", { cause: error });
  }
  if (result.ok === true) return result;

  const message = boundedString(result.message, 2000) ?? "The project could not be imported.";
  const status = result.status;
  const code: LocalAppImportErrorCode =
    status === "not_detected" || status === "already_registered" || status === "conflict" ||
    status === "daemon_unreachable" || status === "rolled_back"
      ? status
      : "import_failed";
  throw new LocalAppImportError(code, message);
}

async function defaultRunner(scriptPath: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "python3",
      [scriptPath, ...args],
      { cwd: path.dirname(scriptPath), timeout: timeoutMs, maxBuffer: MAX_OUTPUT_BYTES, encoding: "utf8" },
      (error, stdout) => {
        if (error) reject(Object.assign(error, { stdout }));
        else resolve(stdout);
      }
    );
  });
}

async function readBounded(file: string): Promise<string> {
  const text = await readFile(file, "utf8");
  if (Buffer.byteLength(text) > MAX_BUNDLE_FILE_BYTES) throw new Error("bundle file too large");
  return text;
}

function normalizePlan(value: unknown): LocalAppImportPlan {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const name = boundedString(raw.name, 160);
  const projectRoot = boundedString(raw.projectRoot, 4096);
  const bundleDir = boundedString(raw.bundleDir, 4096);
  const services = normalizeServices(raw.services);
  if (!name || !projectRoot || !bundleDir || services.length === 0) {
    throw new LocalAppImportError("import_failed", "The importer returned an incomplete plan.");
  }
  const notes = Array.isArray(raw.notes)
    ? raw.notes.slice(0, 20).map((note) => boundedString(note, 500)).filter((note): note is string => note !== null)
    : [];
  return { name, projectRoot, bundleDir, services, notes };
}

function normalizeServices(value: unknown): LocalAppBundleService[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).flatMap((item, index): LocalAppBundleService[] => {
    if (!item || typeof item !== "object") return [];
    const raw = item as Record<string, unknown>;
    const name = boundedString(raw.name, 160);
    const command = boundedString(raw.command, 1000);
    const cwd = boundedString(raw.cwd, 4096);
    const port = Number(raw.port);
    if (!name || !command || !cwd || !Number.isInteger(port) || port < 1 || port > 65535) return [];
    const args = Array.isArray(raw.args)
      ? raw.args.slice(0, 100).filter((arg): arg is string => typeof arg === "string" && arg.length <= 4000)
      : [];
    return [{
      name,
      role: index === 0 ? "primary" : "dependency",
      command,
      args,
      cwd,
      port,
      framework: boundedString(raw.framework, 80) ?? "unknown",
      note: boundedString(raw.note, 500)
    }];
  });
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : null;
}
