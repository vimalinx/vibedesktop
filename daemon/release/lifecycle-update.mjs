// @ts-check
/**
 * `vibed update` / `vibed rollback` — fetches the hosted JSON release
 * manifest, stages+verifies a new version, atomically switches `current`,
 * restarts the service, and polls health. On failed health after an update
 * it automatically rolls back to the last-known-good (LKG) version. See
 * design.md §4.
 */
import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { isMainModule } from "../cli-entry.mjs";
import { promisify } from "node:util";
import { checkVibedHealth } from "../health.mjs";
import { verifyManifestSignature } from "./manifest-signature.mjs";
import {
  computeVersionId,
  pruneVersions,
  readCurrentVersionId,
  readLastKnownGoodVersionId,
  sha256Hex,
  stageVersion,
  switchCurrent,
} from "./version-store.mjs";

const execFileAsync = promisify(execFile);

// Public distribution point for `vibed update`: the static manifest attached
// to the latest GitHub Release (see `scripts/generate-dist.ts`). Override per
// invocation with `--url`, or per host with `VIBE_UPDATE_MANIFEST_URL`.
export const DEFAULT_UPDATE_MANIFEST_URL = "https://github.com/vimalinx/vibedesktop/releases/latest/download/manifest.json";
const DEFAULT_UNIT = "vibedesktop-daemon.service";
const HEALTH_POLL_ATTEMPTS = 20;
const HEALTH_POLL_DELAY_MS = 250;

/**
 * @param {{ manifestUrl: string; fetchImpl?: typeof fetch }} options
 */
export async function fetchReleaseManifest(options) {
  const fetchImpl = options.fetchImpl || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let response;
  try {
    response = await fetchImpl(options.manifestUrl, { signal: controller.signal, headers: { accept: "application/json" } });
  } catch {
    throw new Error(`Update manifest is unreachable at ${options.manifestUrl}`);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new Error(`Update manifest request failed: HTTP ${response.status}`);
  const payload = await response.json();
  return validateManifestShape(payload);
}

/** @param {unknown} value */
function validateManifestShape(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Update manifest is malformed.");
  const manifest = /** @type {Record<string, unknown>} */ (value);
  if (typeof manifest.version !== "string" || !manifest.version) throw new Error("Update manifest is missing version.");
  if (typeof manifest.releaseVersion !== "string" || !manifest.releaseVersion) throw new Error("Update manifest is missing releaseVersion.");
  if (typeof manifest.generatedAt !== "string" || !manifest.generatedAt) throw new Error("Update manifest is missing generatedAt.");
  if (!Array.isArray(manifest.runtime) || manifest.runtime.length === 0) throw new Error("Update manifest is missing runtime files.");
  if (!Array.isArray(manifest.skill)) throw new Error("Update manifest is missing skill files.");
  for (const file of [...manifest.runtime, ...manifest.skill]) {
    if (
      !file || typeof file !== "object" ||
      typeof file.path !== "string" || typeof file.sha256 !== "string" ||
      typeof file.size !== "number" || typeof file.contents !== "string"
    ) throw new Error("Update manifest contains a malformed file entry.");
  }
  return /** @type {{ version: string; releaseVersion: string; generatedAt: string; runtime: Array<{path:string;sha256:string;size:number;contents:string}>; skill: Array<{path:string;sha256:string;size:number;contents:string}>; signature: string | null; keyId: string | null }} */ (manifest);
}

/**
 * @param {ReturnType<typeof validateManifestShape>} manifest
 * @param {string | null} publicKeyBase64
 */
function verifySignatureIfConfigured(manifest, publicKeyBase64) {
  if (!publicKeyBase64) return; // Documented interim state: checksum-only until a signing pipeline exists.
  if (!manifest.signature) throw new Error("Release signing is required but the manifest carries no signature.");
  if (!verifyManifestSignature(manifest, manifest.signature, publicKeyBase64)) {
    throw new Error("Manifest signature verification failed.");
  }
}

/** @param {ReturnType<typeof validateManifestShape>} manifest */
function verifyDeclaredVersionId(manifest) {
  const recomputed = computeVersionId(manifest.releaseVersion, manifest.runtime);
  if (recomputed !== manifest.version) {
    throw new Error("Manifest version id does not match its own file digests.");
  }
}

/**
 * @param {string} skillRoot
 * @param {Array<{ path: string; sha256: string; size: number; contents: string }>} files
 */
async function replaceSkillFiles(skillRoot, files) {
  for (const file of files) {
    if (!safeRelativePath(file.path)) throw new Error(`Unsafe skill file path ${file.path}`);
    const contents = Buffer.from(file.contents, "base64");
    if (contents.length !== file.size || sha256Hex(contents) !== file.sha256) {
      throw new Error(`Digest mismatch while updating skill file ${file.path}`);
    }
    const target = path.join(skillRoot, ...file.path.split("/"));
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, contents, { mode: 0o600 });
    await rename(temporary, target);
    await chmod(target, 0o600).catch(() => {});
    const onDisk = await readFile(target);
    if (onDisk.length !== file.size || sha256Hex(onDisk) !== file.sha256) {
      throw new Error(`Checksum verification failed after writing skill file ${file.path}`);
    }
  }
}

function safeRelativePath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 240 &&
    !value.startsWith("/") && !value.split("/").includes("..") &&
    /^[A-Za-z0-9._/-]+$/.test(value);
}

/**
 * @param {{ checkHealth: () => Promise<boolean>; attempts?: number; delayMs?: number }} options
 */
async function pollHealthy(options) {
  const attempts = options.attempts ?? HEALTH_POLL_ATTEMPTS;
  const delayMs = options.delayMs ?? HEALTH_POLL_DELAY_MS;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await options.checkHealth()) return true;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}

