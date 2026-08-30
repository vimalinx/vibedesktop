import { Buffer } from "node:buffer";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { listAddAppSkillFileNames } from "@/lib/add-app-skill-installer";
import { buildReleaseManifest, VIBE_RELEASE_VERSION } from "@/lib/vibed-release-manifest";

export interface VibedInstallerFile {
  path: string;
  contents: Buffer;
}

export interface VibedInstallerFiles {
  runtime: VibedInstallerFile[];
  skill: VibedInstallerFile[];
}

/**
 * Pinned official Node.js Linux build used when a target machine has no
 * usable system Node on PATH. Real published SHA-256 digests from
 * https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt — see design.md §6 and
 * `daemon/cloud/bundled-node.mjs` (the importable equivalent used by
 * `vibed update`; kept in sync by `vibed-installer.test.ts`, which asserts
 * both copies match, since a pure-`/bin/sh` bootstrap cannot `import` a
 * Node module before Node exists on the machine).
 */
export const BUNDLED_NODE_VERSION = "v22.23.1";
export const BUNDLED_NODE_CHECKSUMS: Record<"x64" | "arm64", string> = {
  x64: "7a8cb04b4a1df4eaf432125324b81b29a088e73570a23259a8de1c65d07fc129",
  arm64: "543fa39e57d4c07855939459a323f4deb9a79dd1bb45e6e99458b0f2de10db8d"
};

export async function loadVibedInstallerFiles(projectRoot: string): Promise<VibedInstallerFiles> {
  const daemonRoot = path.join(projectRoot, "daemon");
  const skillRoot = path.join(projectRoot, ".claude", "skills", "add_app");

  const daemonFiles = await collectFiles(daemonRoot, (relativePath) => (
    relativePath.endsWith(".mjs") && !relativePath.endsWith(".test.mjs")
  ));
  const skillFiles = await Promise.all(listAddAppSkillFileNames().map(async (name) => ({
    path: name,
    contents: await readFile(path.join(skillRoot, name))
  })));

  return {
    runtime: daemonFiles.map((file) => ({ ...file, path: `daemon/${file.path}` })),
    skill: skillFiles
  };
}

/**
 * Builds the self-contained POSIX installer for `GET /api/setup/vibed`.
 *
 * Runtime and skill files are staged into a versioned, checksum-verified
 * directory (`versions/<versionId>/`) and switched into place atomically via
 * `daemon/cloud/version-store.mjs` — see design.md §§2-3. The generated CLI
 * wrapper gains `update`, `rollback`, `disable`, and `uninstall` (design.md
 * §§4-5). If no system Node 20+ is on PATH, a pure-`/bin/sh` preamble
 * downloads and verifies a pinned Node build before anything else runs
 * (design.md §6).
 */
