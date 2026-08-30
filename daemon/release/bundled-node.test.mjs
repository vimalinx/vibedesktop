import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { BUNDLED_NODE_RELEASES, ensureBundledNode, resolveBundledNodePlan, sha256Hex } from "./bundled-node.mjs";

const execFileAsync = promisify(execFile);
const roots = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempDir() {
  const root = await mkdtemp(path.join(tmpdir(), "bundled-node-"));
  roots.push(root);
  return root;
}

/** Builds a real gzip tar fixture with `bin/node` inside a single top-level folder, mirroring nodejs.org's archive shape. */
async function buildFixtureArchive(rootLabel, nodeScriptContents) {
  const workDir = await tempDir();
  const topLevel = path.join(workDir, rootLabel);
  await mkdir(path.join(topLevel, "bin"), { recursive: true });
  await writeFile(path.join(topLevel, "bin", "node"), nodeScriptContents, { mode: 0o755 });
  const archivePath = path.join(workDir, "fixture.tar.gz");
  await execFileAsync("tar", ["-czf", archivePath, "-C", workDir, rootLabel]);
  return readFile(archivePath);
}

function fakeResponse(buffer, ok = true, status = 200) {
  return {
    ok,
    status,
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  };
}

describe("resolveBundledNodePlan", () => {
  it("maps x64 and arm64 to their pinned nodejs.org archive and real published digest", () => {
    const x64 = resolveBundledNodePlan("x64");
    expect(x64.url).toBe(`https://nodejs.org/dist/${x64.version}/${BUNDLED_NODE_RELEASES.x64.archive}`);
    expect(x64.sha256).toBe(BUNDLED_NODE_RELEASES.x64.sha256);
    expect(x64.sha256).toHaveLength(64);

    const arm64 = resolveBundledNodePlan("arm64");
    expect(arm64.sha256).toBe(BUNDLED_NODE_RELEASES.arm64.sha256);
    expect(arm64.sha256).not.toBe(x64.sha256);
  });

  it("rejects an unsupported architecture", () => {
    expect(() => resolveBundledNodePlan("mips")).toThrow(/No bundled Node build/);
  });
});

describe("ensureBundledNode", () => {
  it("downloads, verifies against a real digest, and extracts a real tar.gz fixture end to end", async () => {
    const archiveBuffer = await buildFixtureArchive("node-v99.0.0-linux-x64", "#!/bin/sh\necho fake-node\n");
    const destinationDir = path.join(await tempDir(), "node-runtime");
    const plan = {
      url: "https://example.invalid/node-v99.0.0-linux-x64.tar.gz",
      sha256: sha256Hex(archiveBuffer),
      version: "v99.0.0",
      archiveName: "node-v99.0.0-linux-x64.tar.gz"
    };

    const result = await ensureBundledNode({
      destinationDir,
      plan,
      fetchImpl: async () => fakeResponse(archiveBuffer)
    });

    expect(result.version).toBe("v99.0.0");
    expect(result.nodeBinary).toBe(path.join(destinationDir, "bin", "node"));
    const extracted = await readFile(result.nodeBinary, "utf8");
    expect(extracted).toContain("fake-node");
  }, 20_000);

  it("fails closed before extracting when the downloaded archive digest does not match the expected checksum", async () => {
    const archiveBuffer = await buildFixtureArchive("node-v99.0.0-linux-x64", "#!/bin/sh\necho tampered\n");
    const destinationDir = path.join(await tempDir(), "node-runtime");
    const plan = {
      url: "https://example.invalid/node-v99.0.0-linux-x64.tar.gz",
      sha256: "0".repeat(64),
      version: "v99.0.0",
      archiveName: "node-v99.0.0-linux-x64.tar.gz"
    };

    await expect(ensureBundledNode({
      destinationDir,
      plan,
      fetchImpl: async () => fakeResponse(archiveBuffer)
    })).rejects.toThrow(/checksum mismatch/);

    await expect(readFile(path.join(destinationDir, "bin", "node"))).rejects.toThrow();
  });

  it("propagates a non-2xx download response as an explicit error", async () => {
    const plan = { url: "https://example.invalid/x", sha256: "0".repeat(64), version: "v99.0.0", archiveName: "x.tar.gz" };
    await expect(ensureBundledNode({
      destinationDir: path.join(await tempDir(), "node-runtime"),
      plan,
      fetchImpl: async () => fakeResponse(Buffer.from(""), false, 404)
    })).rejects.toThrow(/HTTP 404/);
  });
});

describe("real network download (opt-in)", () => {
  const enabled = process.env.VIBE_TEST_BUNDLED_NODE_DOWNLOAD === "1";
  it.skipIf(!enabled)("downloads and verifies the real pinned Node archive from nodejs.org", async () => {
    const destinationDir = path.join(await tempDir(), "node-runtime");
    const result = await ensureBundledNode({ destinationDir, nodeArch: "x64" });
    const version = await execFileAsync(result.nodeBinary, ["--version"]);
    expect(version.stdout.trim()).toBe(result.version);
  }, 120_000);
});

describe("pinned checksum shape", () => {
  it("matches sha256 hex output format for every supported architecture", () => {
    for (const release of Object.values(BUNDLED_NODE_RELEASES)) {
      expect(release.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
