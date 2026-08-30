// @ts-check
/**
 * VersionStore — versioned runtime directory management for the installed
 * `vibed` release: staging, checksum verification, atomic `current` symlink
 * switching, last-known-good (LKG) bookkeeping, and pruning.
 *
 * Layout under `runtimeRoot` (`${XDG_DATA_HOME}/vibedesktop/runtime`):
 *   versions/<versionId>/{manifest.json, daemon/**, node_modules/ws/**}
 *   current -> versions/<versionId>      (relative symlink)
 *   lkg.json                             ({ previous, updatedAt })
 *
 * `runtimeRoot` never contains device identity, credentials, or app
 * configuration — that lives entirely in the separate `vibed-vibedesktop`
 * state directory and is never touched by anything in this module.
 */
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, readlink, rename, rm, stat, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { readJsonFile, writeSecureJson } from "./secure-json-store.mjs";

export const VERSIONS_DIR = "versions";
export const CURRENT_LINK = "current";
export const LKG_FILE = "lkg.json";
export const MANIFEST_FILE = "manifest.json";

/** @param {Buffer} buffer */
export function sha256Hex(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * @param {string} releaseVersion
 * @param {Array<{ path: string; sha256: string }>} fileDigests
 */
export function computeVersionId(releaseVersion, fileDigests) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,40}$/.test(releaseVersion)) {
    throw new Error("Unsafe release version.");
  }
  const sorted = [...fileDigests].sort((left, right) => left.path.localeCompare(right.path));
  const combined = sorted.map((file) => `${file.path}:${file.sha256}`).join("\n");
  const contentHash = createHash("sha256").update(combined).digest("hex").slice(0, 12);
  return `${releaseVersion}+${contentHash}`;
}

/** @param {string} runtimeRoot */
export function versionsDirectory(runtimeRoot) {
  return path.join(runtimeRoot, VERSIONS_DIR);
}

/** @param {string} runtimeRoot @param {string} versionId */
export function versionDirectory(runtimeRoot, versionId) {
  return path.join(versionsDirectory(runtimeRoot), safeVersionSegment(versionId));
}

/**
 * Writes every manifest file into a private staging directory, verifying
 * each file's digest immediately after it hits disk. On any mismatch the
 * partial staging directory is removed and an error is thrown — nothing is
 * ever visible as `versions/<versionId>` unless every file verified clean.
 *
 * If `versions/<versionId>` already exists (identical content restaged),
 * this is a no-op success — reinstalling unchanged code never re-copies.
 *
 * @param {{ runtimeRoot: string; versionId: string; releaseVersion: string; generatedAt: string;
 *   files: Array<{ path: string; sha256: string; size: number; contents: string }> }} manifest
 * @returns {Promise<string>} the final version directory
 */
