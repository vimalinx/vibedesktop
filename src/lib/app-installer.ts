/**
 * Whole-program installer for the Vibe Desktop Next.js app.
 *
 * Mirrors the `vibed` installer's design (src/lib/vibed-installer.ts):
 *   - Linux-only, non-root, user-scoped XDG paths.
 *   - Versioned, git-sourced app tree under
 *     ${XDG_DATA_HOME:-~/.local/share}/vibedesktop/app/versions/<id>/
 *     with an atomic `current` symlink and an lkg.json rollback target.
 *   - A generated `vibedesktop` CLI wrapper with
 *     status/logs/start/stop/restart/update/rollback/uninstall.
 *   - A systemd user unit running `next start`.
 *   - A Node-less /bin/sh preamble that downloads a pinned Node build when no
 *     system Node >= 20 is on PATH (same bootstrap as vibed).
 *
 * Update model (git clone + git pull, per the chosen source model):
 *   - First install: git clone --branch <tag> <repo> into versions/<id>.
 *   - update: git fetch + reset --hard <latest-tag> into a fresh staging dir,
 *     npm ci, next build, atomic switch of `current`, health poll, LKG rollback
 *     on failure. State dir (vibedesktop-data) is never touched.
 *
 * The app talks to vibed via VIBE_DAEMON_DATA_DIR, which the generated unit
 * points at the vibed state directory — so the two installers compose: this
 * one runs the vibed installer first if `vibed` is not already on PATH.
 *
 * Unlike the vibed installer, the app source is far too large to base64-embed,
 * so this generator emits a self-contained shell script that performs the git
 * clone/build at install time rather than staging embedded bytes. Version
 * identity is the git tag + short commit sha.
 */

import packageJson from "../../package.json";

/** Canonical git source. Mirrors package.json `repository.url`. */
export const APP_INSTALL_REPO = "https://github.com/vimalinx/vibedesktop.git";

/** Tag/version to install. The CLI `update` resolves the latest tag from the
 *  same repo at update time, so this is only the first-install default. */
export const APP_INSTALL_TAG = `v${packageJson.version}`;

/** Pinned official Node.js Linux build used when a target machine has no
 *  usable system Node. Kept byte-identical to the vibed installer's pinned
 *  version/checksums (src/lib/vibed-installer.ts) so both installers agree. */
export const BUNDLED_NODE_VERSION = "v22.23.1";
export const BUNDLED_NODE_CHECKSUMS: Record<"x64" | "arm64", string> = {
  x64: "7a8cb04b4a1df4eaf432125324b81b29a088e73570a23259a8de1c65d07fc129",
  arm64: "543fa39e57d4c07855939459a323f4deb9a79dd1bb45e6e99458b0f2de10db8d"
};

export const APP_RELEASE_VERSION = APP_INSTALL_TAG;

export const appInstallerPath = "/api/setup/app";

/**
 * Builds the self-contained POSIX installer for `GET /api/setup/app`.
 *
 * The script:
 *   1. Verifies Linux and git.
 *   2. Bootstraps a pinned Node if none >= 20 is on PATH.
 *   3. Resolves the install tag (defaults to the embedded tag; `--tag` overrides).
 *   4. Computes a version id = "<tag>+<commitSha12>" via `git ls-remote`.
 *   5. Clones the repo at that tag into versions/<versionId>, runs npm ci +
 *      next build, drops .git to keep the tree small.
 *   6. Atomically switches `current` to the new version, records LKG.
 *   7. Writes the `vibedesktop` CLI wrapper, the `vibedesktop-run` launcher,
 *      and the systemd user unit.
 *   8. If `vibed` is not on PATH, pipes the existing vibed installer through sh
 *      first (composition, not duplication).
 *   9. Enables + restarts the app service, polls the app origin for health.
 *  10. On health failure with an existing LKG, rolls back to it.
 */
