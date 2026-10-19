// @ts-check
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule } from "./cli-entry.mjs";

/**
 * Check the private loopback endpoint without placing its bearer token in argv
 * or output. This reports daemon readiness, not an individual managed app's
 * loopback socket readiness.
 *
 * @param {{ runtimeDir?: string; dataDir?: string; fetchImpl?: typeof fetch }} options
 */
export async function checkVibedHealth(options) {
  const runtimeDir = options.runtimeDir || options.dataDir;
  if (!runtimeDir) return false;
  try {
    const [portText, tokenText] = await Promise.all([
      readFile(path.join(runtimeDir, "daemon.port"), "utf8"),
      readFile(path.join(runtimeDir, "daemon.token"), "utf8"),
    ]);
    const port = Number(portText.trim());
    const token = tokenText.trim();
    if (!Number.isSafeInteger(port) || port < 1 || port > 65_535 || token.length < 32) return false;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2_000);
    try {
      const response = await (options.fetchImpl || fetch)(`http://127.0.0.1:${port}/health`, {
        headers: { authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!response.ok) return false;
      const payload = await response.json();
      return Boolean(payload && typeof payload === "object" && "ok" in payload && payload.ok === true);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

const isMain = isMainModule(import.meta.url);
if (isMain) {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const runtimeDir = path.resolve(
    process.env.VIBE_DAEMON_RUNTIME_DIR ||
    process.env.VIBE_DAEMON_DATA_DIR ||
    path.join(projectRoot, ".data")
  );
  checkVibedHealth({ runtimeDir }).then((healthy) => {
    if (healthy) {
      console.log("vibed is healthy");
    } else {
      console.error("vibed is not reachable");
      process.exitCode = 1;
    }
  });
}