export async function stageVersion(manifest) {
  const { runtimeRoot, versionId } = manifest;
  const versionsDir = versionsDirectory(runtimeRoot);
  await mkdir(versionsDir, { recursive: true, mode: 0o700 });
  const finalDir = versionDirectory(runtimeRoot, versionId);
  if (await pathExists(finalDir)) return finalDir;

  const stagingDir = path.join(versionsDir, `.staging-${process.pid}-${randomToken()}`);
  try {
    await mkdir(stagingDir, { recursive: true, mode: 0o700 });
    for (const file of manifest.files) {
      const contents = Buffer.from(file.contents, "base64");
      if (contents.length !== file.size || sha256Hex(contents) !== file.sha256) {
        throw new Error(`Digest mismatch while staging ${file.path}`);
      }
      await writeManagedFile(stagingDir, file.path, contents, 0o600);
    }
    await verifyStagedFiles(stagingDir, manifest.files);
    await writeSecureJson(path.join(stagingDir, MANIFEST_FILE), {
      version: manifest.versionId,
      releaseVersion: manifest.releaseVersion,
      generatedAt: manifest.generatedAt,
      files: manifest.files.map(({ path: filePath, sha256, size }) => ({ path: filePath, sha256, size })),
    });
    await finalizeStagedDirectory(stagingDir, finalDir);
    return finalDir;
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

/**
 * Renames an already-populated staging directory into its final version
 * directory. Used by the installer bootstrap, which writes files itself
 * (before this module exists on disk to import) and only needs the
 * rename+verify step, not the full `stageVersion` file-writing loop.
 *
 * @param {string} stagingDir
 * @param {string} finalDir
 */
export async function finalizeStagedDirectory(stagingDir, finalDir) {
  if (await pathExists(finalDir)) {
    await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    return finalDir;
  }
  await rename(stagingDir, finalDir);
  return finalDir;
}

/**
 * @param {string} dir
 * @param {Array<{ path: string; sha256: string; size: number }>} files
 */
export async function verifyStagedFiles(dir, files) {
  for (const file of files) {
    if (!safeRelativePath(file.path)) throw new Error("Unsafe manifest path.");
    const onDisk = await readFile(path.join(dir, ...file.path.split("/")));
    if (onDisk.length !== file.size || sha256Hex(onDisk) !== file.sha256) {
      throw new Error(`Checksum verification failed for ${file.path}`);
    }
  }
}

/**
 * Atomically points `current` at `versionId` and records the prior target
 * (if any and different) as the new last-known-good pointer.
 *
 * @param {string} runtimeRoot @param {string} versionId
 * @returns {Promise<{ previous: string | null }>}
 */
export async function switchCurrent(runtimeRoot, versionId) {
  safeVersionSegment(versionId);
  const finalDir = versionDirectory(runtimeRoot, versionId);
  if (!(await pathExists(finalDir))) throw new Error(`Version ${versionId} is not staged.`);
  const previous = await readCurrentVersionId(runtimeRoot);
  const currentLink = path.join(runtimeRoot, CURRENT_LINK);
  const tempLink = `${currentLink}.${process.pid}.${randomToken()}.tmp`;
  await symlink(path.join(VERSIONS_DIR, versionId), tempLink);
  await rename(tempLink, currentLink);
  if (previous && previous !== versionId) {
    await writeSecureJson(path.join(runtimeRoot, LKG_FILE), {
      previous,
      updatedAt: new Date().toISOString(),
    });
  }
  return { previous };
}

/** @param {string} runtimeRoot @returns {Promise<string | null>} */
export async function readCurrentVersionId(runtimeRoot) {
  try {
    const target = await readlink(path.join(runtimeRoot, CURRENT_LINK));
    const base = path.basename(target);
    return base || null;
  } catch {
    return null;
  }
}

/** @param {string} runtimeRoot @returns {Promise<string | null>} */
export async function readLastKnownGoodVersionId(runtimeRoot) {
  const record = await readJsonFile(path.join(runtimeRoot, LKG_FILE));
  return record && typeof record.previous === "string" && record.previous ? record.previous : null;
}

/** @param {string} runtimeRoot @returns {Promise<string[]>} */
export async function listVersionIds(runtimeRoot) {
  try {
    const entries = await readdir(versionsDirectory(runtimeRoot), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/**
 * Removes every staged version not in `keepIds`. Never removes `current` or
 * the LKG pointer's target because those are always passed in `keepIds` by
 * the caller.
 *
 * @param {string} runtimeRoot @param {Iterable<string>} keepIds
 * @returns {Promise<string[]>} removed version ids
 */
export async function pruneVersions(runtimeRoot, keepIds) {
  const keep = new Set(keepIds);
  const all = await listVersionIds(runtimeRoot);
  const removed = [];
  for (const versionId of all) {
    if (keep.has(versionId)) continue;
    await rm(versionDirectory(runtimeRoot, versionId), { recursive: true, force: true });
    removed.push(versionId);
  }
  return removed;
}

/** @param {string} runtimeRoot */
export async function removeRuntimeTree(runtimeRoot) {
  await rm(runtimeRoot, { recursive: true, force: true });
}

/** @param {string} target */
async function pathExists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

/** @param {string} root @param {string} relativePath @param {Buffer} contents @param {number} mode */
async function writeManagedFile(root, relativePath, contents, mode) {
  if (!safeRelativePath(relativePath)) throw new Error("Installer contains an unsafe path.");
  const target = path.join(root, ...relativePath.split("/"));
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${process.pid}.${randomToken()}.tmp`;
  await writeFile(temporary, contents, { mode });
  await rename(temporary, target);
}

/** @param {string} value */
function safeRelativePath(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 240 &&
    !value.startsWith("/") &&
    !value.split("/").includes("..") &&
    /^[A-Za-z0-9._/-]+$/.test(value)
  );
}

/** @param {string} value */
function safeVersionSegment(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9+._-]{0,120}$/.test(value)) {
    throw new Error("Unsafe version id.");
  }
  return value;
}

function randomToken() {
  return crypto.randomUUID();
}