export function buildVibedInstaller(files: VibedInstallerFiles, releasePublicKeyBase64: string | null = null): string {
  const manifest = buildReleaseManifest(files, VIBE_RELEASE_VERSION);
  assertRequiredFiles(manifest);

  const wrapperTemplate = [
    "#!/bin/sh",
    "set -eu",
    "NODE=__NODE__",
    "RUNTIME_ROOT=__RUNTIME_ROOT__",
    'RUNTIME="$RUNTIME_ROOT/current"',
    "DATA_DIR=__DATA_DIR__",
    "SKILL_ROOT_CLAUDE=__SKILL_ROOT_CLAUDE__",
    "SKILL_ROOT_CODEX=__SKILL_ROOT_CODEX__",
    "SKILL_ROOT_AGENTS=__SKILL_ROOT_AGENTS__",
    "RELEASE_PUBLIC_KEY=__RELEASE_PUBLIC_KEY__",
    "UNIT_PATH=__UNIT_PATH__",
    "UNIT=vibedesktop-daemon.service",
    'if [ ! -x "$NODE" ]; then NODE=$(command -v node || true); fi',
    'if [ -z "$NODE" ]; then printf \'%s\\n\' \'Node.js 20 or newer is required.\' >&2; exit 1; fi',
    'export VIBE_DAEMON_DATA_DIR="$DATA_DIR"',
    'if [ -n "$RELEASE_PUBLIC_KEY" ]; then export VIBE_RELEASE_PUBLIC_KEY="$RELEASE_PUBLIC_KEY"; fi',
    'if [ "$#" -eq 0 ]; then COMMAND=status; else COMMAND=$1; shift; fi',
    'case "$COMMAND" in',
    '  run) exec "$NODE" "$RUNTIME/daemon/server.mjs" "$@" ;;',
    '  health) exec "$NODE" "$RUNTIME/daemon/health.mjs" "$@" ;;',
    '  start|stop|restart) exec systemctl --user "$COMMAND" "$UNIT" ;;',
    '  status) exec systemctl --user status "$UNIT" --no-pager ;;',
    '  logs) exec journalctl --user -u "$UNIT" -f ;;',
    '  update) exec "$NODE" "$RUNTIME/daemon/cloud/lifecycle-update.mjs" --runtime-root "$RUNTIME_ROOT" --unit "$UNIT" --skill-root "$SKILL_ROOT_CLAUDE" --skill-root "$SKILL_ROOT_CODEX" --skill-root "$SKILL_ROOT_AGENTS" "$@" ;;',
    '  rollback) exec "$NODE" "$RUNTIME/daemon/cloud/lifecycle-update.mjs" --runtime-root "$RUNTIME_ROOT" --unit "$UNIT" --rollback "$@" ;;',
    '  disable) exec systemctl --user disable --now "$UNIT" ;;',
    '  uninstall) exec "$NODE" "$RUNTIME/daemon/cloud/lifecycle-uninstall.mjs" --runtime-root "$RUNTIME_ROOT" --bin __VIBED_BIN__ --unit-path "$UNIT_PATH" --skill-root "$SKILL_ROOT_CLAUDE" --skill-root "$SKILL_ROOT_CODEX" --skill-root "$SKILL_ROOT_AGENTS" --unit "$UNIT" "$@" ;;',
    "  *) printf '%s\\n' 'Usage: vibed [health|status|start|stop|restart|logs|update|rollback|disable|uninstall]' >&2; exit 2 ;;",
    "esac",
    ""
  ];
  const serviceTemplate = [
    "[Unit]",
    "Description=VibeDesktop local WebApp manager",
    "Wants=network-online.target",
    "After=network-online.target",
    "",
    "[Service]",
    "Type=simple",
    "ExecStart=%h/.local/bin/vibed run",
    "Restart=on-failure",
    "RestartSec=3",
    "TimeoutStopSec=10",
    "Environment=NODE_ENV=production",
    "Environment=__DATA_ENV__",
    "Environment=__PATH_ENV__",
    "UMask=0077",
    "",
    "[Install]",
    "WantedBy=default.target",
    ""
  ];

  return `#!/bin/sh
# VibeDesktop vibed installer.
# Copyright 2026 Vimalinx
# SPDX-License-Identifier: Apache-2.0
set -eu

if [ "$(uname -s)" != "Linux" ]; then
  printf '%s\n' 'VibeDesktop vibed currently supports Linux only.' >&2
  exit 1
fi

${buildNodeBootstrapShell()}

NODE_MAJOR=$("$NODE" -p "Number(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 20 ]; then
  printf '%s\n' 'VibeDesktop vibed requires Node.js 20 or newer.' >&2
  exit 1
fi

"$NODE" --input-type=module <<'VIBEDESKTOP_VIBED_INSTALLER'
import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const runtimeManifestFiles = ${JSON.stringify(manifest.runtime)};
const skillManifestFiles = ${JSON.stringify(manifest.skill)};
const versionId = ${JSON.stringify(manifest.version)};
const releaseVersion = ${JSON.stringify(manifest.releaseVersion)};
const generatedAt = ${JSON.stringify(manifest.generatedAt)};
const home = homedir();
const dataHome = absoluteXdg(process.env.XDG_DATA_HOME, path.join(home, ".local", "share"));
const configHome = absoluteXdg(process.env.XDG_CONFIG_HOME, path.join(home, ".config"));
const runtimeRoot = path.join(dataHome, "vibedesktop", "runtime");
const versionsDir = path.join(runtimeRoot, "versions");
const stateDir = path.join(dataHome, "vibed-vibedesktop");
const skillRoots = [
  path.join(home, ".claude", "skills", "add_app"),
  path.join(home, ".codex", "skills", "add-app"),
  path.join(home, ".agents", "skills", "add-app"),
];
const binDir = path.join(home, ".local", "bin");
const vibedBin = path.join(binDir, "vibed");
const unitDir = path.join(configHome, "systemd", "user");
const unitPath = path.join(unitDir, "vibedesktop-daemon.service");

const finalVersionDir = path.join(versionsDir, versionId);
if (!(await pathExists(finalVersionDir))) {
  await ensureDirectory(versionsDir, 0o700);
  const stagingDir = path.join(versionsDir, ".staging-" + process.pid + "-" + randomUUID());
  try {
    await ensureDirectory(stagingDir, 0o700);
    for (const file of runtimeManifestFiles) {
      const contents = Buffer.from(file.contents, "base64");
      if (contents.length !== file.size || sha256Hex(contents) !== file.sha256) {
        throw new Error("Digest mismatch while staging " + file.path);
      }
      await writeManagedFile(stagingDir, file.path, contents, 0o600);
    }
    for (const file of runtimeManifestFiles) {
      const onDisk = await readFile(path.join(stagingDir, ...file.path.split("/")));
      if (onDisk.length !== file.size || sha256Hex(onDisk) !== file.sha256) {
        throw new Error("Checksum verification failed for " + file.path);
      }
    }
    await writeAtomic(path.join(stagingDir, "manifest.json"), Buffer.from(JSON.stringify({
      version: versionId,
      releaseVersion,
      generatedAt,
      files: runtimeManifestFiles.map(({ path: filePath, sha256, size }) => ({ path: filePath, sha256, size }))
    }, null, 2) + "\\n"), 0o600);
    const versionStoreUrl = pathToFileURL(path.join(stagingDir, "daemon", "cloud", "version-store.mjs")).href;
    const { finalizeStagedDirectory } = await import(versionStoreUrl);
    await finalizeStagedDirectory(stagingDir, finalVersionDir);
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

const versionStoreUrl = pathToFileURL(path.join(finalVersionDir, "daemon", "cloud", "version-store.mjs")).href;
const { switchCurrent } = await import(versionStoreUrl);
await switchCurrent(runtimeRoot, versionId);

for (const skillRoot of skillRoots) {
  await ensureDirectory(skillRoot, 0o700);
  for (const file of skillManifestFiles) {
    const contents = Buffer.from(file.contents, "base64");
    if (contents.length !== file.size || sha256Hex(contents) !== file.sha256) {
      throw new Error("Digest mismatch while staging skill file " + file.path);
    }
    await writeManagedFile(skillRoot, file.path, contents, 0o600);
    const onDisk = await readFile(path.join(skillRoot, ...file.path.split("/")));
    if (onDisk.length !== file.size || sha256Hex(onDisk) !== file.sha256) {
      throw new Error("Checksum verification failed for skill file " + file.path);
    }
  }
}

await ensureDirectory(binDir, 0o755, false);
const wrapper = ${JSON.stringify(wrapperTemplate, null, 2)}.map((line) => line
  .replaceAll("__NODE__", () => shellQuote(process.execPath))
  .replaceAll("__RUNTIME_ROOT__", () => shellQuote(runtimeRoot))
  .replaceAll("__DATA_DIR__", () => shellQuote(stateDir))
  .replaceAll("__SKILL_ROOT_CLAUDE__", () => shellQuote(skillRoots[0]))
  .replaceAll("__SKILL_ROOT_CODEX__", () => shellQuote(skillRoots[1]))
  .replaceAll("__SKILL_ROOT_AGENTS__", () => shellQuote(skillRoots[2]))
  .replaceAll("__RELEASE_PUBLIC_KEY__", () => shellQuote(${JSON.stringify(releasePublicKeyBase64 ?? "")}))
  .replaceAll("__UNIT_PATH__", () => shellQuote(unitPath))
  .replaceAll("__VIBED_BIN__", () => shellQuote(vibedBin)))
  .join("\\n");
await writeAtomic(vibedBin, Buffer.from(wrapper), 0o700);

await ensureDirectory(unitDir, 0o700, false);
const service = ${JSON.stringify(serviceTemplate, null, 2)}.map((line) => line
  .replaceAll("__DATA_ENV__", () => systemdQuote("VIBE_DAEMON_DATA_DIR=" + stateDir))
  .replaceAll("__PATH_ENV__", () => systemdQuote("PATH=" + (process.env.PATH || "/usr/local/bin:/usr/bin:/bin"))))
  .join("\\n");
await writeAtomic(unitPath, Buffer.from(service), 0o600);

console.log("Installed vibed " + versionId + " runtime, user service, CLI, and add_app skill.");

function absoluteXdg(value, fallback) {
  return typeof value === "string" && path.isAbsolute(value) ? value : fallback;
}

function sha256Hex(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function pathExists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function ensureDirectory(directory, mode, repair = true) {
  await mkdir(directory, { recursive: true, mode });
  if (repair) await chmod(directory, mode);
}

async function writeManagedFile(root, relativePath, contents, mode) {
  if (!safeRelativePath(relativePath)) throw new Error("Installer contains an unsafe path.");
  const target = path.join(root, ...relativePath.split("/"));
  await ensureDirectory(path.dirname(target), 0o700);
  await writeAtomic(target, contents, mode);
}

async function writeAtomic(target, contents, mode) {
  const temporary = target + "." + process.pid + "." + randomUUID() + ".tmp";
  await writeFile(temporary, contents, { mode });
  await chmod(temporary, mode);
  await rename(temporary, target);
  await chmod(target, mode);
}

function safeRelativePath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 240 &&
    !value.startsWith("/") && !value.split("/").includes("..") &&
    /^[A-Za-z0-9._/-]+$/.test(value);
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
VIBEDESKTOP_VIBED_INSTALLER

VIBED_BIN="$HOME/.local/bin/vibed"
if [ "$#" -gt 0 ] && [ "$1" = "--install-only" ]; then
  printf '%s\n' 'VibeDesktop files installed. Service startup was skipped.'
  exit 0
fi

if ! command -v systemctl >/dev/null 2>&1 || ! systemctl --user show-environment >/dev/null 2>&1; then
  printf '%s\n' 'Files were installed, but a systemd user session is required to keep vibed running.' >&2
  printf '%s\n' 'Log into a Linux desktop session, then run: vibed start' >&2
  exit 1
fi

systemctl --user stop vibedesktop-daemon.service >/dev/null 2>&1 || true
systemctl --user daemon-reload
systemctl --user enable vibedesktop-daemon.service >/dev/null
systemctl --user restart vibedesktop-daemon.service
ATTEMPT=0
while [ "$ATTEMPT" -lt 20 ]; do
  if "$VIBED_BIN" health >/dev/null 2>&1; then
    printf '%s\n' 'VibeDesktop vibed is installed and running. Reload the desktop to manage local WebApps.'
    exit 0
  fi
  ATTEMPT=$((ATTEMPT + 1))
  sleep 0.25
done

DATA_HOME=$HOME/.local/share
case "\${XDG_DATA_HOME:-}" in /*) DATA_HOME=$XDG_DATA_HOME ;; esac
RUNTIME_ROOT_CHECK="$DATA_HOME/vibedesktop/runtime"
if [ -f "$RUNTIME_ROOT_CHECK/lkg.json" ]; then
  printf '%s\n' 'The new version did not become healthy. Rolling back to the last known good version...' >&2
  if "$VIBED_BIN" rollback; then
    printf '%s\n' 'Rolled back to the previous vibed version, which is now running.' >&2
  else
    printf '%s\n' 'Rollback attempt failed. Run: vibed status' >&2
  fi
  exit 1
fi
printf '%s\n' 'vibed was installed but did not become healthy. Run: vibed status' >&2
exit 1
`;
}

