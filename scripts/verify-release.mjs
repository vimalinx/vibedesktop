#!/usr/bin/env node
// @ts-check
/**
 * End-to-end release qualification in disposable directories.
 *
 * This deliberately exercises the complete public product source rather than
 * maintainer-local evidence: stage -> install dependencies -> gates -> signed artifacts ->
 * local version tag -> isolated vibed install/run -> isolated whole-app
 * clone/build/run. No user service or real HOME is modified.
 */
import { createHash, createPublicKey, verify } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readlink, rm, stat, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scratchRoot = await mkdtemp(path.join(tmpdir(), "vibedesktop-release-verify-"));
const publicRoot = path.join(scratchRoot, "public");
const isolatedHome = path.join(scratchRoot, "home");
const signingKey = path.join(scratchRoot, "release-signing-key.json");
const keep = process.env.VIBE_KEEP_RELEASE_VERIFY === "1";

try {
  if (await exists(path.join(projectRoot, "scripts", "publish-public.mjs"))) {
    await run("stage public source", process.execPath, ["scripts/publish-public.mjs", "--output", publicRoot], projectRoot);
  } else {
    await run("clone public source", "git", ["clone", "--no-hardlinks", "--local", projectRoot, publicRoot], projectRoot);
  }
  await assertRequiredPublicFiles(publicRoot);
  const packageJson = JSON.parse(await readFile(path.join(publicRoot, "package.json"), "utf8"));
  await assertLicenseContract(publicRoot, packageJson);
  const tag = `v${packageJson.version}`;
  await assertVersionContract(publicRoot, packageJson.version);

  await run("install public dependencies", "npm", ["ci"], publicRoot);
  await run(
    "audit all dependencies",
    "npm",
    ["audit", "--audit-level=high", "--registry=https://registry.npmjs.org"],
    publicRoot,
  );
  await run("lint public source", "npm", ["run", "lint"], publicRoot);
  await run("typecheck public source", "npm", ["run", "typecheck"], publicRoot);
  await run("test public source", "npm", ["test"], publicRoot);
  await run(
    "test add-app Agent Skill",
    "python3",
    ["-m", "unittest", "discover", "-s", ".claude/skills/add_app", "-p", "test_*.py", "-v"],
    publicRoot,
  );
  await run(
    "qualify all reviewed official installer recipes",
    "sh",
    ["catalog/installers/qualify-recipes.sh", path.join(scratchRoot, "recipe-qualification")],
    publicRoot,
  );
  await run("build public source", "npm", ["run", "build"], publicRoot);
  await run("build public catalog", "npm", ["run", "catalog:build"], publicRoot);
  await run("generate disposable signing key", process.execPath, ["scripts/generate-release-signing-key.mjs", signingKey], publicRoot);
  await run("generate signed release assets", "npm", ["run", "dist:generate"], publicRoot, {
    VIBE_RELEASE_SIGNING_KEY_FILE: signingKey,
    VIBE_REQUIRE_SIGNED_RELEASE: "1",
  });
  await validateReleaseAssets(publicRoot, packageJson.version);

  await run("tag disposable public source", "git", ["tag", "-f", tag], publicRoot);
  // Real home directories often hold a stray package-lock.json; the install must not adopt it as the build root.
  await mkdir(isolatedHome, { recursive: true, mode: 0o700 });
  await writeFile(path.join(isolatedHome, "package-lock.json"), "{}\n");
  await run(
    "one-click install whole app, signed vibed, and Agent Skills",
    "sh",
    [
      path.join(publicRoot, "dist", "install-app.sh"),
      "--repo", `file://${publicRoot}`,
      "--tag", tag,
      "--port", String(await freePort()),
      "--vibed-installer-url", `file://${path.join(publicRoot, "dist", "install.sh")}`,
      "--install-only",
    ],
    publicRoot,
    isolatedEnv(),
  );
  await verifyVibedInstall(publicRoot);
  await verifyAppInstall(publicRoot, tag);

  process.stdout.write(`\nRelease qualification passed for ${tag}.\n`);
  process.stdout.write("Verified: complete public product source, local-only boundary, gates, signed assets, checksums, three Agent Skill roots, vibed health, app clone/build, app HTTP health, and authenticated app-to-vibed integration.\n");
} finally {
  if (keep) {
    process.stdout.write(`Kept verification tree: ${scratchRoot}\n`);
  } else if (scratchRoot.startsWith(path.join(tmpdir(), "vibedesktop-release-verify-"))) {
    await rm(scratchRoot, { recursive: true, force: true });
  }
}

