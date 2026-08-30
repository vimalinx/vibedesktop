import { createHash } from "node:crypto";
import { lstat, mkdtemp, readFile, readlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  computeVersionId,
  listVersionIds,
  pruneVersions,
  readCurrentVersionId,
  readLastKnownGoodVersionId,
  removeRuntimeTree,
  sha256Hex,
  stageVersion,
  switchCurrent,
  versionDirectory,
} from "./version-store.mjs";

const roots = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRuntimeRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "vibed-version-store-"));
  roots.push(root);
  return root;
}

function file(relativePath, text) {
  const contents = Buffer.from(text, "utf8");
  return { path: relativePath, sha256: sha256Hex(contents), size: contents.length, contents: contents.toString("base64") };
}

function buildManifest(runtimeRoot, releaseVersion, texts) {
  const files = Object.entries(texts).map(([relativePath, text]) => file(relativePath, text));
  const versionId = computeVersionId(releaseVersion, files);
  return { runtimeRoot, versionId, releaseVersion, generatedAt: new Date().toISOString(), files };
}

describe("computeVersionId", () => {
  it("is deterministic for identical content and changes when content changes", () => {
    const filesA = [file("daemon/server.mjs", "console.log(1)")];
    const filesB = [file("daemon/server.mjs", "console.log(1)")];
    const filesC = [file("daemon/server.mjs", "console.log(2)")];
    expect(computeVersionId("0.1.0", filesA)).toBe(computeVersionId("0.1.0", filesB));
    expect(computeVersionId("0.1.0", filesA)).not.toBe(computeVersionId("0.1.0", filesC));
  });
});

describe("stageVersion", () => {
  it("stages files, verifies digests, and writes manifest.json", async () => {
    const runtimeRoot = await tempRuntimeRoot();
    const manifest = buildManifest(runtimeRoot, "0.1.0", {
      "daemon/server.mjs": "export const ok = true;",
      "node_modules/ws/package.json": "{}",
    });
    const finalDir = await stageVersion(manifest);
    expect(finalDir).toBe(versionDirectory(runtimeRoot, manifest.versionId));
    const server = await readFile(path.join(finalDir, "daemon/server.mjs"), "utf8");
    expect(server).toBe("export const ok = true;");
    const storedManifest = JSON.parse(await readFile(path.join(finalDir, "manifest.json"), "utf8"));
    expect(storedManifest.version).toBe(manifest.versionId);
    expect(storedManifest.files).toHaveLength(2);
  });

  it("rejects a tampered digest before anything becomes visible", async () => {
    const runtimeRoot = await tempRuntimeRoot();
    const manifest = buildManifest(runtimeRoot, "0.1.0", { "daemon/server.mjs": "safe" });
    manifest.files[0].sha256 = createHash("sha256").update("tampered").digest("hex");
    await expect(stageVersion(manifest)).rejects.toThrow(/Digest mismatch/);
    expect(await listVersionIds(runtimeRoot)).toEqual([]);
  });

  it("is idempotent when restaging identical content", async () => {
    const runtimeRoot = await tempRuntimeRoot();
    const manifest = buildManifest(runtimeRoot, "0.1.0", { "daemon/server.mjs": "same" });
    await stageVersion(manifest);
    await expect(stageVersion(manifest)).resolves.toBe(versionDirectory(runtimeRoot, manifest.versionId));
    expect(await listVersionIds(runtimeRoot)).toEqual([manifest.versionId]);
  });
});

describe("switchCurrent / LKG / prune", () => {
  it("switches current atomically with a relative symlink and records the LKG pointer", async () => {
    const runtimeRoot = await tempRuntimeRoot();
    const v1 = buildManifest(runtimeRoot, "0.1.0", { "daemon/server.mjs": "v1" });
    const v2 = buildManifest(runtimeRoot, "0.1.0", { "daemon/server.mjs": "v2" });
    await stageVersion(v1);
    await stageVersion(v2);

    const first = await switchCurrent(runtimeRoot, v1.versionId);
    expect(first.previous).toBeNull();
    expect(await readCurrentVersionId(runtimeRoot)).toBe(v1.versionId);
    expect(await readLastKnownGoodVersionId(runtimeRoot)).toBeNull();

    const linkTarget = await readlink(path.join(runtimeRoot, "current"));
    expect(linkTarget).toBe(path.join("versions", v1.versionId));
    expect((await lstat(path.join(runtimeRoot, "current"))).isSymbolicLink()).toBe(true);

    const second = await switchCurrent(runtimeRoot, v2.versionId);
    expect(second.previous).toBe(v1.versionId);
    expect(await readCurrentVersionId(runtimeRoot)).toBe(v2.versionId);
    expect(await readLastKnownGoodVersionId(runtimeRoot)).toBe(v1.versionId);
  });

  it("throws when switching to a version that was never staged", async () => {
    const runtimeRoot = await tempRuntimeRoot();
    await expect(switchCurrent(runtimeRoot, "0.1.0+doesnotexist")).rejects.toThrow(/not staged/);
  });

  it("prunes everything except the ids passed to keep", async () => {
    const runtimeRoot = await tempRuntimeRoot();
    const v1 = buildManifest(runtimeRoot, "0.1.0", { "daemon/server.mjs": "v1" });
    const v2 = buildManifest(runtimeRoot, "0.1.0", { "daemon/server.mjs": "v2" });
    const v3 = buildManifest(runtimeRoot, "0.1.0", { "daemon/server.mjs": "v3" });
    await stageVersion(v1);
    await stageVersion(v2);
    await stageVersion(v3);
    await switchCurrent(runtimeRoot, v1.versionId);
    await switchCurrent(runtimeRoot, v2.versionId);

    const removed = await pruneVersions(runtimeRoot, [v1.versionId, v2.versionId]);
    expect(removed).toEqual([v3.versionId]);
    expect(new Set(await listVersionIds(runtimeRoot))).toEqual(new Set([v1.versionId, v2.versionId]));
  });

  it("removeRuntimeTree deletes the whole runtime root", async () => {
    const runtimeRoot = await tempRuntimeRoot();
    const v1 = buildManifest(runtimeRoot, "0.1.0", { "daemon/server.mjs": "v1" });
    await stageVersion(v1);
    await switchCurrent(runtimeRoot, v1.versionId);
    await removeRuntimeTree(runtimeRoot);
    await expect(readFile(path.join(runtimeRoot, "current"))).rejects.toThrow();
  });
});
