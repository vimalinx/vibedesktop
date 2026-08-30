// @ts-check
/**
 * bundled-node — downloads and verifies a pinned official Node.js Linux
 * build for machines with no usable system Node on PATH. The checksums
 * below are the real published SHA-256 digests from
 * https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt for Node v22.23.1
 * `linux-x64`/`linux-arm64` `.tar.gz` archives — not fabricated values.
 *
 * This module is one importable implementation shared by:
 *   - `vibed update` (Node already running; can refresh a bundled Node), and
 *   - a pure-POSIX-shell bootstrap fallback embedded by `vibed-installer.ts`
 *     for machines with no system Node at all (which necessarily reimplements
 *     the download+verify+extract steps in `/bin/sh`, since Node cannot run
 *     yet — see design.md §6). Keeping the pinned version/checksums here
 *     means both paths cite the same one source of truth.
 */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const BUNDLED_NODE_VERSION = "v22.23.1";

/** @type {Record<string, { archive: string; sha256: string }>} */
export const BUNDLED_NODE_RELEASES = {
  x64: {
    archive: `node-${BUNDLED_NODE_VERSION}-linux-x64.tar.gz`,
    sha256: "7a8cb04b4a1df4eaf432125324b81b29a088e73570a23259a8de1c65d07fc129"
  },
  arm64: {
    archive: `node-${BUNDLED_NODE_VERSION}-linux-arm64.tar.gz`,
    sha256: "543fa39e57d4c07855939459a323f4deb9a79dd1bb45e6e99458b0f2de10db8d"
  }
};

/** @param {string} nodeArch `process.arch`, e.g. "x64" or "arm64" */
export function resolveBundledNodePlan(nodeArch) {
  const release = BUNDLED_NODE_RELEASES[nodeArch];
  if (!release) throw new Error(`No bundled Node build for architecture ${nodeArch}.`);
  return {
    version: BUNDLED_NODE_VERSION,
    url: `https://nodejs.org/dist/${BUNDLED_NODE_VERSION}/${release.archive}`,
    sha256: release.sha256,
    archiveName: release.archive
  };
}

/** @param {Buffer} buffer */
export function sha256Hex(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Downloads the pinned archive, rejects it before extraction if the digest
 * does not match, then extracts with the system `tar` binary (present on
 * every mainstream Linux desktop/server install; avoids depending on a
 * Node-native gzip+tar implementation for this rarely-exercised path).
 *
 * `options.plan` lets tests point at a fixture archive + its real digest
 * without touching the pinned production plan; production callers omit it
 * and get `resolveBundledNodePlan(options.nodeArch || process.arch)`.
 *
 * @param {{ destinationDir: string; nodeArch?: string; plan?: { url: string; sha256: string; version: string; archiveName: string };
 *   fetchImpl?: typeof fetch; execFileImpl?: typeof execFileAsync }} options
 * @returns {Promise<{ nodeBinary: string; version: string }>}
 */
export async function ensureBundledNode(options) {
  const plan = options.plan || resolveBundledNodePlan(options.nodeArch || process.arch);
  const fetchImpl = options.fetchImpl || fetch;
  const runExecFile = options.execFileImpl || execFileAsync;

  const response = await fetchImpl(plan.url);
  if (!response.ok) throw new Error(`Failed to download Node runtime: HTTP ${response.status}`);
  const archiveBuffer = Buffer.from(await response.arrayBuffer());
  const digest = sha256Hex(archiveBuffer);
  if (digest !== plan.sha256) {
    throw new Error(`Bundled Node archive checksum mismatch (expected ${plan.sha256}, got ${digest}).`);
  }

  await mkdir(options.destinationDir, { recursive: true, mode: 0o700 });
  const stagingDir = `${options.destinationDir}.staging-${process.pid}-${crypto.randomUUID()}`;
  await mkdir(stagingDir, { recursive: true, mode: 0o700 });
  try {
    const archivePath = path.join(stagingDir, plan.archiveName);
    await writeFile(archivePath, archiveBuffer, { mode: 0o600 });
    await runExecFile("tar", ["-xzf", archivePath, "-C", stagingDir, "--strip-components=1"]);
    await rm(archivePath, { force: true });
    await rm(options.destinationDir, { recursive: true, force: true });
    await rename(stagingDir, options.destinationDir);
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }

  return { nodeBinary: path.join(options.destinationDir, "bin", "node"), version: plan.version };
}
