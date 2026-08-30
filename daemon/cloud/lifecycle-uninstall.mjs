// @ts-check
/**
 * `vibed uninstall` — removes only managed, reproducible files: the systemd
 * unit, the CLI wrapper, the versioned runtime tree, and the add_app skill.
 * It never removes `vibed-vibedesktop` (device identity, Runner credential,
 * app configuration) unless the caller passes both `--purge-data` and
 * `--confirm-purge-data` — mirroring the existing double-flag pattern used by
 * `daemon:reset-device -- --confirm-reset-device`, so a single mistyped flag
 * can never delete local app configuration or device identity.
 */
import { execFile } from "node:child_process";
import { rm, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { isMainModule } from "../cli-entry.mjs";
import { removeRuntimeTree } from "./version-store.mjs";

const execFileAsync = promisify(execFile);
export const PURGE_FLAG = "--purge-data";
export const PURGE_CONFIRMATION_FLAG = "--confirm-purge-data";

/**
 * @param {{
 *   runtimeRoot: string; cliPath: string; unitPath: string; skillRoot?: string; skillRoots?: string[];
 *   unit: string; dataDir?: string; purgeData?: boolean; confirmPurgeData?: boolean;
 *   execFileImpl?: typeof execFileAsync;
 * }} options
 * @returns {Promise<{ removed: string[]; dataPurged: boolean }>}
 */
export async function uninstallVibed(options) {
  if (options.purgeData && !options.confirmPurgeData) {
    throw new Error(`Purging local app configuration and device identity requires both ${PURGE_FLAG} and ${PURGE_CONFIRMATION_FLAG}.`);
  }
  const runExecFile = options.execFileImpl || execFileAsync;
  const removed = [];

  // An installer can be staged under an alternate HOME/XDG_CONFIG_HOME while
  // still sharing the caller's real systemd user manager (tests and recovery
  // tooling do this). Only disable the service when systemd confirms that the
  // loaded unit is the exact unit file being uninstalled; otherwise a staged
  // uninstall could stop an unrelated live installation with the same name.
  if (await loadedUnitMatches(runExecFile, options.unit, options.unitPath)) {
    await runExecFile("systemctl", ["--user", "disable", "--now", options.unit]).catch(() => {});
  }
  if (await removeIfExists(options.unitPath)) removed.push(options.unitPath);
  await runExecFile("systemctl", ["--user", "daemon-reload"]).catch(() => {});

  if (await removeIfExists(options.cliPath)) removed.push(options.cliPath);

  await removeRuntimeTree(options.runtimeRoot);
  removed.push(options.runtimeRoot);

  const skillRoots = options.skillRoots || (options.skillRoot ? [options.skillRoot] : []);
  for (const skillRoot of skillRoots) {
    await rm(skillRoot, { recursive: true, force: true });
    removed.push(skillRoot);
  }

  const dataPurged = Boolean(options.purgeData && options.confirmPurgeData && options.dataDir);
  if (dataPurged && options.dataDir) {
    await rm(options.dataDir, { recursive: true, force: true });
    removed.push(options.dataDir);
  }

  return { removed, dataPurged };
}

/**
 * @param {typeof execFileAsync} runExecFile
 * @param {string} unit
 * @param {string} unitPath
 */
async function loadedUnitMatches(runExecFile, unit, unitPath) {
  try {
    const { stdout } = await runExecFile("systemctl", [
      "--user", "show", unit, "--property=FragmentPath", "--value"
    ]);
    const loadedPath = String(stdout).trim();
    return Boolean(loadedPath) && path.resolve(loadedPath) === path.resolve(unitPath);
  } catch {
    return false;
  }
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

function argValue(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 && index + 1 < argv.length ? argv[index + 1] : null;
}

function argValues(argv, name) {
  const values = [];
  for (let index = 0; index < argv.length - 1; index += 1) {
    if (argv[index] === name) values.push(argv[index + 1]);
  }
  return values;
}

const isMain = isMainModule(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const runtimeRoot = argValue(argv, "--runtime-root");
  const cliPath = argValue(argv, "--bin");
  const unitPath = argValue(argv, "--unit-path");
  const skillRoots = argValues(argv, "--skill-root");
  const unit = argValue(argv, "--unit") || "vibedesktop-daemon.service";
  const dataDir = process.env.VIBE_DAEMON_DATA_DIR;

  if (!runtimeRoot || !cliPath || !unitPath || skillRoots.length === 0) {
    console.error("lifecycle-uninstall requires --runtime-root, --bin, --unit-path, and --skill-root.");
    process.exitCode = 2;
  } else {
    uninstallVibed({
      runtimeRoot,
      cliPath,
      unitPath,
      skillRoots,
      unit,
      dataDir,
      purgeData: argv.includes(PURGE_FLAG),
      confirmPurgeData: argv.includes(PURGE_CONFIRMATION_FLAG),
    }).then((result) => {
      console.log("Removed vibed runtime, CLI, unit, and add_app skill.");
      if (result.dataPurged) {
        console.log("Local device identity and app configuration were also deleted, as explicitly requested.");
      } else {
        console.log("Local device identity and app configuration were kept. Re-run with " +
          `${PURGE_FLAG} ${PURGE_CONFIRMATION_FLAG} to delete them too.`);
      }
    }).catch((error) => {
      console.error(error instanceof Error ? error.message : "vibed uninstall failed");
      process.exitCode = 1;
    });
  }
}
