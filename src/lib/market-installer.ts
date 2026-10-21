import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { access, constants, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  APP_ICON_MAX_BYTES,
  APP_MANIFEST_MAX_BYTES,
  APP_MANIFEST_PATH,
  isCommitSha,
  parseGithubRepository,
  validateAppManifest,
  type AppManifest
} from "@/lib/app-manifest.mjs";
import { catalogDataRoot, catalogWorkspaceRoot } from "@/lib/catalog-workspace-installer";
import { deleteLocalApp, getLocalApp, listLocalApps, updateLocalApp } from "@/lib/daemon-client";
import { removeLocalAppBundle } from "@/lib/local-app-import";
import type { LocalAppView, MarketInstallPreview, MarketInstallState, MarketInstallStatus, MarketTrust } from "@/lib/contracts";

/**
 * Installs an app that declares itself with `.vibedesktop/app.json` from a
 * GitHub repository, pinned to one commit.
 *
 * Nothing from the repository runs during a preview: the commit is fetched
 * without file contents and only the manifest and icon blobs are read. An
 * install must echo the preview's manifest digest, so what runs is exactly what
 * the user confirmed. The heavy lifting — requirements, setup commands, the
 * supervised bundle, the verified start and its rollback — is add_app's
 * `add.py --setup --start`, the same code path as a local project import.
 */

const execFileAsync = promisify(execFile);
const installFile = "install.json";
const busyStates = new Set<MarketInstallState>(["queued", "fetching", "setup", "starting"]);
const FETCH_TIMEOUT_MS = 3 * 60_000;
const CHECKOUT_TIMEOUT_MS = 15 * 60_000;
// Setup commands may download dependencies; add.py bounds each step at 30 minutes.
const INSTALL_TIMEOUT_MS = 45 * 60_000;
const MARKET_TTL_MS = 10 * 60_000;
const ICON_TYPES: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

interface InstallRecord {
  schemaVersion: 1;
  id: string;
  repository: string;
  name: string;
  ref: string;
  digest: string;
  trust: MarketTrust;
  appId: string;
  sourcePath: string;
  dataPath: string;
  iconUrl: string | null;
  installedAt: string;
}

interface MarketRuntime {
  jobs: Map<string, MarketInstallStatus>;
  market: { fetchedAt: number; entries: Map<string, { trust: MarketTrust; ref: string | null }> } | null;
}

const runtime = (() => {
  const key = "__vibedesktopMarketInstallRuntime";
  const root = globalThis as typeof globalThis & Record<string, MarketRuntime | undefined>;
  return root[key] ?? (root[key] = { jobs: new Map(), market: null });
})();

export class MarketInstallError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400, readonly details?: string[]) {
    super(message);
    this.name = "MarketInstallError";
  }
}

/** The market lives beside the reviewed catalog installs: `<workspaces>/market/<owner>--<repo>`. */
export function marketWorkspaceRoot(): string {
  return path.join(catalogWorkspaceRoot(), "market");
}

function marketDataPath(id: string): string {
  return path.join(catalogDataRoot(), "market", id);
}

function repositoryIdentity(input: unknown) {
  const repository = parseGithubRepository(input);
  if (!repository) throw new MarketInstallError("invalid_repository", "Enter a GitHub repository such as owner/repo.");
  const id = `${repository.owner}--${repository.repo}`.toLowerCase();
  return { ...repository, id };
}

/** `https://github.com/` normally; a local mirror (file://) when verifying the installer offline. */
function gitUrl(slug: string): string {
  const base = process.env.VIBE_MARKET_GIT_BASE?.trim() || "https://github.com/";
  return `${base.replace(/\/?$/, "/")}${slug}${base.startsWith("https://github.com") ? ".git" : ""}`;
}