/**
 * @param {{
 *   runtimeRoot: string; dataDir: string; skillRoot?: string; skillRoots?: string[];
 *   manifestUrl: string; publicKeyBase64?: string | null;
 *   fetchImpl?: typeof fetch; restart: () => Promise<void>; checkHealth: () => Promise<boolean>;
 *   pollAttempts?: number; pollDelayMs?: number;
 * }} options
 * @returns {Promise<{ status: "up_to_date" | "updated" | "rolled_back" | "unhealthy"; versionId: string; previousVersionId: string | null }>}
 */
export async function performUpdate(options) {
  const currentVersionId = await readCurrentVersionId(options.runtimeRoot);
  const manifest = await fetchReleaseManifest({ manifestUrl: options.manifestUrl, fetchImpl: options.fetchImpl });
  verifySignatureIfConfigured(manifest, options.publicKeyBase64 ?? null);
  verifyDeclaredVersionId(manifest);

  if (manifest.version === currentVersionId) {
    return { status: "up_to_date", versionId: manifest.version, previousVersionId: currentVersionId };
  }

  await stageVersion({
    runtimeRoot: options.runtimeRoot,
    versionId: manifest.version,
    releaseVersion: manifest.releaseVersion,
    generatedAt: manifest.generatedAt,
    files: manifest.runtime,
  });
  const skillRoots = options.skillRoots || (options.skillRoot ? [options.skillRoot] : []);
  for (const skillRoot of skillRoots) {
    await replaceSkillFiles(skillRoot, manifest.skill);
  }

  await switchCurrent(options.runtimeRoot, manifest.version);
  await pruneVersions(options.runtimeRoot, [manifest.version, currentVersionId].filter((id) => typeof id === "string"));

  await options.restart();
  const healthy = await pollHealthy({ checkHealth: options.checkHealth, attempts: options.pollAttempts, delayMs: options.pollDelayMs });
  if (healthy) return { status: "updated", versionId: manifest.version, previousVersionId: currentVersionId };

  if (currentVersionId) {
    await switchCurrent(options.runtimeRoot, currentVersionId);
    await options.restart();
    await pollHealthy({ checkHealth: options.checkHealth, attempts: options.pollAttempts, delayMs: options.pollDelayMs });
    return { status: "rolled_back", versionId: manifest.version, previousVersionId: currentVersionId };
  }
  return { status: "unhealthy", versionId: manifest.version, previousVersionId: null };
}

/**
 * @param {{ runtimeRoot: string; restart: () => Promise<void>; checkHealth: () => Promise<boolean>; pollAttempts?: number; pollDelayMs?: number }} options
 * @returns {Promise<{ status: "rolled_back" | "rollback_unhealthy"; versionId: string }>}
 */
export async function performRollback(options) {
  const lkg = await readLastKnownGoodVersionId(options.runtimeRoot);
  if (!lkg) throw new Error("No last-known-good version is recorded; nothing to roll back to.");
  await switchCurrent(options.runtimeRoot, lkg);
  await options.restart();
  const healthy = await pollHealthy({ checkHealth: options.checkHealth, attempts: options.pollAttempts, delayMs: options.pollDelayMs });
  return { status: healthy ? "rolled_back" : "rollback_unhealthy", versionId: lkg };
}

/** @param {string} unit */
function systemctlRestart(unit) {
  return async () => {
    await execFileAsync("systemctl", ["--user", "restart", unit]);
  };
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
  const unit = argValue(argv, "--unit") || DEFAULT_UNIT;
  const dataDir = process.env.VIBE_DAEMON_DATA_DIR;
  const skillRoots = argValues(argv, "--skill-root");
  const manifestUrl = argValue(argv, "--url") || process.env.VIBE_UPDATE_MANIFEST_URL || DEFAULT_UPDATE_MANIFEST_URL;
  const publicKeyBase64 = process.env.VIBE_RELEASE_PUBLIC_KEY || null;

  if (!runtimeRoot || !dataDir) {
    console.error("lifecycle-update requires --runtime-root and VIBE_DAEMON_DATA_DIR.");
    process.exitCode = 2;
  } else {
    const restart = systemctlRestart(unit);
    const checkHealth = () => checkVibedHealth({ dataDir });
    const isRollbackCommand = argv.includes("--rollback");
    const operation = isRollbackCommand
      ? performRollback({ runtimeRoot, restart, checkHealth })
      : performUpdate({ runtimeRoot, dataDir, skillRoots, manifestUrl, publicKeyBase64, restart, checkHealth });

    operation.then((result) => {
      if (result.status === "up_to_date") {
        console.log(`vibed is already on the latest version (${result.versionId}).`);
      } else if (result.status === "updated") {
        console.log(`vibed updated to ${result.versionId} and is healthy.`);
      } else if (result.status === "rolled_back" && isRollbackCommand) {
        console.log(`vibed rolled back to ${result.versionId} and is healthy.`);
      } else if (result.status === "rolled_back") {
        // The update itself failed health and was automatically reverted —
        // the machine ends up healthy, but the update did not apply.
        // `versionId` is the rejected candidate; `previousVersionId` is the LKG now active.
        console.error(`New version ${result.versionId} did not become healthy; rolled back to ${result.previousVersionId}.`);
        process.exitCode = 1;
      } else {
        console.error(`vibed did not become healthy on ${result.versionId}. Run: vibed status`);
        process.exitCode = 1;
      }
    }).catch((error) => {
      console.error(error instanceof Error ? error.message : "vibed update failed");
      process.exitCode = 1;
    });
  }
}
