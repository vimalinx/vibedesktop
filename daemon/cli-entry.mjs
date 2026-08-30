// @ts-check
/**
 * Shared "is this file the CLI entry point" check for daemon scripts.
 *
 * The installed runtime always invokes lifecycle scripts through
 * `${runtimeRoot}/current/...`, where `current` is a symlink into
 * `versions/<versionId>/...` (see `version-store.mjs`). Node resolves
 * `import.meta.url` through that symlink to the real `versions/...` path,
 * while `process.argv[1]` stays the literal `current/...` invocation path —
 * so a naive `path.resolve(argv[1]) === fileURLToPath(import.meta.url)`
 * check is always false for any script invoked through `current`, silently
 * skipping every CLI command (`vibed health`, `vibed update`, ...).
 * Resolve both sides through the filesystem before comparing.
 */
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** @param {string} moduleUrl */
export function isMainModule(moduleUrl) {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}