export function buildAppInstaller(): string {
  const wrapperTemplate = [
    "#!/bin/sh",
    "set -eu",
    "NODE=__NODE__",
    'APP_ROOT=__APP_ROOT__',
    'APP="$APP_ROOT/current"',
    "DATA_DIR=__DATA_DIR__",
    "DAEMON_DATA_DIR=__DAEMON_DATA_DIR__",
    "APP_PORT=__APP_PORT__",
    "REPO=__REPO__",
    "UNIT_PATH=__UNIT_PATH__",
    "UNIT=vibedesktop-app.service",
    'if [ ! -x "$NODE" ]; then NODE=$(command -v node || true); fi',
    'if [ -z "$NODE" ]; then printf \'%s\\n\' \'Node.js 20 or newer is required.\' >&2; exit 1; fi',
    'NPM="$(dirname "$NODE")/npm"',
    'if [ ! -x "$NPM" ]; then NPM=$(command -v npm || true); fi',
    'if [ -z "$NPM" ]; then printf \'%s\\n\' \'npm is required to update Vibe Desktop.\' >&2; exit 1; fi',
    'export VIBE_DATA_FILE="$DATA_DIR/vibedesktop.json"',
    'export VIBE_DAEMON_DATA_DIR="$DAEMON_DATA_DIR"',
    'export VIBE_APP_PORT="$APP_PORT"',
    'export VIBE_APP_ORIGIN="http://127.0.0.1:$APP_PORT"',
    'export VIBE_DESKTOP_URL="$VIBE_APP_ORIGIN/start"',
    'if [ "$#" -eq 0 ]; then COMMAND=status; else COMMAND=$1; shift; fi',
    'case "$COMMAND" in',
    '  start|stop|restart) exec systemctl --user "$COMMAND" "$UNIT" ;;',
    '  status) exec systemctl --user status "$UNIT" --no-pager ;;',
    '  open) exec "$NODE" "$APP/scripts/launch-desktop-chromium.mjs" ;;',
    '  logs) exec journalctl --user -u "$UNIT" -f ;;',
    '  update) exec "$NODE" "$APP/daemon/cloud/app-lifecycle.mjs" update --app-root "$APP_ROOT" --repo "$REPO" --npm "$NPM" --unit "$UNIT" "$@" ;;',
    '  rollback) exec "$NODE" "$APP/daemon/cloud/app-lifecycle.mjs" rollback --app-root "$APP_ROOT" --unit "$UNIT" "$@" ;;',
    '  uninstall) exec "$NODE" "$APP/daemon/cloud/app-lifecycle.mjs" uninstall --app-root "$APP_ROOT" --bin __VIBEDESKTOP_BIN__ --unit-path "$UNIT_PATH" --unit "$UNIT" "$@" ;;',
    "  *) printf '%s\\n' 'Usage: vibedesktop [open|status|start|stop|restart|logs|update|rollback|uninstall]' >&2; exit 2 ;;",
    "esac",
    ""
  ];
  const serviceTemplate = [
    "[Unit]",
    "Description=Vibe Desktop web app — local-first single-user desktop",
    "Wants=network-online.target vibedesktop-daemon.service",
    "After=network-online.target vibedesktop-daemon.service",
    "",
    "[Service]",
    "Type=simple",
    "WorkingDirectory=__WORKING_DIRECTORY__",
    "ExecStart=%h/.local/bin/vibedesktop-run",
    "Restart=on-failure",
    "RestartSec=3",
    "TimeoutStopSec=15",
    "Environment=NODE_ENV=production",
    "Environment=__DATA_ENV__",
    "Environment=__DAEMON_DATA_ENV__",
    "Environment=VIBE_APP_PORT=__APP_PORT__",
    "Environment=__PATH_ENV__",
    "UMask=0077",
    "",
    "[Install]",
    "WantedBy=default.target",
    ""
  ];
  const runScriptTemplate = [
    "#!/bin/sh",
    "set -eu",
    "NODE=__NODE__",
    'if [ ! -x "$NODE" ]; then NODE=$(command -v node || true); fi',
    'if [ -z "$NODE" ]; then printf \'%s\\n\' \'Node.js 20 or newer is required.\' >&2; exit 1; fi',
    'APP_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/vibedesktop/app/current"',
    'APP_PORT="${VIBE_APP_PORT:-${PORT:-__APP_PORT__}}"',
    'exec "$NODE" "$APP_ROOT/node_modules/next/dist/bin/next" start --hostname 127.0.0.1 --port "$APP_PORT"'
  ];

  return `#!/bin/sh
# VibeDesktop whole-program installer (Next.js app + vibed daemon).
# Copyright 2026 Vimalinx
# SPDX-License-Identifier: Apache-2.0
set -eu

if [ "$(uname -s)" != "Linux" ]; then
  printf '%s\\n' 'VibeDesktop currently supports Linux only.' >&2
  exit 1
fi

REPO=${shellQuote(APP_INSTALL_REPO)}
TAG=${shellQuote(APP_INSTALL_TAG)}
INSTALL_ONLY=0
APP_PORT=""
VIBED_INSTALLER_URL=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --tag) TAG=$2; shift 2 ;;
    --port) APP_PORT=$2; shift 2 ;;
    --install-only) INSTALL_ONLY=1; shift ;;
    --repo) REPO=$2; shift 2 ;;
    --vibed-installer-url) VIBED_INSTALLER_URL=$2; shift 2 ;;
    *) printf '%s\\n' "Unknown argument: $1" >&2; exit 2 ;;
  esac
done
if [ -z "$VIBED_INSTALLER_URL" ]; then
  VIBED_INSTALLER_URL="https://github.com/vimalinx/vibedesktop/releases/download/$TAG/install.sh"
fi

${buildNodeBootstrapShell()}

NPM="$(dirname "$NODE")/npm"
if [ ! -x "$NPM" ]; then NPM=$(command -v npm || true); fi
if [ -z "$NPM" ]; then
  printf '%s\\n' 'npm is required to install VibeDesktop.' >&2
  exit 1
fi

NODE_MAJOR=$("$NODE" -p "Number(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 20 ]; then
  printf '%s\\n' 'VibeDesktop requires Node.js 20 or newer.' >&2
  exit 1
fi

if [ -z "$APP_PORT" ]; then
  APP_PORT=$("$NODE" --input-type=module - 3000 3001 3002 3003 3004 3005 3006 3007 3008 3009 3010 <<'VIBEDESKTOP_PORT_PROBE'
import net from "node:net";

const candidates = process.argv.slice(2).map(Number);
for (const port of candidates) {
  if (await isAvailable(port)) {
    process.stdout.write(String(port));
    process.exit(0);
  }
}
process.exit(1);

function isAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}
VIBEDESKTOP_PORT_PROBE
  ) || {
    printf '%s\\n' 'No free Vibe Desktop port was found from 3000 through 3010. Re-run with --port PORT.' >&2
    exit 1
  }
fi
case "$APP_PORT" in
  ''|*[!0-9]*) printf '%s\\n' "Invalid --port value: $APP_PORT" >&2; exit 2 ;;
esac
if [ "$APP_PORT" -lt 1 ] || [ "$APP_PORT" -gt 65535 ]; then
  printf '%s\\n' "Invalid --port value: $APP_PORT (expected 1-65535)" >&2
  exit 2
fi

if ! command -v git >/dev/null 2>&1; then
  printf '%s\\n' 'git is required to install VibeDesktop (git clone + git pull update model).' >&2
  printf '%s\\n' 'Install git and re-run.' >&2
  exit 1
fi

# Resolve a content-addressed version id from the tag + commit sha.
COMMIT_SHA=$(git ls-remote "$REPO" "refs/tags/$TAG" 2>/dev/null | awk '{print $1}' | head -c 12)
if [ -z "$COMMIT_SHA" ]; then
  # Tag may be a branch ref; fall back to HEAD of the tag name as a branch.
  COMMIT_SHA=$(git ls-remote "$REPO" "$TAG" 2>/dev/null | awk '{print $1}' | head -c 12)
fi
if [ -z "$COMMIT_SHA" ]; then
  printf '%s\\n' "Could not resolve commit for $TAG from $REPO." >&2
  exit 1
fi
VERSION_ID="$TAG+$COMMIT_SHA"

export VIBEDESKTOP_INSTALL_REPO="$REPO"
export VIBEDESKTOP_INSTALL_TAG="$TAG"
export VIBEDESKTOP_INSTALL_VERSION_ID="$VERSION_ID"
export VIBEDESKTOP_INSTALL_NODE="$NODE"
export VIBEDESKTOP_INSTALL_NPM="$NPM"
export VIBEDESKTOP_INSTALL_PORT="$APP_PORT"

"$NODE" --input-type=module <<'VIBEDESKTOP_APP_INSTALLER'
import { chmod, mkdir, readFile, rename, rm, stat, writeFile, symlink } from "node:fs/promises";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";

const REPO = process.env.VIBEDESKTOP_INSTALL_REPO;
const TAG = process.env.VIBEDESKTOP_INSTALL_TAG;
const VERSION_ID = process.env.VIBEDESKTOP_INSTALL_VERSION_ID;
const NODE_BIN = process.env.VIBEDESKTOP_INSTALL_NODE;
const NPM_BIN = process.env.VIBEDESKTOP_INSTALL_NPM;
const APP_PORT = Number(process.env.VIBEDESKTOP_INSTALL_PORT);
if (!Number.isInteger(APP_PORT) || APP_PORT < 1 || APP_PORT > 65535) {
  throw new Error("VIBEDESKTOP_INSTALL_PORT must be an integer from 1 through 65535.");
}
const home = homedir();
const dataHome = absoluteXdg(process.env.XDG_DATA_HOME, path.join(home, ".local", "share"));
const configHome = absoluteXdg(process.env.XDG_CONFIG_HOME, path.join(home, ".config"));
const appRoot = path.join(dataHome, "vibedesktop", "app");
const versionsDir = path.join(appRoot, "versions");
const stateDir = path.join(dataHome, "vibedesktop-data");
const daemonStateDir = path.join(dataHome, "vibed-vibedesktop");
const binDir = path.join(home, ".local", "bin");
const vibedesktopBin = path.join(binDir, "vibedesktop");
const vibedesktopRun = path.join(binDir, "vibedesktop-run");
const unitDir = path.join(configHome, "systemd", "user");
const unitPath = path.join(unitDir, "vibedesktop-app.service");

const finalVersionDir = path.join(versionsDir, VERSION_ID);
if (!(await pathExists(finalVersionDir))) {
  await ensureDirectory(versionsDir, 0o700);
  const stagingDir = path.join(versionsDir, ".staging-" + process.pid + "-" + VERSION_ID);
  try {
    await ensureDirectory(stagingDir, 0o700);
    await run("git", ["clone", "--depth", "1", "--branch", TAG, REPO, stagingDir]);
    await run(NPM_BIN, ["ci"], { cwd: stagingDir });
    await run(NPM_BIN, ["run", "build"], { cwd: stagingDir });
    await rm(path.join(stagingDir, ".git"), { recursive: true, force: true });
    await writeFile(
      path.join(stagingDir, ".installed-version.json"),
      JSON.stringify({ version: VERSION_ID, tag: TAG, repo: REPO, port: APP_PORT, installedAt: new Date().toISOString() }, null, 2) + "\\n",
      { mode: 0o600 }
    );
    await rename(stagingDir, finalVersionDir);
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

await switchCurrent(appRoot, VERSION_ID);

await ensureDirectory(stateDir, 0o700);
await ensureDirectory(binDir, 0o755, false);

const wrapper = ${JSON.stringify(wrapperTemplate, null, 2)}.map((line) => line
  .replaceAll("__NODE__", () => shellQuote(NODE_BIN))
  .replaceAll("__APP_ROOT__", () => shellQuote(appRoot))
  .replaceAll("__DATA_DIR__", () => shellQuote(stateDir))
  .replaceAll("__DAEMON_DATA_DIR__", () => shellQuote(daemonStateDir))
  .replaceAll("__APP_PORT__", () => shellQuote(String(APP_PORT)))
  .replaceAll("__REPO__", () => shellQuote(REPO))
  .replaceAll("__UNIT_PATH__", () => shellQuote(unitPath))
  .replaceAll("__VIBEDESKTOP_BIN__", () => shellQuote(vibedesktopBin)))
  .join("\\n");
await writeAtomic(vibedesktopBin, Buffer.from(wrapper), 0o700);

const runScript = ${JSON.stringify(runScriptTemplate, null, 2)}.map((line) => line
  .replaceAll("__NODE__", () => shellQuote(NODE_BIN))
  .replaceAll("__APP_PORT__", () => shellQuote(String(APP_PORT))))
  .join("\\n");
await writeAtomic(vibedesktopRun, Buffer.from(runScript), 0o700);

await ensureDirectory(unitDir, 0o700, false);
const service = ${JSON.stringify(serviceTemplate, null, 2)}.map((line) => line
  .replaceAll("__APP_PORT__", () => String(APP_PORT))
  .replaceAll("__WORKING_DIRECTORY__", () => systemdPath(path.join(appRoot, "current")))
  .replaceAll("__DATA_ENV__", () => systemdQuote("VIBE_DATA_FILE=" + path.join(stateDir, "vibedesktop.json")))
  .replaceAll("__DAEMON_DATA_ENV__", () => systemdQuote("VIBE_DAEMON_DATA_DIR=" + daemonStateDir))
  .replaceAll("__PATH_ENV__", () => systemdQuote("PATH=" + (process.env.PATH || "/usr/local/bin:/usr/bin:/bin"))))
  .join("\\n");
await writeAtomic(unitPath, Buffer.from(service), 0o600);

console.log("Installed Vibe Desktop app " + VERSION_ID + " at " + finalVersionDir + ".");

async function switchCurrent(appRoot, versionId) {
  const currentLink = path.join(appRoot, "current");
  const lkgPath = path.join(appRoot, "lkg.json");
  let previous = null;
  try {
    const lkg = JSON.parse(await readFile(lkgPath, "utf8"));
    if (lkg && typeof lkg.current === "string") previous = lkg.current;
  } catch {}
  const stagingLink = currentLink + ".swap." + process.pid;
  await rm(stagingLink, { force: true });
  await symlink(path.join("versions", versionId), stagingLink);
  await rename(stagingLink, currentLink);
  await writeAtomic(
    lkgPath,
    Buffer.from(JSON.stringify({ current: versionId, previous, updatedAt: new Date().toISOString() }, null, 2) + "\\n"),
    0o600
  );
}

function run(cmd, args, options = {}) {
  const { promise, resolve, reject } = Promise.withResolvers();
  const child = spawn(cmd, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
  const stderr = [];
  child.stderr?.on("data", (c) => stderr.push(c));
  child.once("error", reject);
  child.once("exit", (code) => {
    if (code === 0) resolve();
    else reject(new Error(cmd + " " + args.join(" ") + " exited " + code + "\\n" + Buffer.concat(stderr).toString()));
  });
  return promise;
}

function absoluteXdg(value, fallback) {
  return typeof value === "string" && path.isAbsolute(value) ? value : fallback;
}

async function pathExists(target) {
  try { await stat(target); return true; } catch { return false; }
}

async function ensureDirectory(directory, mode, repair = true) {
  await mkdir(directory, { recursive: true, mode });
  if (repair) await chmod(directory, mode);
}

async function writeAtomic(target, contents, mode) {
  const temporary = target + "." + process.pid + "." + process.ppid + ".tmp";
  await writeFile(temporary, contents, { mode });
  await chmod(temporary, mode);
  await rename(temporary, target);
  await chmod(target, mode);
}

function shellQuote(value) {
  const apostrophe = String.fromCharCode(39);
  const doubleQuote = String.fromCharCode(34);
  return apostrophe + value.split(apostrophe).join(apostrophe + doubleQuote + apostrophe + doubleQuote + apostrophe) + apostrophe;
}

function systemdQuote(value) {
  const slash = String.fromCharCode(92);
  const quote = String.fromCharCode(34);
  const escaped = value.split(slash).join(slash + slash).split(quote).join(slash + quote)
    .split("%").join("%%").split(String.fromCharCode(10)).join(" ").split(String.fromCharCode(13)).join(" ");
  return quote + escaped + quote;
}

function systemdPath(value) {
  if (!path.isAbsolute(value)) throw new Error("systemd working directory must be absolute");
  const slash = String.fromCharCode(92);
  return Array.from(value).map((character) => {
    if (character === "%") return "%%";
    const code = character.charCodeAt(0);
    if (code <= 32 || character === slash || character === String.fromCharCode(34) || character === String.fromCharCode(39)) {
      return slash + "x" + code.toString(16).padStart(2, "0");
    }
    return character;
  }).join("");
}
VIBEDESKTOP_APP_INSTALLER

VIBEDESKTOP_BIN="$HOME/.local/bin/vibedesktop"
VIBED_BIN="$HOME/.local/bin/vibed"
# Always install the matching vibed runtime. This upgrades an existing daemon
# together with the app instead of leaving an older, protocol-incompatible
# runtime in place. --install-only keeps service startup owned below.
printf '%s\\n' 'Installing the matching vibed daemon (local WebApp manager)...'
if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$VIBED_INSTALLER_URL" | sh -s -- --install-only
elif command -v wget >/dev/null 2>&1; then
  wget -qO- "$VIBED_INSTALLER_URL" | sh -s -- --install-only
else
  printf '%s\\n' 'curl or wget is required to install the matching vibed runtime.' >&2
  exit 1
fi

if [ "$INSTALL_ONLY" -eq 1 ]; then
  printf '%s\\n' 'Vibe Desktop and vibed files installed. Service startup was skipped.'
  exit 0
fi

if ! command -v systemctl >/dev/null 2>&1 || ! systemctl --user show-environment >/dev/null 2>&1; then
  printf '%s\\n' 'Files were installed, but a systemd user session is required to keep Vibe Desktop running.' >&2
  printf '%s\\n' 'Log into a Linux desktop session, then run: vibed start && vibedesktop start' >&2
  exit 1
fi

systemctl --user stop vibedesktop-app.service >/dev/null 2>&1 || true
systemctl --user daemon-reload
systemctl --user enable vibedesktop-daemon.service >/dev/null
systemctl --user restart vibedesktop-daemon.service
systemctl --user enable vibedesktop-app.service >/dev/null
systemctl --user restart vibedesktop-app.service
ATTEMPT=0
while [ "$ATTEMPT" -lt 40 ]; do
  if "$VIBED_BIN" health >/dev/null 2>&1 && curl -fsS "http://127.0.0.1:$APP_PORT/api/desktop" >/dev/null 2>&1; then
    printf '%s\\n' "Vibe Desktop is installed and running at http://127.0.0.1:$APP_PORT"
    exit 0
  fi
  ATTEMPT=$((ATTEMPT + 1))
  sleep 0.5
done

APP_ROOT_CHECK="\${XDG_DATA_HOME:-$HOME/.local/share}/vibedesktop/app"
if [ -f "$APP_ROOT_CHECK/lkg.json" ]; then
  printf '%s\\n' 'The new version did not become healthy. Rolling back to the last known good version...' >&2
  if "$VIBEDESKTOP_BIN" rollback; then
    printf '%s\\n' 'Rolled back to the previous Vibe Desktop version, which is now running.' >&2
  else
    printf '%s\\n' 'Rollback attempt failed. Run: vibedesktop status' >&2
  fi
  exit 1
fi
printf '%s\\n' 'Vibe Desktop was installed but did not become healthy. Run: vibedesktop status' >&2
exit 1
`;
}

