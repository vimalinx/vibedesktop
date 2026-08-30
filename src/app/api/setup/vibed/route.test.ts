import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, readFile, readlink, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/setup/vibed/route";

const temporaryHomes: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryHomes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

describe("GET /api/setup/vibed", () => {
  it("installs an isolated runtime, service, CLI, and skill", async () => {
    const response = await GET();
    const installer = await response.text();
    const home = await mkdtemp(path.join(tmpdir(), "vibed-installer-"));
    temporaryHomes.push(home);
    const dataHome = path.join(home, "data");
    const configHome = path.join(home, "config");
    const isolatedEnv = { ...process.env, HOME: home, XDG_DATA_HOME: dataHome, XDG_CONFIG_HOME: configHome };

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/x-shellscript");
    expect(installer).not.toContain(process.cwd());

    execFileSync("sh", ["-s", "--", "--install-only"], {
      input: installer,
      env: isolatedEnv,
      maxBuffer: 8 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"]
    });

    const runtimeRoot = path.join(dataHome, "vibedesktop", "runtime");
    const currentLink = path.join(runtimeRoot, "current");
    const installedServer = path.join(currentLink, "daemon", "server.mjs");
    const installedSkill = path.join(home, ".claude", "skills", "add_app", "scan.py");
    const installedCodexManager = path.join(home, ".codex", "skills", "add-app", "manager.py");
    const installedCli = path.join(home, ".local", "bin", "vibed");
    const installedUnit = path.join(configHome, "systemd", "user", "vibedesktop-daemon.service");

    // Versioned layout: `current` is a relative symlink into `versions/<versionId>`,
    // never a flat copy — this is what makes atomic update/rollback possible.
    const linkTarget = await readlink(currentLink);
    expect(linkTarget.split(path.sep)[0]).toBe("versions");
    expect((await stat(currentLink)).isDirectory()).toBe(true);

    expect(await readFile(installedServer)).toEqual(await readFile(path.join(process.cwd(), "daemon", "server.mjs")));
    expect(await readFile(installedSkill)).toEqual(await readFile(path.join(process.cwd(), ".claude", "skills", "add_app", "scan.py")));
    expect(await readFile(installedCodexManager)).toEqual(await readFile(path.join(process.cwd(), ".claude", "skills", "add_app", "manager.py")));
    expect((await stat(installedServer)).mode & 0o777).toBe(0o600);
    expect((await stat(installedSkill)).mode & 0o777).toBe(0o600);
    expect((await stat(installedCli)).mode & 0o777).toBe(0o700);
    expect((await stat(installedUnit)).mode & 0o777).toBe(0o600);
    const unit = await readFile(installedUnit, "utf8");
    expect(unit).not.toContain("VIBE_CLOUD_CONTROL_ENABLED");
    expect(unit).not.toContain("WorkingDirectory=");
    execFileSync("sh", ["-n", installedCli]);

    const child = spawn(installedCli, ["run"], {
      env: isolatedEnv,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const output: string[] = [];
    child.stdout?.on("data", (chunk) => output.push(String(chunk)));
    child.stderr?.on("data", (chunk) => output.push(String(chunk)));
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    try {
      const health = await waitForHealth(path.join(dataHome, "vibed-vibedesktop"));
      expect(health.ok).toBe(true);
      expect(execFileSync(installedCli, ["health"], { env: isolatedEnv, encoding: "utf8" })).toContain("vibed is healthy");
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : "runtime smoke failed"}\n${output.join("").slice(-2000)}`);
    } finally {
      child.kill("SIGTERM");
      await Promise.race([exited, delay(3_000)]);
      if (child.exitCode === null) child.kill("SIGKILL");
    }

    const resolvedState = execFileSync("python3", [
      "-c",
      "import sys; sys.path.insert(0, sys.argv[1]); import scan; print(scan.daemon_data_dir())",
      path.dirname(installedSkill)
    ], {
      env: isolatedEnv,
      encoding: "utf8"
    }).trim();
    expect(resolvedState).toBe(path.join(dataHome, "vibed-vibedesktop"));

    // Real `vibed uninstall` through the installed CLI wrapper (not the module
    // directly): removes managed files, keeps device identity/app config by
    // default, and requires the double-confirm flags to purge that state too.
    const stateDir = path.join(dataHome, "vibed-vibedesktop");
    execFileSync(installedCli, ["uninstall"], { env: isolatedEnv, encoding: "utf8" });
    await expect(stat(runtimeRoot)).rejects.toThrow();
    await expect(stat(installedCli)).rejects.toThrow();
    await expect(stat(installedUnit)).rejects.toThrow();
    await expect(stat(path.dirname(installedSkill))).rejects.toThrow();
    expect((await stat(stateDir)).isDirectory()).toBe(true);
    expect((await readFile(path.join(stateDir, "daemon.token"), "utf8")).length).toBeGreaterThan(0);
  });

  it("installs under set -eu with a real clean account where XDG_DATA_HOME/XDG_CONFIG_HOME are simply absent, not just empty", async () => {
    // A genuinely clean Linux account (no desktop session ever set these) has
    // XDG_DATA_HOME/XDG_CONFIG_HOME *unset*, not set to "". The pure-`/bin/sh`
    // preamble runs under `set -eu`, so referencing an unset var directly
    // (e.g. `case "$XDG_DATA_HOME" in ...`) aborts with "unbound variable"
    // before Node.js ever starts. Caught by a real disposable Arch systemd
    // container with no XDG env at all — see design.md / implement.md AC2.
    const response = await GET();
    const installer = await response.text();
    const home = await mkdtemp(path.join(tmpdir(), "vibed-installer-no-xdg-"));
    temporaryHomes.push(home);
    const isolatedEnv: NodeJS.ProcessEnv = { ...process.env, HOME: home };
    delete isolatedEnv.XDG_DATA_HOME;
    delete isolatedEnv.XDG_CONFIG_HOME;

    execFileSync("sh", ["-s", "--", "--install-only"], {
      input: installer,
      env: isolatedEnv,
      maxBuffer: 8 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"]
    });

    const currentLink = path.join(home, ".local", "share", "vibedesktop", "runtime", "current");
    expect((await stat(currentLink)).isDirectory()).toBe(true);
    expect((await stat(path.join(home, ".config", "systemd", "user", "vibedesktop-daemon.service"))).mode & 0o777).toBe(0o600);
  });
});

async function waitForHealth(dataDir: string): Promise<{ ok: boolean }> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const port = (await readFile(path.join(dataDir, "daemon.port"), "utf8")).trim();
      const token = (await readFile(path.join(dataDir, "daemon.token"), "utf8")).trim();
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        headers: { authorization: `Bearer ${token}` }
      });
      if (response.ok) return await response.json() as { ok: boolean };
    } catch {
      // The isolated runtime may still be creating its private endpoint files.
    }
    await delay(100);
  }
  throw new Error("Installed vibed runtime did not become healthy.");
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