function isolatedEnv(extra = {}) {
  return {
    ...process.env,
    HOME: isolatedHome,
    XDG_DATA_HOME: path.join(isolatedHome, "xdg", "data"),
    XDG_CONFIG_HOME: path.join(isolatedHome, "xdg", "config"),
    XDG_STATE_HOME: path.join(isolatedHome, "xdg", "state"),
    XDG_RUNTIME_DIR: path.join(isolatedHome, "xdg", "runtime"),
    XDG_BIN_HOME: path.join(isolatedHome, "xdg", "bin"),
    PATH: `${path.join(isolatedHome, "xdg", "bin")}:${path.dirname(process.execPath)}:/usr/local/bin:/usr/bin:/bin`,
    ...extra,
  };
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function assertRequiredPublicFiles(root) {
  const required = [
    ".claude/skills/add_app/manager.py",
    ".claude/skills/add_app/agents/openai.yaml",
    ".github/workflows/ci.yml",
    ".github/workflows/release.yml",
    "browser-extension/vibe-embed-companion/manifest.json",
    "CHANGELOG.md",
    "CODE_OF_CONDUCT.md",
    "catalog/installers/install-official.sh",
    "catalog/installers/official-installer.mjs",
    "catalog/installers/recipes.json",
    "daemon/release/app-lifecycle.mjs",
    "docs/releasing.md",
    "OPEN_SOURCE.md",
    "SUPPORT.md",
    "THIRD_PARTY_NOTICES.md",
    "scripts/check-product-boundary.mjs",
    "scripts/launch-desktop-chromium.mjs",
    "scripts/assemble-release.mjs",
    "scripts/verify-release.mjs",
    "README.zh-CN.md",
    "src/app/api/setup/app/route.ts",
    "src/app/api/catalog-installs/[id]/agent-complete/route.ts",
    "src/lib/app-installer.ts",
  ];
  for (const relative of required) await stat(path.join(root, relative));
}

async function assertLicenseContract(root, packageJson) {
  if (packageJson.license !== "Apache-2.0") {
    throw new Error(`package.json license must be Apache-2.0, got ${packageJson.license || "missing"}`);
  }

  const lockfile = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
  if (lockfile.packages?.[""]?.license !== "Apache-2.0") {
    throw new Error("package-lock.json root license must be Apache-2.0");
  }

  const license = await readFile(path.join(root, "LICENSE"), "utf8");
  if (!license.startsWith("Apache License\nVersion 2.0, January 2004")) {
    throw new Error("LICENSE is not the canonical Apache License 2.0 text");
  }
}

async function assertVersionContract(root, version) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`Invalid package version: ${version}`);
  const daemonVersion = await readFile(path.join(root, "daemon", "version.mjs"), "utf8");
  const extension = JSON.parse(await readFile(path.join(root, "browser-extension", "vibe-embed-companion", "manifest.json"), "utf8"));
  if (!daemonVersion.includes(`DAEMON_RELEASE_VERSION = "${version}"`)) {
    throw new Error(`daemon/version.mjs does not match package version ${version}`);
  }
  if (extension.version !== version) throw new Error(`Browser companion version ${extension.version} does not match ${version}`);
}

