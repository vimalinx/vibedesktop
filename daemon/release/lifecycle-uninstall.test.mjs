import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PURGE_CONFIRMATION_FLAG, PURGE_FLAG, uninstallVibed } from "./lifecycle-uninstall.mjs";

const roots = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "vibed-uninstall-"));
  roots.push(root);
  return root;
}

async function setUpInstalledLayout() {
  const home = await tempRoot();
  const runtimeRoot = path.join(home, "data", "vibedesktop", "runtime");
  const dataDir = path.join(home, "data", "vibed-vibedesktop");
  const cliPath = path.join(home, "bin", "vibed");
  const unitPath = path.join(home, "config", "systemd", "user", "vibedesktop-daemon.service");
  const skillRoots = [
    path.join(home, "claude", "skills", "add_app"),
    path.join(home, "codex", "skills", "add-app"),
    path.join(home, "agents", "skills", "add-app")
  ];

  await mkdir(path.join(runtimeRoot, "versions", "0.1.0+abc"), { recursive: true });
  await writeFile(path.join(runtimeRoot, "versions", "0.1.0+abc", "manifest.json"), "{}");
  await mkdir(path.dirname(cliPath), { recursive: true });
  await writeFile(cliPath, "#!/bin/sh\necho vibed\n", { mode: 0o700 });
  await mkdir(path.dirname(unitPath), { recursive: true });
  await writeFile(unitPath, "[Unit]\n");
  for (const skillRoot of skillRoots) {
    await mkdir(skillRoot, { recursive: true });
    await writeFile(path.join(skillRoot, "SKILL.md"), "# skill");
  }
  await mkdir(dataDir, { recursive: true });
  await writeFile(path.join(dataDir, "vibed-identity.json"), "{\"deviceId\":\"device-1\"}");

  return { runtimeRoot, dataDir, cliPath, unitPath, skillRoots };
}

const noopExecFile = async () => ({ stdout: "", stderr: "" });

describe("uninstallVibed", () => {
  it("removes managed files but keeps the state directory by default", async () => {
    const layout = await setUpInstalledLayout();
    const result = await uninstallVibed({ ...layout, unit: "vibedesktop-daemon.service", execFileImpl: noopExecFile });

    expect(result.dataPurged).toBe(false);
    await expect(readFile(layout.cliPath)).rejects.toThrow();
    await expect(readFile(layout.unitPath)).rejects.toThrow();
    await expect(readFile(path.join(layout.runtimeRoot, "versions", "0.1.0+abc", "manifest.json"))).rejects.toThrow();
    for (const skillRoot of layout.skillRoots) {
      await expect(readFile(path.join(skillRoot, "SKILL.md"))).rejects.toThrow();
    }
    const identity = await readFile(path.join(layout.dataDir, "vibed-identity.json"), "utf8");
    expect(identity).toContain("device-1");
  });

  it("rejects --purge-data without the explicit confirmation flag", async () => {
    const layout = await setUpInstalledLayout();
    await expect(uninstallVibed({
      ...layout,
      unit: "vibedesktop-daemon.service",
      purgeData: true,
      confirmPurgeData: false,
      execFileImpl: noopExecFile
    })).rejects.toThrow(new RegExp(`${PURGE_FLAG.replace("--", "--")}.*${PURGE_CONFIRMATION_FLAG}`));

    const identity = await readFile(path.join(layout.dataDir, "vibed-identity.json"), "utf8");
    expect(identity).toContain("device-1");
  });

  it("deletes the state directory only when both purge flags are set together", async () => {
    const layout = await setUpInstalledLayout();
    const result = await uninstallVibed({
      ...layout,
      unit: "vibedesktop-daemon.service",
      purgeData: true,
      confirmPurgeData: true,
      execFileImpl: noopExecFile
    });

    expect(result.dataPurged).toBe(true);
    await expect(readFile(path.join(layout.dataDir, "vibed-identity.json"))).rejects.toThrow();
  });

  it("still removes managed files even if the systemd calls fail (e.g. no user session)", async () => {
    const layout = await setUpInstalledLayout();
    const failingExecFile = async () => { throw new Error("no systemd user session"); };
    const result = await uninstallVibed({ ...layout, unit: "vibedesktop-daemon.service", execFileImpl: failingExecFile });
    expect(result.removed).toContain(layout.runtimeRoot);
    await expect(readFile(layout.cliPath)).rejects.toThrow();
  });

  it("disables only the systemd unit loaded from the exact file being removed", async () => {
    const layout = await setUpInstalledLayout();
    const calls = [];
    const matchingExecFile = async (command, args) => {
      calls.push([command, ...args]);
      return {
        stdout: args.includes("--property=FragmentPath") ? `${layout.unitPath}\n` : "",
        stderr: ""
      };
    };

    await uninstallVibed({
      ...layout,
      unit: "vibedesktop-daemon.service",
      execFileImpl: matchingExecFile
    });

    expect(calls).toContainEqual([
      "systemctl", "--user", "disable", "--now", "vibedesktop-daemon.service"
    ]);
  });

  it("does not disable a same-named live unit loaded from another installation", async () => {
    const layout = await setUpInstalledLayout();
    const calls = [];
    const mismatchedExecFile = async (command, args) => {
      calls.push([command, ...args]);
      return {
        stdout: args.includes("--property=FragmentPath")
          ? "/home/user/.config/systemd/user/vibedesktop-daemon.service\n"
          : "",
        stderr: ""
      };
    };

    await uninstallVibed({
      ...layout,
      unit: "vibedesktop-daemon.service",
      execFileImpl: mismatchedExecFile
    });

    expect(calls).not.toContainEqual([
      "systemctl", "--user", "disable", "--now", "vibedesktop-daemon.service"
    ]);
    expect(calls).toContainEqual(["systemctl", "--user", "daemon-reload"]);
  });
});