export async function previewMarketInstall(input: { repository: unknown; ref?: unknown }): Promise<MarketInstallPreview> {
  const repository = repositoryIdentity(input.repository);
  if (input.ref !== undefined && input.ref !== null && !isCommitSha(input.ref)) {
    throw new MarketInstallError("invalid_ref", "A pinned version must be a full 40-character commit SHA.");
  }
  const fetched = await fetchCommit(repository.slug, repository.id, typeof input.ref === "string" ? input.ref : null);
  const { manifest, digest } = await readManifest(fetched.dir, fetched.ref);
  const [iconUrl, trust, requires, installed] = await Promise.all([
    readIcon(fetched.dir, fetched.ref, manifest),
    marketTrust(repository.slug, fetched.ref),
    Promise.all(manifest.requires.map(async (command) => ({ command, available: await commandAvailable(command) }))),
    readInstallStatus(repository.id)
  ]);
  return {
    id: repository.id,
    repository: repository.slug,
    repositoryUrl: repository.url,
    ref: fetched.ref,
    digest,
    name: manifest.name,
    description: manifest.description,
    iconUrl,
    category: manifest.category,
    homepage: manifest.homepage,
    trust,
    requires,
    setup: manifest.setup,
    services: manifest.services,
    env: manifest.env,
    workspacePath: path.join(marketWorkspaceRoot(), repository.id),
    dataPath: marketDataPath(repository.id),
    installed
  };
}

const installStarts = new Map<string, Promise<MarketInstallStatus>>();

export function startMarketInstall(input: { repository: unknown; ref: unknown; digest: unknown }): Promise<MarketInstallStatus> {
  const repository = repositoryIdentity(input.repository);
  const pending = installStarts.get(repository.id);
  if (pending) return pending;
  const result = beginInstall(repository, input.ref, input.digest);
  installStarts.set(repository.id, result);
  void result.finally(() => { if (installStarts.get(repository.id) === result) installStarts.delete(repository.id); }).catch(() => undefined);
  return result;
}

async function beginInstall(repository: ReturnType<typeof repositoryIdentity>, ref: unknown, digest: unknown): Promise<MarketInstallStatus> {
  if (!isCommitSha(ref)) throw new MarketInstallError("invalid_ref", "Install a previewed, pinned commit.");
  if (typeof digest !== "string" || !/^[0-9a-f]{64}$/.test(digest)) {
    throw new MarketInstallError("invalid_digest", "Install requires the digest of the manifest you confirmed.");
  }
  const current = runtime.jobs.get(repository.id);
  if (current && busyStates.has(current.state)) return current;
  const existing = await readInstallRecord(repository.id);
  if (existing && existing.ref === ref) {
    const status = await readInstallStatus(repository.id);
    if (status?.state === "installed") return status;
  }
  const initial = setStatus(repository.id, {
    repository: repository.slug, name: existing?.name ?? repository.repo, ref, trust: existing?.trust ?? "unlisted",
    state: "queued", message: "Queued."
  });
  void performInstall(repository, ref, digest, existing).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Installation failed.";
    const last = runtime.jobs.get(repository.id);
    setStatus(repository.id, { ...last!, state: "failed", message });
  });
  return initial;
}

