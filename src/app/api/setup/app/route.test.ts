import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, rm, stat, readFile } from "node:fs/promises";
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
    const usage = "vibedesktop [open|status|start|stop|restart|logs|update|rollback|uninstall]";
    expect(installer).toContain(usage);
    expect(installer).toContain("vibedesktop-app.service");
    expect(installer).toContain("vibedesktop-run");
    // Composition with vibed must use the canonical user-scoped CLI and always
    // refresh the matching runtime instead of preserving an older daemon.
    expect(installer).toContain('VIBED_BIN="$HOME/.local/bin/vibed"');
    expect(installer).toContain("Installing the matching vibed daemon");
    expect(installer).not.toContain('if [ ! -x "$VIBED_BIN" ]');
    expect(installer).toContain('VIBED_INSTALLER_URL="https://github.com/vimalinx/vibedesktop/releases/download/$TAG/install.sh"');
    expect(installer).toContain('| sh -s -- --install-only');
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

  // Full E2E install (git clone + npm ci + next build) is opt-in via
  // VIBE_TEST_APP_INSTALLER_E2E=1 — it needs network, ~minutes, and disk.
  // Mirrors the opt-in pattern of daemon/cloud/bundled-node.test.mjs.
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
      expect(unitText).toContain("ExecStart=%h/.local/bin/vibedesktop-run");
      expect(unitText).toContain(`WorkingDirectory=${appCurrent}`);
      expect(unitText).toContain(`VIBE_DATA_FILE=${path.join(home, ".local", "share", "vibedesktop-data", "vibedesktop.json")}`);
      expect(unitText).toContain(`VIBE_DAEMON_DATA_DIR=${path.join(home, ".local", "share", "vibed-vibedesktop")}`);
      expect(unitText).not.toContain("vibedesktop-data/vibed-vibedesktop");
      expect(unitText).toContain("Wants=network-online.target vibedesktop-daemon.service");
      expect(unitText).toContain("VIBE_APP_PORT=43117");
      expect((await stat(unit)).mode & 0o777).toBe(0o600);
    },
    600_000
  );
});
