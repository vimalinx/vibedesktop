// @ts-check
/**
 * `vibedesktop update` / `rollback` / `uninstall` — the app-side lifecycle
 * counterpart to `vibed`'s `daemon/cloud/lifecycle-update.mjs` /
 * `lifecycle-uninstall.mjs`.
 *
 * Update model is git-clone + git-pull (the chosen source model): `update`
 * resolves the latest tag from the repo, clones it into a fresh
 * `versions/<id>` staging directory, runs `npm ci` + `next build`, atomically
 * switches `current`, restarts the systemd user unit, polls the app's own
 *
 * Reuses `version-store.mjs`'s `switchCurrent`/`readLastKnownGoodVersionId`/
 * `pruneVersions`/`removeRuntimeTree` by pointing them at the app's own
 * `app-root` — the layout is identical, only the contents differ.
 */
import { execFile } from "node:child_process";
import { rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { isMainModule } from "../cli-entry.mjs";
import {
  pruneVersions,
  readCurrentVersionId,
  readLastKnownGoodVersionId,
  removeRuntimeTree,
  switchCurrent,
} from "./version-store.mjs";

const execFileAsync = promisify(execFile);
export const PURGE_FLAG = "--purge-data";
export const PURGE_CONFIRMATION_FLAG = "--confirm-purge-data";
const DEFAULT_UNIT = "vibedesktop-app.service";
const APP_ORIGIN = process.env.VIBE_APP_ORIGIN || "http://localhost:3000";
const HEALTH_POLL_ATTEMPTS = 40;
const HEALTH_POLL_DELAY_MS = 500;

/**
 * @param {{ appRoot: string; repo: string; tag?: string; npmPath?: string; unit: string; origin?: string; execFileImpl?: typeof execFileAsync; fetchImpl?: typeof fetch }} options
 * @returns {Promise<{ from: string | null; to: string; rolledBack: boolean }>}
 */
export async function updateApp(options) {
  const runExecFile = options.execFileImpl || execFileAsync;
  const origin = options.origin || APP_ORIGIN;
  const npmPath = options.npmPath || "npm";
  const tag = options.tag || (await resolveLatestTag(options.repo, runExecFile));
  const versionId = await resolveVersionId(options.repo, tag, runExecFile);
  const current = await readCurrentVersionId(options.appRoot);
  if (current === versionId) {
    return { from: current, to: versionId, rolledBack: false };
  }
  const versionsDir = path.join(options.appRoot, "versions");
  const stagingDir = path.join(versionsDir, ".staging-" + process.pid + "-" + versionId);
  await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
  try {
    await runExecFile("git", ["clone", "--depth", "1", "--branch", tag, options.repo, stagingDir]);
    await runExecFile(npmPath, ["ci"], { cwd: stagingDir });
    await runExecFile(npmPath, ["run", "build"], { cwd: stagingDir });
    await rm(path.join(stagingDir, ".git"), { recursive: true, force: true });
    await writeFile(
      path.join(stagingDir, ".installed-version.json"),
      JSON.stringify({ version: versionId, tag, repo: options.repo, installedAt: new Date().toISOString() }, null, 2) + "\n",
      { mode: 0o600 }
    );
    await runExecFile("mv", [stagingDir, path.join(versionsDir, versionId)]);
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }

  await switchCurrent(options.appRoot, versionId);
  await runExecFile("systemctl", ["--user", "restart", options.unit]).catch(() => {});
  if (await pollAppHealth(origin, options.fetchImpl)) {
    await pruneVersions(options.appRoot, [versionId, await readLastKnownGoodVersionId(options.appRoot)].filter(Boolean));
    return { from: current, to: versionId, rolledBack: false };
  }
  // Health failed: roll back to LKG if one exists.
  const lkg = await readLastKnownGoodVersionId(options.appRoot);
  if (lkg && lkg !== versionId) {
    await switchCurrent(options.appRoot, lkg);
    await runExecFile("systemctl", ["--user", "restart", options.unit]).catch(() => {});
    await pollAppHealth(origin, options.fetchImpl).catch(() => {});
    return { from: current, to: lkg, rolledBack: true };
  }
  throw new Error(`Vibe Desktop ${versionId} did not become healthy and no last-known-good version exists. Run: vibedesktop status`);
}

/**
 * @param {{ appRoot: string; unit: string; origin?: string; execFileImpl?: typeof execFileAsync; fetchImpl?: typeof fetch }} options
 * @returns {Promise<{ from: string | null; to: string | null }>}
 */
export async function rollbackApp(options) {
  const runExecFile = options.execFileImpl || execFileAsync;
  const origin = options.origin || APP_ORIGIN;
  const lkg = await readLastKnownGoodVersionId(options.appRoot);
  if (!lkg) throw new Error("No last-known-good version is recorded. Nothing to roll back to.");
  const current = await readCurrentVersionId(options.appRoot);
  await switchCurrent(options.appRoot, lkg);
  await runExecFile("systemctl", ["--user", "restart", options.unit]).catch(() => {});
  await pollAppHealth(origin, options.fetchImpl).catch(() => {});
  return { from: current, to: lkg };
}

/**
 * @param {{ appRoot: string; cliPath: string; runCliPath: string; unitPath: string; unit: string; dataDir?: string; purgeData?: boolean; confirmPurgeData?: boolean; execFileImpl?: typeof execFileAsync }} options
 * @returns {Promise<{ removed: string[]; dataPurged: boolean }>}
 */
export async function uninstallApp(options) {
  if (options.purgeData && !options.confirmPurgeData) {
    throw new Error(`Purging local desktop state requires both ${PURGE_FLAG} and ${PURGE_CONFIRMATION_FLAG}.`);
  }
  const runExecFile = options.execFileImpl || execFileAsync;
  const removed = [];

  await runExecFile("systemctl", ["--user", "disable", "--now", options.unit]).catch(() => {});
  if (await removeIfExists(options.unitPath)) removed.push(options.unitPath);
  await runExecFile("systemctl", ["--user", "daemon-reload"]).catch(() => {});

  if (await removeIfExists(options.cliPath)) removed.push(options.cliPath);
  if (await removeIfExists(options.runCliPath)) removed.push(options.runCliPath);

  await removeRuntimeTree(options.appRoot);
  removed.push(options.appRoot);

  const dataPurged = Boolean(options.purgeData && options.confirmPurgeData && options.dataDir);
  if (dataPurged && options.dataDir) {
    await rm(options.dataDir, { recursive: true, force: true });
    removed.push(options.dataDir);
  }
  return { removed, dataPurged };
}

/** @param {string} repo @param {typeof execFileAsync} runExecFile */
async function resolveLatestTag(repo, runExecFile) {
  const { stdout } = await runExecFile("git", ["ls-remote", "--tags", "--sort=-v:refname", repo]);
  const match = stdout.split("\n").find((line) => /refs\/tags\/v?\d+\.\d+\.\d+$/.test(line));
  if (!match) throw new Error(`No version tags found at ${repo}.`);
  return match.replace(/^.*refs\/tags\//, "").trim();
}

/** @param {string} repo @param {string} tag @param {typeof execFileAsync} runExecFile */
async function resolveVersionId(repo, tag, runExecFile) {
  const { stdout } = await runExecFile("git", ["ls-remote", repo, `refs/tags/${tag}`]);
  const sha = stdout.split(/\s+/)[0]?.slice(0, 12);
  if (!sha) throw new Error(`Could not resolve commit for tag ${tag} at ${repo}.`);
  return `${tag}+${sha}`;
}

/** @param {string} origin @param {typeof fetch | undefined} fetchImpl */
async function pollAppHealth(origin, fetchImpl) {
  const fetchFn = fetchImpl || fetch;
  for (let attempt = 0; attempt < HEALTH_POLL_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetchFn(`${origin}/api/desktop`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, HEALTH_POLL_DELAY_MS));
  }
  return false;
}

/** @param {string} target */
async function removeIfExists(target) {
  try {
    await unlink(target);
    return true;
  } catch {
    return false;
  }
}

/** @param {string[]} argv @param {string} name */
function argValue(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : null;
}

const isMain = isMainModule(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const rest = argv.slice(1);
  const appRoot = argValue(rest, "--app-root");
  const repo = argValue(rest, "--repo") || "https://github.com/vimalinx/vibedesktop.git";
  const unit = argValue(rest, "--unit") || DEFAULT_UNIT;
  const unitPath = argValue(rest, "--unit-path");
  const cliPath = argValue(rest, "--bin");
  const tag = argValue(rest, "--tag");
  const npmPath = argValue(rest, "--npm") || "npm";

  const home = process.env.HOME || "";
  const dataHome = (process.env.XDG_DATA_HOME && path.isAbsolute(process.env.XDG_DATA_HOME))
    ? process.env.XDG_DATA_HOME : path.join(home, ".local", "share");
  const defaultAppRoot = path.join(dataHome, "vibedesktop", "app");
  const defaultUnitPath = path.join(home, ".config", "systemd", "user", DEFAULT_UNIT);
  const defaultCliPath = path.join(home, ".local", "bin", "vibedesktop");
  const defaultRunCliPath = path.join(home, ".local", "bin", "vibedesktop-run");
  const defaultDataDir = path.join(dataHome, "vibedesktop-data");

  const effectiveAppRoot = appRoot || defaultAppRoot;
  const effectiveUnitPath = unitPath || defaultUnitPath;
  const effectiveCliPath = cliPath || defaultCliPath;

  if (!effectiveAppRoot) {
    console.error("app-lifecycle requires --app-root (or HOME).");
    process.exitCode = 2;
  } else if (command === "update") {
    updateApp({ appRoot: effectiveAppRoot, repo, tag: tag || undefined, npmPath, unit })
      .then((r) => {
        if (r.rolledBack) console.log(`Updated to ${r.to} but it failed health; rolled back from ${r.from}.`);
        else if (r.from === r.to) console.log(`Already at ${r.to}.`);
        else console.log(`Updated Vibe Desktop from ${r.from} to ${r.to}.`);
      })
      .catch((error) => { console.error(error instanceof Error ? error.message : "update failed"); process.exitCode = 1; });
  } else if (command === "rollback") {
    rollbackApp({ appRoot: effectiveAppRoot, unit })
      .then((r) => console.log(`Rolled back Vibe Desktop from ${r.from} to ${r.to}.`))
      .catch((error) => { console.error(error instanceof Error ? error.message : "rollback failed"); process.exitCode = 1; });
  } else if (command === "uninstall") {
    uninstallApp({
      appRoot: effectiveAppRoot,
      cliPath: effectiveCliPath,
      runCliPath: defaultRunCliPath,
      unitPath: effectiveUnitPath,
      unit,
      dataDir: defaultDataDir,
      purgeData: rest.includes(PURGE_FLAG),
      confirmPurgeData: rest.includes(PURGE_CONFIRMATION_FLAG),
    })
      .then((result) => {
        console.log("Removed Vibe Desktop app, CLI, launcher, and unit.");
        if (result.dataPurged) console.log("Local desktop state was also deleted, as explicitly requested.");
        else console.log(`Local desktop state was kept. Re-run with ${PURGE_FLAG} ${PURGE_CONFIRMATION_FLAG} to delete it too.`);
      })
      .catch((error) => { console.error(error instanceof Error ? error.message : "uninstall failed"); process.exitCode = 1; });
  } else {
    console.error("Usage: app-lifecycle.mjs [update|rollback|uninstall] [--app-root PATH] [--repo URL] [--tag TAG] [--npm PATH] [--unit NAME] [--bin PATH] [--unit-path PATH]");
    process.exitCode = 2;
  }
}