/**
 * Pure-`/bin/sh` fallback that downloads and verifies a pinned Node build
 * when no usable system Node is on PATH. Identical to the vibed installer's
 * bootstrap so both installers agree on a runtime.
 */
function buildNodeBootstrapShell(): string {
  return `NODE=""
if command -v node >/dev/null 2>&1; then
  CANDIDATE_MAJOR=$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)
  if [ "$CANDIDATE_MAJOR" -ge 20 ] 2>/dev/null; then
    NODE=$(command -v node)
  fi
fi

if [ -z "$NODE" ]; then
  DATA_HOME=$HOME/.local/share
  case "\${XDG_DATA_HOME:-}" in /*) DATA_HOME=$XDG_DATA_HOME ;; esac
  BOOTSTRAP_NODE_DIR="$DATA_HOME/vibedesktop/runtime/node-bootstrap"
  ARCH=$(uname -m)
  case "$ARCH" in
    x86_64) NODE_ARCH=x64; NODE_SHA256=${BUNDLED_NODE_CHECKSUMS.x64} ;;
    aarch64|arm64) NODE_ARCH=arm64; NODE_SHA256=${BUNDLED_NODE_CHECKSUMS.arm64} ;;
    *) printf '%s\\n' "VibeDesktop has no bundled Node build for architecture $ARCH; install Node.js 20 or newer manually." >&2; exit 1 ;;
  esac
  NODE_TARBALL_NAME="node-${BUNDLED_NODE_VERSION}-linux-$NODE_ARCH.tar.gz"
  NODE_URL="https://nodejs.org/dist/${BUNDLED_NODE_VERSION}/$NODE_TARBALL_NAME"
  if command -v curl >/dev/null 2>&1; then
    DOWNLOAD_CMD="curl -fsSL"
  elif command -v wget >/dev/null 2>&1; then
    DOWNLOAD_CMD="wget -qO-"
  else
    printf '%s\\n' 'No usable system Node.js 20+ was found, and curl/wget are unavailable to download a bundled one.' >&2
    printf '%s\\n' 'Install Node.js 20 or newer (or curl/wget) and re-run.' >&2
    exit 1
  fi
  printf '%s\\n' "No usable system Node.js 20+ was found; downloading a pinned Node $NODE_ARCH runtime..." >&2
  DOWNLOAD_DIR="$BOOTSTRAP_NODE_DIR.download"
  rm -rf "$DOWNLOAD_DIR"
  mkdir -p "$DOWNLOAD_DIR"
  TARBALL_PATH="$DOWNLOAD_DIR/$NODE_TARBALL_NAME"
  $DOWNLOAD_CMD "$NODE_URL" > "$TARBALL_PATH"
  ACTUAL_SHA256=""
  if command -v sha256sum >/dev/null 2>&1; then
    ACTUAL_SHA256=$(sha256sum "$TARBALL_PATH" | cut -d ' ' -f1)
  elif command -v shasum >/dev/null 2>&1; then
    ACTUAL_SHA256=$(shasum -a 256 "$TARBALL_PATH" | cut -d ' ' -f1)
  else
    printf '%s\\n' 'No sha256sum or shasum is available to verify the downloaded Node runtime.' >&2
    rm -rf "$DOWNLOAD_DIR"
    exit 1
  fi
  if [ "$ACTUAL_SHA256" != "$NODE_SHA256" ]; then
    printf '%s\\n' "Downloaded Node runtime checksum mismatch (expected $NODE_SHA256, got $ACTUAL_SHA256). Aborting." >&2
    rm -rf "$DOWNLOAD_DIR"
    exit 1
  fi
  rm -rf "$BOOTSTRAP_NODE_DIR"
  mkdir -p "$BOOTSTRAP_NODE_DIR"
  tar -xzf "$TARBALL_PATH" -C "$BOOTSTRAP_NODE_DIR" --strip-components=1
  rm -rf "$DOWNLOAD_DIR"
  NODE="$BOOTSTRAP_NODE_DIR/bin/node"
  if [ ! -x "$NODE" ]; then
    printf '%s\\n' 'Bundled Node extraction did not produce a usable binary.' >&2
    exit 1
  fi
  printf '%s\\n' "Using bundled Node $NODE_ARCH runtime at $NODE." >&2
fi`;
}

/** Shell single-quote. Exported because the generated CLI wrapper's service
 *  unit and command lines are template-substituted through this. */
function shellQuote(value: string): string {
  const apostrophe = String.fromCharCode(39);
  const doubleQuote = String.fromCharCode(34);
  return apostrophe + value.split(apostrophe).join(apostrophe + doubleQuote + apostrophe + doubleQuote + apostrophe) + apostrophe;
}
