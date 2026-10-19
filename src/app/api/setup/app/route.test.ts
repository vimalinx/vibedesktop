import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, stat, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/setup/app/route";

const temporaryHomes: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryHomes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

describe("GET /api/setup/app", () => {
  let installer: string;

  beforeEach(async () => {
    const response = await GET();
    installer = await response.text();
  });

  it("serves a POSIX shellscript with the right headers", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/x-shellscript");
    expect(response.headers.get("content-disposition")).toContain("install-vibedesktop.sh");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("is syntactically valid POSIX sh and never leaks the build working directory", () => {
    expect(installer).not.toContain(process.cwd());
    expect(installer).toContain("set -eu");
    expect(installer).toContain("Copyright 2026 Vimalinx");
    expect(installer).toContain("SPDX-License-Identifier: Apache-2.0");
    // sh -n is a pure syntax check — no execution, no network.
    execFileSync("sh", ["-n"], { input: installer, stdio: ["pipe", "pipe", "pipe"], encoding: "utf8" });
  });

  it("exposes the documented CLI subcommands and the systemd unit name", () => {
    const usage = "vibedesktop [open|status|start|stop|restart|logs|add <dir> [--plan|--start] [--name NAME]|scan|update|rollback|uninstall]";
    expect(installer).toContain(usage);
    expect(installer).toContain("vibedesktop-app.service");
    expect(installer).toContain("vibedesktop-run");
    expect(installer).toContain("vibedesktop.desktop");
    expect(installer).toContain('Exec=__EXEC__ open');
    expect(installer).toContain('path.join(appRoot, "current", "public", "icon.svg")');
    expect(installer).toContain('--desktop-path \\"$DESKTOP_PATH\\"');
    // Composition with vibed must use the canonical user-scoped CLI and always
    // refresh the matching runtime instead of preserving an older daemon.
    expect(installer).toContain('case "${XDG_BIN_HOME:-}" in /*) BIN_HOME=$XDG_BIN_HOME ;; esac');
    expect(installer).toContain('VIBED_BIN="$BIN_HOME/vibed"');
    expect(installer).toContain('VIBE_DAEMON_RUNTIME_DIR=');
    expect(installer).toContain('VIBE_DAEMON_CONFIG_DIR=');
    expect(installer).toContain('VIBE_DAEMON_STATE_DIR=');
    expect(installer).toContain("Installing the matching vibed daemon");
    expect(installer).not.toContain('if [ ! -x "$VIBED_BIN" ]');
    expect(installer).toContain('VIBED_INSTALLER_URL="https://github.com/vimalinx/vibedesktop/releases/download/$TAG/install.sh"');
    expect(installer).toContain('curl -fsSL "$VIBED_INSTALLER_URL" -o "$VIBED_INSTALLER_TMP"');
    expect(installer).toContain('sh "$VIBED_INSTALLER_TMP" --install-only');
    expect(installer).not.toContain('| sh -s -- --install-only');
    expect(installer).toContain('NPM="$(dirname "$NODE")/npm"');
    expect(installer).toContain("VIBEDESKTOP_INSTALL_NPM");
    expect(installer).toContain("VIBEDESKTOP_INSTALL_PORT");
    expect(installer).toContain("VIBE_APP_ORIGIN");
    expect(installer).toContain("http://127.0.0.1:$APP_PORT");
    expect(installer).toContain("VIBE_DESKTOP_URL");
    expect(installer).toContain("systemctl --user enable vibedesktop-daemon.service");
    expect(installer).toContain("systemctl --user restart vibedesktop-daemon.service");
    expect(installer).toContain('"$VIBED_BIN" health');
  });

  it("rejects non-Linux and requires git + Node 20 before doing anything", () => {
    expect(installer).toContain('uname -s');
    expect(installer).toContain('command -v git');
    expect(installer).toContain("Node.js 20 or newer");
  });

  it("honors --tag and --repo overrides without contacting the network", () => {
    // --install-only path still reaches the git clone, so we only assert the
    // argument parser is wired and the version-id resolution block is present.
    expect(installer).toContain("--tag");
    expect(installer).toContain("--repo");
    expect(installer).toContain("--port");
    expect(installer).toContain("--npm");
    expect(installer).toContain("--install-only");
    expect(installer).toContain("--vibed-installer-url");
    expect(installer).toContain("git ls-remote");
    expect(installer).toContain('VERSION_ID="$TAG+$COMMIT_SHA"');
    expect(installer).toContain("No free Vibe Desktop port was found from 3000 through 3010");
    expect(installer).toContain('http://127.0.0.1:$APP_PORT/api/desktop');
    expect(installer).not.toContain("http://localhost:3000/api/desktop");
  });

  it("rejects an invalid explicit port before contacting git", () => {
    const result = spawnSync("sh", ["-s", "--", "--install-only", "--port", "not-a-port"], {
      input: installer,
      encoding: "utf8"
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Invalid --port value: not-a-port");
  });

  it("fails closed when the matching vibed installer download fails", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "vibedesktop-app-download-failure-"));
    temporaryHomes.push(home);
    const repo = path.join(home, "fixture-repo");
    await mkdir(repo);
    await writeFile(path.join(repo, "package.json"), JSON.stringify({
      name: "installer-fixture",
      version: "1.0.0",
      scripts: { build: "node -e \"\"" }
    }));
    await writeFile(path.join(repo, "package-lock.json"), JSON.stringify({
      name: "installer-fixture",
      version: "1.0.0",
      lockfileVersion: 3,
      requires: true,
      packages: { "": { name: "installer-fixture", version: "1.0.0" } }
    }));
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repo });
    execFileSync("git", ["add", "package.json", "package-lock.json"], { cwd: repo });
    execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture"], { cwd: repo });
    execFileSync("git", ["tag", "v0.1.4"], { cwd: repo });

    const result = spawnSync("sh", ["-s", "--", "--install-only", "--repo", `file://${repo}`, "--tag", "v0.1.4", "--port", "43118", "--vibed-installer-url", "file:///definitely-missing-vibed-installer"], {
      input: installer,
      encoding: "utf8",
      env: { ...process.env, HOME: home, XDG_DATA_HOME: path.join(home, "data"), XDG_CONFIG_HOME: path.join(home, "config") },
      maxBuffer: 20 * 1024 * 1024,
      timeout: 60_000
    });

    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("Installing the matching vibed daemon");
    expect(result.stdout).not.toContain("Vibe Desktop and vibed files installed");
  }, 60_000);

  // Full E2E install (git clone + npm ci + next build) is opt-in via
  // VIBE_TEST_APP_INSTALLER_E2E=1 — it needs network, ~minutes, and disk.
  // Mirrors the opt-in pattern of daemon/release/bundled-node.test.mjs.
  it.runIf(process.env.VIBE_TEST_APP_INSTALLER_E2E === "1")(
    "installs the whole program under an isolated HOME and the CLI's status command parses",
    async () => {
      const home = await mkdtemp(path.join(tmpdir(), "vibedesktop-app-installer-"));
      temporaryHomes.push(home);
      const isolatedEnv: NodeJS.ProcessEnv = { ...process.env, HOME: home };
      delete isolatedEnv.XDG_DATA_HOME;
      delete isolatedEnv.XDG_CONFIG_HOME;

      execFileSync("sh", ["-s", "--", "--install-only", "--port", "43117"], {
        input: installer,
        env: isolatedEnv,
        maxBuffer: 1_000 * 1024 * 1024,
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 600_000
      });

      const appCurrent = path.join(home, ".local", "share", "vibedesktop", "app", "current");
      expect((await stat(appCurrent)).isDirectory()).toBe(true);
      const versionFile = path.join(appCurrent, ".installed-version.json");
      const version = JSON.parse(await readFile(versionFile, "utf8"));
      expect(typeof version.version).toBe("string");
      expect(version.version).toMatch(/^v\d+\.\d+\.\d+\+[0-9a-f]{12}$/);
      expect(version.port).toBe(43117);

      const cli = path.join(home, ".local", "bin", "vibedesktop");
      const runCli = path.join(home, ".local", "bin", "vibedesktop-run");
      expect((await stat(cli)).mode & 0o777).toBe(0o700);
      expect((await stat(runCli)).mode & 0o777).toBe(0o700);
      execFileSync("sh", ["-n", cli], { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
      execFileSync("sh", ["-n", runCli], { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });

      const unit = path.join(home, ".config", "systemd", "user", "vibedesktop-app.service");
      const unitText = await readFile(unit, "utf8");
      expect(unitText).toContain(`ExecStart=${runCli}`);
      expect(unitText).toContain(`WorkingDirectory=${appCurrent}`);
      expect(unitText).toContain(`VIBE_DATA_FILE=${path.join(home, ".local", "state", "vibedesktop", "vibedesktop.json")}`);
      expect(unitText).toContain(`VIBE_DAEMON_CONFIG_DIR=${path.join(home, ".config", "vibed")}`);
      expect(unitText).toContain(`VIBE_DAEMON_STATE_DIR=${path.join(home, ".local", "state", "vibed")}`);
      expect(unitText).toContain(`VIBE_DAEMON_RUNTIME_DIR=${path.join(home, ".local", "state", "runtime", "vibed")}`);
      expect(unitText).not.toContain("vibedesktop-data/vibed-vibedesktop");
      expect(unitText).toContain("Wants=network-online.target vibedesktop-daemon.service");
      expect(unitText).toContain("VIBE_APP_PORT=43117");
      expect((await stat(unit)).mode & 0o777).toBe(0o600);

      const desktopEntry = path.join(home, ".local", "share", "applications", "vibedesktop.desktop");
      const desktopEntryText = await readFile(desktopEntry, "utf8");
      expect(desktopEntryText).toContain(`Exec="${cli}" open`);
      expect(desktopEntryText).toContain(`Icon=${path.join(appCurrent, "public", "icon.svg")}`);
      expect(desktopEntryText).not.toContain(process.cwd());
      expect((await stat(desktopEntry)).mode & 0o777).toBe(0o644);
    },
    600_000
  );
});