async function validateReleaseAssets(root, version) {
  const dist = path.join(root, "dist");
  for (const name of ["install.sh", "install-app.sh", "manifest.json", "release-public-key.json", "SHA256SUMS", "catalog.json"]) {
    await stat(path.join(dist, name));
  }
  await run("validate installer shell syntax", "sh", ["-n", path.join(dist, "install.sh")], root);
  await run("validate whole-app installer shell syntax", "sh", ["-n", path.join(dist, "install-app.sh")], root);
  await run("verify release asset checksums", "sha256sum", ["-c", "SHA256SUMS"], dist);

  const manifest = JSON.parse(await readFile(path.join(dist, "manifest.json"), "utf8"));
  const publicKey = JSON.parse(await readFile(path.join(dist, "release-public-key.json"), "utf8"));
  if (manifest.releaseVersion !== version || !manifest.signature || manifest.keyId !== publicKey.keyId) {
    throw new Error("Signed manifest metadata does not match the release version/public key asset.");
  }
  const digestOnly = (files) => files.map(({ path: filePath, sha256, size }) => ({ path: filePath, sha256, size }));
  const canonical = Buffer.from(JSON.stringify({
    version: manifest.version,
    releaseVersion: manifest.releaseVersion,
    generatedAt: manifest.generatedAt,
    runtime: digestOnly(manifest.runtime),
    skill: digestOnly(manifest.skill),
  }));
  const der = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(publicKey.publicKeyBase64, "base64")]);
  const key = createPublicKey({ key: der, format: "der", type: "spki" });
  if (!verify(null, canonical, key, Buffer.from(manifest.signature, "base64"))) {
    throw new Error("Release manifest signature verification failed.");
  }
  for (const file of [...manifest.runtime, ...manifest.skill]) {
    const contents = Buffer.from(file.contents, "base64");
    const digest = createHash("sha256").update(contents).digest("hex");
    if (contents.length !== file.size || digest !== file.sha256) throw new Error(`Manifest payload mismatch: ${file.path}`);
  }
}

async function verifyVibedInstall(sourceRoot) {
  const env = isolatedEnv();
  const dataHome = env.XDG_DATA_HOME;
  const runtimeRoot = path.join(dataHome, "vibedesktop", "runtime");
  const currentTarget = await readlink(path.join(runtimeRoot, "current"));
  if (!currentTarget.startsWith("releases/")) throw new Error("vibed current symlink is not release-versioned.");
  const sourceSkill = path.join(sourceRoot, ".claude", "skills", "add_app");
  for (const [agentRoot, skillName] of [[".claude", "add_app"], [".codex", "add-app"], [".agents", "add-app"]]) {
    for (const relative of ["SKILL.md", "add.py", "scan.py", "manager.py", "references/managed-bundles.md", "agents/openai.yaml"]) {
      const expected = await readFile(path.join(sourceSkill, relative));
      const installed = await readFile(path.join(isolatedHome, agentRoot, "skills", skillName, relative));
      if (!expected.equals(installed)) throw new Error(`${agentRoot} Skill mismatch: ${relative}`);
    }
  }
  const cli = path.join(env.XDG_BIN_HOME, "vibed");
  const cliText = await readFile(cli, "utf8");
  if (!cliText.includes("VIBE_RELEASE_PUBLIC_KEY") || /RELEASE_PUBLIC_KEY=''/.test(cliText)) {
    throw new Error("Installed vibed CLI is missing its release verification public key.");
  }
  const child = execStreaming(cli, ["run"], sourceRoot, env);
  try {
    const stateDir = path.join(env.XDG_RUNTIME_DIR, "vibed");
    await poll(async () => {
      const port = (await readFile(path.join(stateDir, "daemon.port"), "utf8")).trim();
      const token = (await readFile(path.join(stateDir, "daemon.token"), "utf8")).trim();
      const response = await fetch(`http://127.0.0.1:${port}/health`, { headers: { authorization: `Bearer ${token}` } });
      return response.ok;
    }, "installed vibed health");
  } finally {
    child.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(3000)]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}

