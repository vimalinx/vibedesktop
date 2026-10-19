import { mkdtemp, mkdir, rm, stat, writeFile, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { updateApp, rollbackApp, uninstallApp } from "./app-lifecycle.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("Vibe Desktop app lifecycle", () => {
  it("removes the XDG desktop entry during uninstall while retaining user data", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "vibedesktop-uninstall-"));
    temporaryDirectories.push(home);
    const appRoot = path.join(home, "share", "vibedesktop", "app");
    const cliPath = path.join(home, "bin", "vibedesktop");
    const runCliPath = path.join(home, "bin", "vibedesktop-run");
    const unitPath = path.join(home, "config", "systemd", "user", "vibedesktop-app.service");
    const desktopPath = path.join(home, "share", "applications", "vibedesktop.desktop");
    const dataDir = path.join(home, "share", "vibedesktop-data");
    for (const target of [cliPath, runCliPath, unitPath, desktopPath, path.join(dataDir, "vibedesktop.json")]) {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, "fixture\n");
    }
    await mkdir(path.join(appRoot, "versions", "fixture"), { recursive: true });
    const commands = [];

    const result = await uninstallApp({
      appRoot,
      cliPath,
      runCliPath,
      unitPath,
      desktopPath,
      unit: "vibedesktop-app.service",
      dataDir,
      execFileImpl: async (command, args) => {
        commands.push([command, ...args]);
        return { stdout: "", stderr: "" };
      },
    });

    for (const removed of [appRoot, cliPath, runCliPath, unitPath, desktopPath]) {
      await expect(stat(removed)).rejects.toThrow();
      expect(result.removed).toContain(removed);
    }
    expect((await stat(dataDir)).isDirectory()).toBe(true);
    expect(result.dataPurged).toBe(false);
    expect(commands).toContainEqual(["systemctl", "--user", "disable", "--now", "vibedesktop-app.service"]);
    expect(commands).toContainEqual(["systemctl", "--user", "daemon-reload"]);
  });
});


describe("app update restart failures", () => {
  it("does not treat an old healthy process as a successful new release", async () => {
    const { switchCurrent, readCurrentVersionId } = await import("./version-store.mjs");
    const appRoot = await mkdtemp(path.join(tmpdir(), "vibedesktop-update-"));
    temporaryDirectories.push(appRoot);
    await mkdir(path.join(appRoot, "releases", "old"), { recursive: true });
    await switchCurrent(appRoot, "old");
    let restarts = 0;
    const execFileImpl = async (command, args) => {
      if (command === "git" && args[0] === "ls-remote") return { stdout: "abcdef1234567890\trefs/tags/v0.3.0\n" };
      if (command === "git" && args[0] === "clone") await mkdir(args.at(-1), { recursive: true });
      if (command === "mv") await rename(args[0], args[1]);
      if (command === "systemctl" && ++restarts === 1) throw new Error("restart refused");
      return { stdout: "" };
    };
    const result = await updateApp({ appRoot, repo: "file:///fixture", tag: "v0.3.0", unit: "fixture.service", execFileImpl, fetchImpl: async () => ({ ok: true }) });
    expect(result.rolledBack).toBe(true);
    expect(await readCurrentVersionId(appRoot)).toBe("old");
    expect(restarts).toBe(2);
    expect(await (await import("./version-store.mjs")).readLastKnownGoodVersionId(appRoot)).toBeNull();
  });
  it("restores the current version and reports an error when rollback cannot restart", async () => {
    const { switchCurrent, readCurrentVersionId } = await import("./version-store.mjs");
    const appRoot = await mkdtemp(path.join(tmpdir(), "vibedesktop-rollback-"));
    temporaryDirectories.push(appRoot);
    await mkdir(path.join(appRoot, "releases", "old"), { recursive: true });
    await mkdir(path.join(appRoot, "releases", "new"), { recursive: true });
    await switchCurrent(appRoot, "old"); await switchCurrent(appRoot, "new");
    let restarts = 0;
    const execFileImpl = async () => { if (++restarts === 1) throw Error("restart refused"); return {stdout:""}; };
    await expect(rollbackApp({appRoot,unit:"fixture.service",execFileImpl,fetchImpl:async()=>({ok:true})})).rejects.toThrow("has been restored");
    expect(await readCurrentVersionId(appRoot)).toBe("new");
  });
});