async function performInstall(
  repository: ReturnType<typeof repositoryIdentity>,
  ref: string,
  digest: string,
  previous: InstallRecord | null
): Promise<void> {
  const id = repository.id;
  const base = runtime.jobs.get(id)!;
  setStatus(id, { ...base, state: "fetching", message: `Fetching ${repository.slug} at ${ref.slice(0, 12)}…` });

  const fetched = await fetchCommit(repository.slug, id, ref);
  const { manifest, digest: actual } = await readManifest(fetched.dir, ref);
  if (actual !== digest) {
    throw new MarketInstallError("manifest_changed", "The manifest differs from the one you confirmed. Preview the app again.", 409);
  }
  const [trust, iconUrl] = await Promise.all([marketTrust(repository.slug, ref), readIcon(fetched.dir, ref, manifest)]);
  setStatus(id, { ...base, name: manifest.name, trust, iconUrl, state: "fetching", message: "Checking out the pinned commit…" });
  await git(fetched.dir, ["-c", "advice.detachedHead=false", "checkout", "--quiet", "--detach", ref], CHECKOUT_TIMEOUT_MS);
  await git(fetched.dir, ["submodule", "update", "--init", "--recursive", "--depth", "1"], CHECKOUT_TIMEOUT_MS).catch(() => undefined);

  const workspace = path.join(marketWorkspaceRoot(), id);
  const source = path.join(workspace, `src-${ref.slice(0, 12)}`);
  const dataPath = marketDataPath(id);
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  await mkdir(dataPath, { recursive: true, mode: 0o700 });
  await rm(source, { recursive: true, force: true });
  await rename(fetched.dir, source);

  // An update replaces the running copy: the old registration must go first because
  // add.py refuses ports that are still registered. It is restored if the new one fails.
  let removedPrevious = false;
  if (previous && previous.sourcePath !== source) {
    await removeRegistration(previous.appId);
    removedPrevious = true;
  }

  setStatus(id, { ...base, name: manifest.name, trust, iconUrl, state: "setup", workspacePath: workspace, dataPath,
    message: manifest.setup.length ? `Running ${manifest.setup.length} setup step(s)…` : "Checking requirements…" });
  let result: Record<string, unknown>;
  try {
    result = await runAddApp([source, "--setup", "--start", "--name", manifest.name, "--data-dir", dataPath], (line) => {
      const state: MarketInstallState = /^(✓ managed bundle|✓ registered)/.test(line) ? "starting" : runtime.jobs.get(id)?.state ?? "setup";
      setStatus(id, { ...runtime.jobs.get(id)!, state, message: line.slice(0, 300) });
    });
  } catch (error) {
    await rm(source, { recursive: true, force: true }).catch(() => undefined);
    if (removedPrevious && previous) {
      const restored = await restorePrevious(previous).then(() => true, () => false);
      const reason = error instanceof Error ? error.message : "Installation failed.";
      throw new MarketInstallError("update_failed", restored
        ? `${reason}\nThe previous version (${previous.ref.slice(0, 12)}) was restored and is running again.`
        : `${reason}\nThe previous version could not be restarted; its files are kept at ${previous.sourcePath}.`, 502);
    }
    throw error;
  }

  const appId = String(result.appId);
  // add.py verified the first page; every declared health path must answer too.
  const unhealthy = await firstUnhealthyService(manifest, result);
  if (unhealthy) {
    await removeRegistration(appId).catch(() => undefined);
    await rm(source, { recursive: true, force: true }).catch(() => undefined);
    const reason = `Service ${unhealthy.name} did not answer http://127.0.0.1:${unhealthy.port}${unhealthy.health} without an error.`;
    if (removedPrevious && previous) {
      const restored = await restorePrevious(previous).then(() => true, () => false);
      throw new MarketInstallError("update_failed", `${reason}\n${restored ? `The previous version (${previous.ref.slice(0, 12)}) was restored and is running again.` : `The previous version could not be restarted; its files are kept at ${previous.sourcePath}.`}`, 502);
    }
    throw new MarketInstallError("unhealthy", `${reason} The install was rolled back.`, 502);
  }
  if (iconUrl) await updateLocalApp(appId, { iconKind: "favicon", iconUrl }).catch(() => undefined);
  const record: InstallRecord = {
    schemaVersion: 1, id, repository: repository.slug, name: manifest.name, ref, digest, trust,
    appId, sourcePath: source, dataPath, iconUrl, installedAt: new Date().toISOString()
  };
  await writeRecord(workspace, record);
  if (previous && previous.sourcePath !== source) await rm(previous.sourcePath, { recursive: true, force: true }).catch(() => undefined);
  setStatus(id, {
    ...runtime.jobs.get(id)!, state: "installed", appId, url: typeof result.url === "string" ? result.url : undefined,
    message: `Installed ${manifest.name} at ${ref.slice(0, 12)}.`, running: true, healthy: true
  });
}