async function verifyAppInstall(sourceRoot, tag) {
  const env = isolatedEnv();
  const appRoot = path.join(env.XDG_DATA_HOME, "vibedesktop", "app");
  const current = path.join(appRoot, "current");
  const daemonConfigDir = path.join(env.XDG_CONFIG_HOME, "vibed");
  const daemonStateDir = path.join(env.XDG_STATE_HOME, "vibed");
  const daemonRuntimeDir = path.join(env.XDG_RUNTIME_DIR, "vibed");
  const desktopStateDir = path.join(env.XDG_STATE_HOME, "vibedesktop");
  const version = JSON.parse(await readFile(path.join(current, ".installed-version.json"), "utf8"));
  if (version.tag !== tag || version.repo !== `file://${sourceRoot}`) throw new Error("Installed app provenance is incorrect.");
  if (!Number.isInteger(version.port) || version.port < 1 || version.port > 65535) throw new Error("Installed app port provenance is incorrect.");
  await stat(path.join(current, "scripts", "launch-desktop-chromium.mjs"));
  await stat(path.join(current, "browser-extension", "vibe-embed-companion", "manifest.json"));
  // The installed release must be the slim standalone server, not a full checkout.
  await stat(path.join(current, "server.js"));
  if (await stat(path.join(current, ".git")).then(() => true, () => false)) throw new Error("Installed app release still contains git metadata.");
  const currentTarget = await readlink(current);
  if (!currentTarget.startsWith("releases/")) throw new Error("app current symlink is not release-versioned.");
  const cli = path.join(env.XDG_BIN_HOME, "vibedesktop");
  await run("validate installed app CLI", "sh", ["-n", cli], sourceRoot, env);
  const unitPath = path.join(env.XDG_CONFIG_HOME, "systemd", "user", "vibedesktop-app.service");
  const unit = await readFile(unitPath, "utf8");
  for (const expected of [
    `VIBE_DATA_FILE=${path.join(desktopStateDir, "vibedesktop.json")}`,
    `VIBE_LOCAL_CATALOG_FILE=${path.join(desktopStateDir, "local-catalog.json")}`,
    `VIBE_DAEMON_CONFIG_DIR=${daemonConfigDir}`,
    `VIBE_DAEMON_STATE_DIR=${daemonStateDir}`,
    `VIBE_DAEMON_RUNTIME_DIR=${daemonRuntimeDir}`,
    `ExecStart=${path.join(env.XDG_BIN_HOME, "vibedesktop-run")}`,
  ]) {
    if (!unit.includes(expected)) throw new Error(`Installed app unit is missing XDG contract: ${expected}`);
  }
  if (unit.includes("vibedesktop-data/vibed-vibedesktop")) {
    throw new Error("Installed app unit retains the legacy, disconnected vibed state directory.");
  }
  if (process.platform === "linux") {
    await run("verify installed app systemd unit", "systemd-analyze", ["--user", "verify", unitPath], sourceRoot, env);
  }

  const daemon = execStreaming(path.join(env.XDG_BIN_HOME, "vibed"), ["run"], sourceRoot, env);
  const port = await freePort();
  const child = execStreaming(path.join(env.XDG_BIN_HOME, "vibedesktop-run"), [], current, isolatedEnv({
    VIBE_APP_PORT: String(port),
    VIBE_DAEMON_RUNTIME_DIR: daemonRuntimeDir,
  }));
  try {
    await poll(async () => {
      const daemonPort = (await readFile(path.join(daemonRuntimeDir, "daemon.port"), "utf8")).trim();
      const daemonToken = (await readFile(path.join(daemonRuntimeDir, "daemon.token"), "utf8")).trim();
      const response = await fetch(`http://127.0.0.1:${daemonPort}/health`, {
        headers: { authorization: `Bearer ${daemonToken}` },
      });
      return response.ok;
    }, "installed vibed health for app integration");
    await poll(async () => (await fetch(`http://127.0.0.1:${port}/api/desktop`)).ok, "installed app HTTP health", 80);
    await poll(async () => {
      const response = await fetch(`http://127.0.0.1:${port}/api/local-apps/daemon-status`);
      if (!response.ok) return false;
      const health = await response.json();
      return health?.ok === true && typeof health.version === "string";
    }, "installed app to vibed authenticated integration", 80);
  } finally {
    child.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(5000)]);
    if (child.exitCode === null) child.kill("SIGKILL");
    daemon.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => daemon.once("exit", resolve)), delay(3000)]);
    if (daemon.exitCode === null) daemon.kill("SIGKILL");
  }
}

async function run(label, command, args, cwd, extraEnv = {}) {
  process.stdout.write(`\n[release:verify] ${label}\n`);
  try {
    const result = await execFileAsync(command, args, {
      cwd,
      env: { ...process.env, ...extraEnv },
      maxBuffer: 128 * 1024 * 1024,
      timeout: 15 * 60 * 1000,
    });
    const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
    if (output) process.stdout.write(`${output.slice(-8000)}\n`);
    return result;
  } catch (error) {
    const output = `${error?.stdout || ""}${error?.stderr || ""}`.trim();
    if (output) process.stderr.write(`${output.slice(-12000)}\n`);
    throw error;
  }
}

function execStreaming(command, args, cwd, env) {
  return spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
}

async function poll(check, label, attempts = 60) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      if (await check()) return;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`${label} timed out${lastError ? `: ${lastError}` : ""}`);
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  if (!port) throw new Error("Could not allocate a local verification port.");
  return port;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