function assertRequiredFiles(manifest: { runtime: Array<{ path: string }>; skill: Array<{ path: string }> }): void {
  const runtimePaths = new Set(manifest.runtime.map((file) => file.path));
  if (
    !runtimePaths.has("daemon/server.mjs") ||
    !runtimePaths.has("daemon/cli-entry.mjs") ||
    !runtimePaths.has("daemon/cloud/version-store.mjs") ||
    !runtimePaths.has("daemon/cloud/lifecycle-update.mjs") ||
    !runtimePaths.has("daemon/cloud/lifecycle-uninstall.mjs")
  ) {
    throw new Error("The vibed runtime bundle is incomplete.");
  }
  const skillPaths = new Set(manifest.skill.map((file) => file.path));
  for (const required of listAddAppSkillFileNames()) {
    if (!skillPaths.has(required)) throw new Error(`The add_app bundle is missing ${required}.`);
  }
}

/**
 * Pure-`/bin/sh` fallback that downloads and verifies a pinned Node build
 * when no usable system Node is on PATH. Runs before the Node ESM heredoc,
 * because Node itself is what's missing. See design.md §6.
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
    *) printf '%s\\n' "VibeDesktop vibed has no bundled Node build for architecture $ARCH; install Node.js 20 or newer manually." >&2; exit 1 ;;
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

async function collectFiles(
  root: string,
  include: (relativePath: string) => boolean,
  relativeDirectory = ""
): Promise<VibedInstallerFile[]> {
  const directory = path.join(root, relativeDirectory);
  const entries = await readdir(directory, { withFileTypes: true });
  const files: VibedInstallerFile[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = path.posix.join(relativeDirectory.split(path.sep).join("/"), entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(root, include, relativePath));
    } else if (entry.isFile() && include(relativePath)) {
      if (!isSafeRelativePath(relativePath)) throw new Error(`Unsafe installer path: ${relativePath}`);
      files.push({ path: relativePath, contents: await readFile(path.join(root, ...relativePath.split("/"))) });
    }
  }
  return files;
}

function isSafeRelativePath(value: string): boolean {
  return value.length > 0 && value.length <= 240 && !value.startsWith("/") &&
    !value.split("/").includes("..") && /^[A-Za-z0-9._/-]+$/.test(value);
}