async function firstUnhealthyService(manifest: AppManifest, result: Record<string, unknown>): Promise<{ name: string; port: number; health: string } | null> {
  const planned = (result.plan as { services?: { name?: unknown; port?: unknown }[] } | undefined)?.services ?? [];
  const deadline = Date.now() + 60_000;
  for (const service of manifest.services) {
    const port = Number(planned.find((item) => item.name === service.name)?.port ?? service.port);
    let ok = false;
    while (!ok && Date.now() < deadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}${service.health}`, { signal: AbortSignal.timeout(3000), redirect: "manual" });
        await response.body?.cancel();
        ok = response.status < 500;
      } catch { /* not answering yet */ }
      if (!ok) await new Promise((resolve) => setTimeout(resolve, 700));
    }
    if (!ok) return { name: service.name, port, health: service.health };
  }
  return null;
}

async function restorePrevious(previous: InstallRecord): Promise<void> {
  const restored = await runAddApp([previous.sourcePath, "--start", "--name", previous.name, "--data-dir", previous.dataPath], () => undefined);
  const record = { ...previous, appId: String(restored.appId) };
  await writeRecord(path.join(marketWorkspaceRoot(), previous.id), record);
  if (previous.iconUrl) await updateLocalApp(record.appId, { iconKind: "favicon", iconUrl: previous.iconUrl }).catch(() => undefined);
}

export async function listMarketInstalls(): Promise<MarketInstallStatus[]> {
  let ids: string[] = [];
  try {
    ids = (await readdir(marketWorkspaceRoot(), { withFileTypes: true })).filter((entry) => entry.isDirectory() && !entry.name.startsWith(".")).map((entry) => entry.name);
  } catch { /* nothing installed yet */ }
  let apps: LocalAppView[] | null = null;
  try { apps = await listLocalApps(); } catch { /* daemon state unknown */ }
  const statuses = await Promise.all([...new Set([...ids, ...runtime.jobs.keys()])].map((id) => readInstallStatus(id, apps)));
  return statuses.filter((status): status is MarketInstallStatus => status !== null);
}

export async function uninstallMarketInstall(id: string, purgeData = false): Promise<MarketInstallStatus> {
  if (!/^[a-z0-9-]+--[a-z0-9._-]+$/.test(id)) throw new MarketInstallError("invalid_id", "Unknown market install.", 404);
  const job = runtime.jobs.get(id);
  if (job && busyStates.has(job.state)) throw new MarketInstallError("install_busy", "Wait for the installation to finish first.", 409);
  const record = await readInstallRecord(id);
  if (!record && !job) throw new MarketInstallError("not_installed", "This app is not installed.", 404);
  if (record) await removeRegistration(record.appId);
  const workspace = path.join(marketWorkspaceRoot(), id);
  await rm(workspace, { recursive: true, force: true });
  const dataPath = record?.dataPath ?? marketDataPath(id);
  if (purgeData && isInside(dataPath, path.join(catalogDataRoot(), "market"))) await rm(dataPath, { recursive: true, force: true });
  runtime.jobs.delete(id);
  return {
    id, repository: record?.repository ?? job!.repository, name: record?.name ?? job!.name, ref: record?.ref ?? job!.ref,
    trust: record?.trust ?? job!.trust, state: "not_installed", updatedAt: new Date().toISOString(), dataPath,
    message: purgeData ? "Uninstalled and deleted its data." : `Uninstalled. Its data was kept at ${dataPath}.`
  };
}

/**
 * Removing a market app from Local WebApps deletes its daemon registration; this drops the
 * now-orphaned pinned source too. Data is kept, exactly like an uninstall without purge.
 */
export async function forgetMarketSource(cwd: string | null | undefined): Promise<void> {
  if (!cwd || !isInside(cwd, marketWorkspaceRoot())) return;
  const id = path.relative(marketWorkspaceRoot(), path.resolve(cwd)).split(path.sep)[0];
  if (!id || id.startsWith(".") || !/^[a-z0-9-]+--[a-z0-9._-]+$/.test(id)) return;
  const job = runtime.jobs.get(id);
  if (job && busyStates.has(job.state)) return;
  await rm(path.join(marketWorkspaceRoot(), id), { recursive: true, force: true });
  runtime.jobs.delete(id);
}

async function removeRegistration(appId: string): Promise<void> {
  let command: string | null = null;
  try {
    command = (await getLocalApp(appId)).command;
  } catch {
    return; // already gone
  }
  await deleteLocalApp(appId);
  await removeLocalAppBundle(command).catch(() => false);
}

async function readInstallStatus(id: string, knownApps?: LocalAppView[] | null): Promise<MarketInstallStatus | null> {
  const job = runtime.jobs.get(id);
  if (job && (busyStates.has(job.state) || job.state === "failed")) return job;
  const record = await readInstallRecord(id);
  if (!record) return job ?? null;
  let app: LocalAppView | null | undefined;
  if (knownApps === undefined) {
    try { app = (await listLocalApps()).find((candidate) => candidate.id === record.appId) ?? null; } catch { app = undefined; }
  } else app = knownApps === null ? undefined : knownApps.find((candidate) => candidate.id === record.appId) ?? null;
  const base = {
    id, repository: record.repository, name: record.name, ref: record.ref, trust: record.trust, iconUrl: record.iconUrl,
    appId: record.appId, workspacePath: path.join(marketWorkspaceRoot(), id), dataPath: record.dataPath, updatedAt: record.installedAt
  };
  if (app === null) return { ...base, state: "failed", message: "Installed files remain, but the managed app was removed. Install again to repair it." };
  return {
    ...base, state: "installed", url: app?.status.url ?? undefined, running: app?.status.running, healthy: app?.status.healthy,
    message: app === undefined ? "Installed. The app manager is unreachable, so its state is unknown." : `Installed at ${record.ref.slice(0, 12)}.`
  };
}

async function readInstallRecord(id: string): Promise<InstallRecord | null> {
  try {
    const parsed = JSON.parse(await readFile(path.join(marketWorkspaceRoot(), id, installFile), "utf8")) as Partial<InstallRecord>;
    if (parsed.schemaVersion !== 1 || parsed.id !== id || !isCommitSha(parsed.ref) || typeof parsed.appId !== "string" ||
        typeof parsed.sourcePath !== "string" || !isInside(parsed.sourcePath, marketWorkspaceRoot()) || typeof parsed.dataPath !== "string") return null;
    return parsed as InstallRecord;
  } catch {
    return null;
  }
}

async function writeRecord(workspace: string, record: InstallRecord): Promise<void> {
  const target = path.join(workspace, installFile);
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, target);
}

function setStatus(id: string, fields: Omit<MarketInstallStatus, "id" | "updatedAt"> & Partial<Pick<MarketInstallStatus, "updatedAt">>): MarketInstallStatus {
  const next: MarketInstallStatus = { ...fields, id, updatedAt: new Date().toISOString() };
  runtime.jobs.set(id, next);
  return next;
}

/* ----- git: fetch one commit without file contents, read single blobs ----- */

async function fetchCommit(slug: string, id: string, ref: string | null): Promise<{ dir: string; ref: string }> {
  const previews = path.join(marketWorkspaceRoot(), ".fetch");
  await mkdir(previews, { recursive: true, mode: 0o700 });
  await pruneOldFetches(previews);
  const dir = path.join(previews, `${id}-${randomUUID().slice(0, 8)}`);
  try {
    await git(null, ["init", "--quiet", dir], 10_000);
    await git(dir, ["remote", "add", "origin", gitUrl(slug)], 10_000);
    await git(dir, ["fetch", "--quiet", "--depth", "1", "--filter=blob:none", "--no-tags", "origin", ref ?? "HEAD"], FETCH_TIMEOUT_MS);
    const resolved = (await git(dir, ["rev-parse", "FETCH_HEAD"], 10_000)).trim();
    if (!isCommitSha(resolved) || (ref && resolved !== ref)) throw new Error("the fetched commit does not match the requested version");
    return { dir, ref: resolved };
  } catch (error) {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    const detail = error instanceof Error ? error.message : "";
    if (/not found|does not exist|could not read Username|Repository not found/i.test(detail)) {
      throw new MarketInstallError("repository_unavailable", `${slug} was not found on GitHub, or the commit is not public.`, 404);
    }
    throw new MarketInstallError("fetch_failed", `Could not fetch ${slug} from GitHub. Check the network and try again.`, 502);
  }
}

async function readManifest(dir: string, ref: string): Promise<{ manifest: AppManifest; digest: string }> {
  let raw: Buffer;
  try {
    raw = await gitBlob(dir, ref, APP_MANIFEST_PATH, APP_MANIFEST_MAX_BYTES);
  } catch {
    throw new MarketInstallError("manifest_missing", `This repository has no ${APP_MANIFEST_PATH} at ${ref.slice(0, 12)}, so it cannot be installed from the market.`, 422);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new MarketInstallError("manifest_invalid", `${APP_MANIFEST_PATH} is not valid JSON.`, 422);
  }
  const result = validateAppManifest(parsed);
  if (!result.ok) throw new MarketInstallError("manifest_invalid", `${APP_MANIFEST_PATH} is not valid.`, 422, result.errors);
  return { manifest: result.manifest, digest: createHash("sha256").update(raw).digest("hex") };
}

async function readIcon(dir: string, ref: string, manifest: AppManifest): Promise<string | null> {
  if (!manifest.icon) return null;
  const type = ICON_TYPES[path.extname(manifest.icon).toLowerCase()];
  try {
    const bytes = await gitBlob(dir, ref, `.vibedesktop/${manifest.icon}`, APP_ICON_MAX_BYTES);
    return type ? `data:${type};base64,${bytes.toString("base64")}` : null;
  } catch {
    return null; // a missing icon renders as initials; it never blocks an install
  }
}

async function gitBlob(dir: string, ref: string, file: string, maxBytes: number): Promise<Buffer> {
  const size = Number((await git(dir, ["cat-file", "-s", `${ref}:${file}`], FETCH_TIMEOUT_MS)).trim());
  if (!Number.isFinite(size) || size > maxBytes) throw new Error(`${file} is too large`);
  const { stdout } = await execFileAsync("git", ["-C", dir, "cat-file", "blob", `${ref}:${file}`], {
    encoding: "buffer", timeout: FETCH_TIMEOUT_MS, maxBuffer: maxBytes + 1024, env: gitEnv()
  });
  return stdout;
}

async function git(dir: string | null, args: string[], timeout: number): Promise<string> {
  const { stdout } = await execFileAsync("git", dir ? ["-C", dir, ...args] : args, {
    timeout, maxBuffer: 4 * 1024 * 1024, env: gitEnv()
  });
  return stdout;
}

function gitEnv(): NodeJS.ProcessEnv {
  // Never prompt for credentials: the market installs public repositories only.
  return { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "/bin/false", GCM_INTERACTIVE: "never" };
}

async function pruneOldFetches(root: string): Promise<void> {
  const cutoff = Date.now() - 6 * 60 * 60_000;
  for (const entry of await readdir(root).catch(() => [] as string[])) {
    const target = path.join(root, entry);
    const info = await stat(target).catch(() => null);
    if (info && info.mtimeMs < cutoff) await rm(target, { recursive: true, force: true }).catch(() => undefined);
  }
}

/* ----- market trust ----- */

async function marketTrust(slug: string, ref: string): Promise<MarketTrust> {
  const entries = await loadMarket();
  const entry = entries?.get(slug.toLowerCase());
  if (!entry) return "unlisted";
  // A review covers one exact commit; any other commit of a reviewed app is community-grade.
  if (entry.trust === "reviewed") return entry.ref === ref ? "reviewed" : "community";
  return "community";
}

async function loadMarket(): Promise<Map<string, { trust: MarketTrust; ref: string | null }> | null> {
  if (runtime.market && Date.now() - runtime.market.fetchedAt < MARKET_TTL_MS) return runtime.market.entries;
  const url = process.env.VIBE_MARKET_URL?.trim() || "https://vibedesktop.online/market.json";
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { Accept: "application/json" }, redirect: "error" });
    if (!response.ok) throw new Error(String(response.status));
    const text = await response.text();
    if (text.length > 4 * 1024 * 1024) throw new Error("market index too large");
    const body = JSON.parse(text) as { apps?: unknown };
    const entries = new Map<string, { trust: MarketTrust; ref: string | null }>();
    for (const app of Array.isArray(body.apps) ? body.apps : []) {
      const item = app as { repository?: unknown; trust?: unknown; ref?: unknown };
      const repository = parseGithubRepository(item.repository);
      if (!repository) continue;
      entries.set(repository.slug.toLowerCase(), {
        trust: item.trust === "reviewed" ? "reviewed" : "community",
        ref: isCommitSha(item.ref) ? item.ref : null
      });
    }
    runtime.market = { fetchedAt: Date.now(), entries };
    return entries;
  } catch {
    return runtime.market?.entries ?? null;
  }
}

/* ----- add_app ----- */

function runAddApp(args: string[], onProgress: (line: string) => void): Promise<Record<string, unknown>> {
  const script = path.join(process.cwd(), ".claude", "skills", "add_app", "add.py");
  return new Promise((resolve, reject) => {
    const child = execFile("python3", [script, ...args, "--json"], {
      timeout: INSTALL_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024, env: process.env
    }, (error, stdout) => {
      let result: Record<string, unknown> | null = null;
      try {
        const parsed: unknown = JSON.parse(String(stdout).trim().split("\n").at(-1) ?? "");
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) result = parsed as Record<string, unknown>;
      } catch { /* reported below */ }
      if (result?.ok === true && typeof result.appId === "string") return resolve(result);
      const message = typeof result?.message === "string" ? result.message
        : error ? `The installer stopped: ${error.message}` : "The installer returned an unexpected result.";
      const details = Array.isArray(result?.errors) ? result.errors.filter((item): item is string => typeof item === "string") : undefined;
      reject(new MarketInstallError(typeof result?.status === "string" ? result.status : "install_failed", message, 502, details));
    });
    let pending = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      pending += chunk.toString("utf8");
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) onProgress(line.trim());
    });
  });
}

async function commandAvailable(command: string): Promise<boolean> {
  for (const directory of (process.env.PATH ?? "").split(path.delimiter).filter(Boolean)) {
    try {
      await access(path.join(directory, command), constants.X_OK);
      return true;
    } catch { /* keep looking */ }
  }
  return false;
}

function isInside(candidate: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}
