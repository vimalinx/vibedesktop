// Runs in a separate user unit so app restarts do not kill the update transaction.
import { writeFile, rename, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { updateApp, rollbackApp } from "./app-lifecycle.mjs";
import { isMainModule } from "../cli-entry.mjs";
export async function runUiUpdate({
  action,
  appRoot,
  stateFile,
  origin,
  repo,
  dataFile,
}) {
  const report = async (state, detail) => {
    const temp = stateFile + `.${process.pid}.tmp`;
    await writeFile(
      temp,
      JSON.stringify({ state, detail, action, at: new Date().toISOString() }),
      { mode: 0o600 },
    );
    await rename(temp, stateFile);
  };
  await report(
    "running",
    action === "update"
      ? "下载、构建并验证新版 / Download, build and verify"
      : "切换旧版并检查服务 / Switch version and check service",
  );
  try {
    if (dataFile) {
      const dir = path.join(
        path.dirname(dataFile),
        "backups",
        `before-${action}-${Date.now()}`,
      );
      await mkdir(dir, { recursive: true, mode: 0o700 });
      await copyFile(dataFile, path.join(dir, "vibedesktop.json"));
    }
    const options = { appRoot, unit: "vibedesktop-app.service", origin };
    const result =
      action === "rollback"
        ? await rollbackApp(options)
        : await updateApp({
            ...options,
            repo,
            npmPath: path.join(path.dirname(process.execPath), "npm"),
          });
    const health = await fetch(`${origin}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!health.ok)
      throw Error("App health check failed after version switch.");
    await report(
      result.rolledBack ? "error" : "success",
      JSON.stringify(result),
    );
  } catch (error) {
    await report(
      "error",
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}
if (isMainModule(import.meta.url)) {
  const [action, appRoot, stateFile, origin, repo, dataFile] =
    process.argv.slice(2);
  if (!["update", "rollback"].includes(action))
    throw Error("Invalid version action");
  await runUiUpdate({ action, appRoot, stateFile, origin, repo, dataFile });
}
