import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
export async function installedVersion() {
  const cwd = await realpath(process.cwd());
  const meta = await readFile(path.join(cwd, ".installed-version.json"), "utf8")
    .then(JSON.parse)
    .catch(() => null);
  const managed = Boolean(
    meta &&
      path.basename(path.dirname(cwd)) === "releases" &&
      (await realpath(path.join(cwd, "../..", "current")).catch(() => null)) ===
        cwd,
  );
  const appRoot = managed ? path.resolve(cwd, "../..") : null;
  const previous = appRoot
    ? await readFile(path.join(appRoot, "lkg.json"), "utf8")
        .then(JSON.parse)
        .then((v) => (typeof v.previous === "string" ? v.previous : null))
        .catch(() => null)
    : null;
  const repo =
    meta &&
    typeof meta.repo === "string" &&
    /^(https:\/\/|file:\/\/)/.test(meta.repo)
      ? meta.repo
      : null;
  const version =
    typeof meta?.version === "string"
      ? meta.version
      : `source-${JSON.parse(await readFile(path.join(cwd, "package.json"), "utf8")).version}`;
  const notes = await readFile(path.join(cwd, "CHANGELOG.md"), "utf8").catch(
    () => "",
  );
  return {
    version,
    managed,
    appRoot,
    repo,
    previous,
    notes: notes.slice(0, 8000),
    local: version.includes("local.") || !managed,
    installedAt: meta?.installedAt || null,
  };
}
export function updateStateFile() {
  return path.join(
    path.dirname(
      path.resolve(process.env.VIBE_DATA_FILE || ".data/vibedesktop-dev.json"),
    ),
    "app-update.json",
  );
}
export async function versionStatus(check = false) {
  const info = await installedVersion();
  let task = await readFile(updateStateFile(), "utf8")
    .then(JSON.parse)
    .catch(() => null);
  if (task?.state === "running") {
    const active = await exec(
      "systemctl",
      ["--user", "is-active", "vibedesktop-update.service"],
      { timeout: 3000 },
    )
      .then((r) => r.stdout.trim() === "active")
      .catch(() => false);
    if (!active && Date.now() - Date.parse(task.at) > 15000)
      task = {
        ...task,
        state: "error",
        detail:
          "更新任务已中断，请检查版本与服务状态后重试。 / Update interrupted; check the installed version and service before retrying.",
      };
  }
  let latest: string | null = null;
  if (check && info.repo && !info.local) {
    const { stdout } = await exec(
      "git",
      ["ls-remote", "--tags", "--sort=-v:refname", info.repo],
      { timeout: 15000, maxBuffer: 1024 * 1024 },
    );
    latest =
      stdout
        .split("\n")
        .map((line) => line.split("refs/tags/")[1])
        .find((tag) => /^v?\d+\.\d+\.\d+$/.test(tag || "")) || null;
  }
  return {
    version: info.version,
    managed: info.managed,
    previous: info.previous,
    notes: info.notes,
    local: info.local,
    installedAt: info.installedAt,
    canUpdate: Boolean(info.managed && info.repo && !info.local),
    canRollback: Boolean(info.managed && info.previous),
    latest,
    task,
  };
}
