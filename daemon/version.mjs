// @ts-check
/**
 * Single owner of the daemon's release version string, imported by
 * `server.mjs` (health response) instead of hardcoding its own copy.
 *
 * When running from an installed, versioned runtime tree
 * (`versions/<versionId>/daemon/...`), `resolveRuntimeVersion` prefers the
 * precise content-addressed version id recorded in the sibling
 * `manifest.json` written by the installer. A repository checkout (e.g.
 * `npm run daemon`) has no such manifest and falls back to this constant.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

export const DAEMON_RELEASE_VERSION = "0.1.6";

/**
 * @param {string} daemonDir Absolute path to the running `daemon/` directory
 *   (typically `path.dirname(fileURLToPath(import.meta.url))` from within
 *   `daemon/server.mjs`).
 * @returns {Promise<string>}
 */
export async function resolveRuntimeVersion(daemonDir) {
  try {
    const manifestPath = path.join(daemonDir, "..", "manifest.json");
    const raw = await readFile(manifestPath, "utf8");
    const manifest = JSON.parse(raw);
    if (manifest && typeof manifest === "object" && typeof manifest.version === "string" && manifest.version) {
      return manifest.version;
    }
  } catch {
    // No manifest — repository checkout or --install-only debug run.
  }
  return DAEMON_RELEASE_VERSION;
}
