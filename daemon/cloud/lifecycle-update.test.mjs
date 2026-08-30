import { spawn } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkVibedHealth } from "../health.mjs";
import { performRollback, performUpdate } from "./lifecycle-update.mjs";
import { canonicalManifestDigestBytes } from "./manifest-signature.mjs";
import { loadVibedInstallerFiles } from "../../src/lib/vibed-installer.ts";
import { readCurrentVersionId, readLastKnownGoodVersionId, stageVersion, switchCurrent } from "./version-store.mjs";

const cleanupTasks = [];

afterEach(async () => {
  for (const task of cleanupTasks.splice(0)) await task();
});

async function tempDir() {
  const root = await mkdtemp(path.join(tmpdir(), "vibed-lifecycle-"));
  cleanupTasks.push(() => rm(root, { recursive: true, force: true }));
  return root;
}

function sha256Hex(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/** Builds a real, byte-accurate manifest.runtime file list from this project's actual daemon sources. */
async function realRuntimeFiles() {
  const files = await loadVibedInstallerFiles(process.cwd());
  return files.runtime;
}

function digestFiles(files) {
  return files.map((file) => ({
    path: file.path,
    sha256: sha256Hex(file.contents),
    size: file.contents.length,
    contents: file.contents.toString("base64")
  }));
}

function computeVersionIdLocal(releaseVersion, fileDigests) {
  const sorted = [...fileDigests].sort((a, b) => a.path.localeCompare(b.path));
  const combined = sorted.map((f) => `${f.path}:${f.sha256}`).join("\n");
  const contentHash = sha256Hex(Buffer.from(combined, "utf8")).slice(0, 12);
  return `${releaseVersion}+${contentHash}`;
}

function buildManifest(runtimeFiles, releaseVersion) {
  const runtime = digestFiles(runtimeFiles);
  return {
    version: computeVersionIdLocal(releaseVersion, runtime),
    releaseVersion,
    generatedAt: new Date().toISOString(),
    runtime,
    skill: [],
    signature: null,
    keyId: null
  };
}

/** A broken build: real files, but `daemon/server.mjs` exits immediately instead of serving health. */
function buildBrokenManifest(realFiles, releaseVersion) {
  const broken = realFiles.map((file) =>
    file.path === "daemon/server.mjs"
      ? { path: file.path, contents: Buffer.from("process.exitCode = 1;\nprocess.exit(1);\n", "utf8") }
      : file
  );
  return buildManifest(broken, releaseVersion);
}

/** Serves whichever manifest object `state.current` points at; tests mutate `state.current` between requests. */
function startManifestServer(state) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const body = JSON.stringify(state.current);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(body);
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}/manifest` });
    });
  });
}

async function stageManifest(runtimeRoot, manifest) {
  return stageVersion({
    runtimeRoot,
    versionId: manifest.version,
    releaseVersion: manifest.releaseVersion,
    generatedAt: manifest.generatedAt,
    files: manifest.runtime
  });
}

async function isolatedDataDir() {
  const home = await tempDir();
  const dataDir = path.join(home, "vibed-vibedesktop");
  return dataDir;
}

/** Spawns `node current/daemon/server.mjs` against an isolated data dir, tracked so tests can restart/kill it. */
function makeRestarter(runtimeRoot, dataDir) {
  const state = { child: null };
  const restart = async () => {
    if (state.child && state.child.exitCode === null && state.child.signalCode === null) {
      state.child.kill("SIGTERM");
      await new Promise((resolve) => state.child.once("exit", resolve));
    }
    const serverPath = path.join(runtimeRoot, "current", "daemon", "server.mjs");
    state.child = spawn(process.execPath, [serverPath], {
      env: { ...process.env, VIBE_DAEMON_DATA_DIR: dataDir, VIBE_CLOUD_CONTROL_ENABLED: "" },
      stdio: ["ignore", "pipe", "pipe"]
    });
  };
  cleanupTasks.push(async () => {
    if (state.child && state.child.exitCode === null && state.child.signalCode === null) {
      state.child.kill("SIGKILL");
    }
  });
  return { restart, state };
}

describe("performUpdate", () => {
  it("is a no-op when the manifest version matches the installed current version", async () => {
    const runtimeRoot = path.join(await tempDir(), "runtime");
    const dataDir = await isolatedDataDir();
    const realFiles = await realRuntimeFiles();
    const v1 = buildManifest(realFiles, "0.1.0");
    await stageManifest(runtimeRoot, v1);
    await switchCurrent(runtimeRoot, v1.version);

    const { server, url } = await startManifestServer({ current: v1 });
    cleanupTasks.push(() => new Promise((resolve) => server.close(resolve)));
    let restartCalls = 0;
    const restart = async () => { restartCalls += 1; };

    const result = await performUpdate({
      runtimeRoot,
      dataDir,
      manifestUrl: url,
      restart,
      checkHealth: async () => true
    });

    expect(result.status).toBe("up_to_date");
    expect(result.versionId).toBe(v1.version);
    expect(restartCalls).toBe(0);
  });

  it("stages, switches, restarts, and reports healthy on a real second version, and never touches device identity or app config", async () => {
    const runtimeRoot = path.join(await tempDir(), "runtime");
    const dataDir = await isolatedDataDir();
    const realFiles = await realRuntimeFiles();
    const v1 = buildManifest(realFiles, "0.1.0");
    const v2 = buildManifest(realFiles, "0.1.1");
    expect(v2.version).not.toBe(v1.version);

    await stageManifest(runtimeRoot, v1);
    await switchCurrent(runtimeRoot, v1.version);

    // Simulate a real paired install: device identity + configured local apps
    // already exist in the state directory before the update runs.
    await mkdir(dataDir, { recursive: true });
    const identityBefore = JSON.stringify({ deviceId: "test-device-id", publicKey: "AAA" });
    const appConfigBefore = JSON.stringify({ version: 1, apps: [{ id: "app-1", name: "existing app" }] });
    await writeFile(path.join(dataDir, "vibed-identity.json"), identityBefore);
    await writeFile(path.join(dataDir, "daemon-config.json"), appConfigBefore);

    const { server, url } = await startManifestServer({ current: v2 });
    cleanupTasks.push(() => new Promise((resolve) => server.close(resolve)));
    const { restart } = makeRestarter(runtimeRoot, dataDir);

    const result = await performUpdate({
      runtimeRoot,
      dataDir,
      manifestUrl: url,
      restart,
      checkHealth: () => checkVibedHealth({ dataDir })
    });

    expect(result.status).toBe("updated");
    expect(result.versionId).toBe(v2.version);
    expect(result.previousVersionId).toBe(v1.version);
    expect(await readCurrentVersionId(runtimeRoot)).toBe(v2.version);
    expect(await checkVibedHealth({ dataDir })).toBe(true);

    // The update switched runtime code, but device identity and app
    // configuration in the separate state directory must be byte-identical.
    expect(await readFile(path.join(dataDir, "vibed-identity.json"), "utf8")).toBe(identityBefore);
    expect(await readFile(path.join(dataDir, "daemon-config.json"), "utf8")).toBe(appConfigBefore);
  }, 20_000);

  it("rejects a manifest file whose declared digest does not match its own bytes before staging anything", async () => {
    const runtimeRoot = path.join(await tempDir(), "runtime");
    const dataDir = await isolatedDataDir();
    const realFiles = await realRuntimeFiles();
    const v1 = buildManifest(realFiles, "0.1.0");
    await stageManifest(runtimeRoot, v1);
    await switchCurrent(runtimeRoot, v1.version);

    const v2 = buildManifest(realFiles, "0.1.1");
    const tamperedRuntime = v2.runtime.map((file, index) =>
      index === 0 ? { ...file, sha256: sha256Hex(Buffer.from("tampered")) } : file
    );
    const tamperedManifest = {
      ...v2,
      runtime: tamperedRuntime,
      version: computeVersionIdLocal(v2.releaseVersion, tamperedRuntime)
    };

    const { server, url } = await startManifestServer({ current: tamperedManifest });
    cleanupTasks.push(() => new Promise((resolve) => server.close(resolve)));

    await expect(performUpdate({
      runtimeRoot,
      dataDir,
      manifestUrl: url,
      restart: async () => {},
      checkHealth: async () => true
    })).rejects.toThrow(/Digest mismatch/);

    expect(await readCurrentVersionId(runtimeRoot)).toBe(v1.version);
  });

  it("fails closed when a public key is configured but the manifest carries no signature", async () => {
    const runtimeRoot = path.join(await tempDir(), "runtime");
    const dataDir = await isolatedDataDir();
    const realFiles = await realRuntimeFiles();
    const v1 = buildManifest(realFiles, "0.1.0");
    await stageManifest(runtimeRoot, v1);
    await switchCurrent(runtimeRoot, v1.version);

    const v2 = buildManifest(realFiles, "0.1.1");
    const { server, url } = await startManifestServer({ current: v2 });
    cleanupTasks.push(() => new Promise((resolve) => server.close(resolve)));

    await expect(performUpdate({
      runtimeRoot,
      dataDir,
      manifestUrl: url,
      publicKeyBase64: Buffer.alloc(32, 7).toString("base64"),
      restart: async () => {},
      checkHealth: async () => true
    })).rejects.toThrow(/signature/i);

    expect(await readCurrentVersionId(runtimeRoot)).toBe(v1.version);
  });

  it("accepts a genuinely signed manifest and rejects a tampered one, against a production-like public key config", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const publicKeyBase64 = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64");
    const privateKeyDer = Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      privateKey.export({ format: "der", type: "pkcs8" }).subarray(-32)
    ]);
    const { createPrivateKey } = await import("node:crypto");
    const signingKey = createPrivateKey({ key: privateKeyDer, format: "der", type: "pkcs8" });
    const signManifest = (manifest) => ({
      ...manifest,
      signature: sign(null, canonicalManifestDigestBytes(manifest), signingKey).toString("base64"),
      keyId: "ed25519-test-key"
    });

    const runtimeRoot = path.join(await tempDir(), "runtime");
    const dataDir = await isolatedDataDir();
    const realFiles = await realRuntimeFiles();
    const v1 = signManifest(buildManifest(realFiles, "0.1.0"));
    await stageManifest(runtimeRoot, v1);
    await switchCurrent(runtimeRoot, v1.version);

    const v2 = signManifest(buildManifest(realFiles, "0.1.1"));
    const { server, url } = await startManifestServer({ current: v2 });
    cleanupTasks.push(() => new Promise((resolve) => server.close(resolve)));

    // A genuinely, correctly signed manifest is accepted end-to-end (staged, switched, healthy).
    const accepted = await performUpdate({
      runtimeRoot,
      dataDir,
      manifestUrl: url,
      publicKeyBase64,
      restart: async () => {},
      checkHealth: async () => true
    });
    expect(accepted.status).toBe("updated");
    expect(await readCurrentVersionId(runtimeRoot)).toBe(v2.version);

    // A tampered payload (signature valid for the original bytes, but the served
    // JSON was mutated afterward) must be rejected before anything is staged.
    const v3 = signManifest(buildManifest(realFiles, "0.1.2"));
    const tamperedV3 = { ...v3, releaseVersion: "9.9.9-tampered" };
    await new Promise((resolve) => { server.close(resolve); });
    const { server: tamperedServer, url: tamperedUrl } = await startManifestServer({ current: tamperedV3 });
    cleanupTasks.push(() => new Promise((resolve) => tamperedServer.close(resolve)));

    await expect(performUpdate({
      runtimeRoot,
      dataDir,
      manifestUrl: tamperedUrl,
      publicKeyBase64,
      restart: async () => {},
      checkHealth: async () => true
    })).rejects.toThrow(/signature/i);

    // The tamper attempt must not have replaced the currently active, verified version.
    expect(await readCurrentVersionId(runtimeRoot)).toBe(v2.version);
  });

  it("automatically rolls back to the last-known-good version when the new version never becomes healthy", async () => {
    const runtimeRoot = path.join(await tempDir(), "runtime");
    const dataDir = await isolatedDataDir();
    const realFiles = await realRuntimeFiles();
    const v1 = buildManifest(realFiles, "0.1.0");
    const v3broken = buildBrokenManifest(realFiles, "0.1.2");

    await stageManifest(runtimeRoot, v1);
    await switchCurrent(runtimeRoot, v1.version);

    const { server, url } = await startManifestServer({ current: v3broken });
    cleanupTasks.push(() => new Promise((resolve) => server.close(resolve)));
    const { restart } = makeRestarter(runtimeRoot, dataDir);

    const result = await performUpdate({
      runtimeRoot,
      dataDir,
      manifestUrl: url,
      restart,
      checkHealth: () => checkVibedHealth({ dataDir }),
      pollAttempts: 10,
      pollDelayMs: 100
    });

    expect(result.status).toBe("rolled_back");
    expect(result.versionId).toBe(v3broken.version);
    expect(result.previousVersionId).toBe(v1.version);
    expect(await readCurrentVersionId(runtimeRoot)).toBe(v1.version);
    expect(await checkVibedHealth({ dataDir })).toBe(true);
  }, 30_000);

  it("updates every configured Agent skill root from the verified skill bundle", async () => {
    const root = await tempDir();
    const runtimeRoot = path.join(root, "runtime");
    const dataDir = await isolatedDataDir();
    const realFiles = await realRuntimeFiles();
    const v1 = buildManifest(realFiles, "0.1.0");
    const v2 = buildManifest(realFiles, "0.1.1");
    const skillBody = Buffer.from("---\nname: add-app\n---\n");
    v2.skill = [{
      path: "SKILL.md",
      sha256: sha256Hex(skillBody),
      size: skillBody.length,
      contents: skillBody.toString("base64")
    }];
    await stageManifest(runtimeRoot, v1);
    await switchCurrent(runtimeRoot, v1.version);
    const skillRoots = ["claude/add_app", "codex/add-app", "agents/add-app"].map((part) => path.join(root, part));
    const { server, url } = await startManifestServer({ current: v2 });
    cleanupTasks.push(() => new Promise((resolve) => server.close(resolve)));

    const result = await performUpdate({
      runtimeRoot,
      dataDir,
      skillRoots,
      manifestUrl: url,
      restart: async () => {},
      checkHealth: async () => true
    });

    expect(result.status).toBe("updated");
    for (const skillRoot of skillRoots) {
      expect(await readFile(path.join(skillRoot, "SKILL.md"))).toEqual(skillBody);
    }
  });
});

describe("performRollback", () => {
  it("switches to the recorded LKG version and reports healthy after a real restart", async () => {
    const runtimeRoot = path.join(await tempDir(), "runtime");
    const dataDir = await isolatedDataDir();
    const realFiles = await realRuntimeFiles();
    const v1 = buildManifest(realFiles, "0.1.0");
    const v2 = buildManifest(realFiles, "0.1.1");

    await stageManifest(runtimeRoot, v1);
    await stageManifest(runtimeRoot, v2);
    await switchCurrent(runtimeRoot, v1.version);
    await switchCurrent(runtimeRoot, v2.version);
    expect(await readLastKnownGoodVersionId(runtimeRoot)).toBe(v1.version);

    const { restart } = makeRestarter(runtimeRoot, dataDir);
    const result = await performRollback({ runtimeRoot, restart, checkHealth: () => checkVibedHealth({ dataDir }) });

    expect(result.status).toBe("rolled_back");
    expect(result.versionId).toBe(v1.version);
    expect(await readCurrentVersionId(runtimeRoot)).toBe(v1.version);
    expect(await checkVibedHealth({ dataDir })).toBe(true);
  }, 20_000);

  it("throws when no last-known-good version is recorded", async () => {
    const runtimeRoot = path.join(await tempDir(), "runtime");
    const realFiles = await realRuntimeFiles();
    const v1 = buildManifest(realFiles, "0.1.0");
    await stageManifest(runtimeRoot, v1);
    await switchCurrent(runtimeRoot, v1.version);

    await expect(performRollback({
      runtimeRoot,
      restart: async () => {},
      checkHealth: async () => true
    })).rejects.toThrow(/No last-known-good/);
  });
});
