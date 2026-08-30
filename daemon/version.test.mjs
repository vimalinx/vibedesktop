import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DAEMON_RELEASE_VERSION, resolveRuntimeVersion } from "./version.mjs";

const roots = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "vibed-version-"));
  roots.push(root);
  return root;
}

describe("resolveRuntimeVersion", () => {
  it("falls back to the release constant with no manifest.json sibling", async () => {
    const root = await tempRoot();
    const daemonDir = path.join(root, "daemon");
    await mkdir(daemonDir, { recursive: true });
    await expect(resolveRuntimeVersion(daemonDir)).resolves.toBe(DAEMON_RELEASE_VERSION);
  });

  it("prefers the installed manifest version when present", async () => {
    const root = await tempRoot();
    const daemonDir = path.join(root, "daemon");
    await mkdir(daemonDir, { recursive: true });
    await writeFile(path.join(root, "manifest.json"), JSON.stringify({ version: "0.1.0+abc123def456" }));
    await expect(resolveRuntimeVersion(daemonDir)).resolves.toBe("0.1.0+abc123def456");
  });

  it("falls back on a malformed manifest.json", async () => {
    const root = await tempRoot();
    const daemonDir = path.join(root, "daemon");
    await mkdir(daemonDir, { recursive: true });
    await writeFile(path.join(root, "manifest.json"), "not json");
    await expect(resolveRuntimeVersion(daemonDir)).resolves.toBe(DAEMON_RELEASE_VERSION);
  });
});
