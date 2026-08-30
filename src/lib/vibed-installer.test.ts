import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { buildHostedShellInstallCommand } from "@/lib/hosted-installer-contract";
import { listAddAppSkillFileNames } from "@/lib/add-app-skill-installer";
import { buildVibedInstallCommand } from "@/lib/vibed-installer-contract";
import {
  BUNDLED_NODE_CHECKSUMS,
  BUNDLED_NODE_VERSION,
  buildVibedInstaller,
  loadVibedInstallerFiles,
  type VibedInstallerFiles
} from "@/lib/vibed-installer";
// @ts-expect-error — daemon/**/*.mjs ships without type declarations (allowJs is off for the Next.js app); only used here to guard against pinned-checksum drift between the two runtimes.
import { BUNDLED_NODE_RELEASES, BUNDLED_NODE_VERSION as DAEMON_BUNDLED_NODE_VERSION } from "../../daemon/cloud/bundled-node.mjs";

const requiredRuntimePaths = [
  "daemon/server.mjs",
  "daemon/cli-entry.mjs",
  "daemon/cloud/version-store.mjs",
  "daemon/cloud/lifecycle-update.mjs",
  "daemon/cloud/lifecycle-uninstall.mjs"
];

function fixtureFiles(): VibedInstallerFiles {
  return {
    runtime: requiredRuntimePaths.map((filePath) => ({ path: filePath, contents: Buffer.from(filePath) })),
    skill: listAddAppSkillFileNames().map((filePath) => ({
      path: filePath,
      contents: Buffer.from(filePath)
    }))
  };
}

describe("vibed installer", () => {
  it("collects the production runtime without daemon tests", async () => {
    const files = await loadVibedInstallerFiles(process.cwd());
    const runtimePaths = files.runtime.map((file) => file.path);

    for (const required of requiredRuntimePaths) expect(runtimePaths).toContain(required);
    expect(runtimePaths.some((file) => file.endsWith(".test.mjs"))).toBe(false);
    expect(files.skill.map((file) => file.path)).toEqual(listAddAppSkillFileNames());
  });

  it("stays in sync with daemon/cloud/bundled-node.mjs's pinned version and checksums", () => {
    expect(BUNDLED_NODE_VERSION).toBe(DAEMON_BUNDLED_NODE_VERSION);
    expect(BUNDLED_NODE_CHECKSUMS.x64).toBe(BUNDLED_NODE_RELEASES.x64.sha256);
    expect(BUNDLED_NODE_CHECKSUMS.arm64).toBe(BUNDLED_NODE_RELEASES.arm64.sha256);
  });

  it("throws when a required runtime file is missing", () => {
    const files = fixtureFiles();
    files.runtime = files.runtime.filter((file) => file.path !== "daemon/cloud/version-store.mjs");
    expect(() => buildVibedInstaller(files)).toThrow(/incomplete/);
  });

  it("builds a versioned, checksum-verified, atomic Linux installer and a same-origin command", () => {
    const installer = buildVibedInstaller(fixtureFiles());

    expect(installer).toContain("VIBEDESKTOP_VIBED_INSTALLER");
    expect(installer).toContain("SPDX-License-Identifier: Apache-2.0");
    expect(installer).toContain("vibedesktop-daemon.service");
    expect(installer).not.toContain("VIBE_CLOUD_CONTROL_ENABLED");
    expect(installer).toContain("--install-only");
    expect(installer).not.toContain("pairing-status.mjs");
    expect(installer).not.toContain(process.cwd());

    // Versioned layout: staging + digest verification + atomic switchCurrent, not a flat overwrite.
    expect(installer).toContain("versions");
    expect(installer).toContain("switchCurrent");
    expect(installer).toContain("finalizeStagedDirectory");
    expect(installer).toContain("Digest mismatch while staging");
    expect(installer).toContain("Checksum verification failed");

    // CLI gains explicit update/rollback/disable/uninstall.
    expect(installer).toContain("lifecycle-update.mjs");
    expect(installer).toContain("lifecycle-uninstall.mjs");
    expect(installer).toContain("--rollback");
    expect(installer).toContain("disable) exec systemctl --user disable --now");

    // Node-less bootstrap: pinned checksums appear verbatim and fail closed on mismatch.
    expect(installer).toContain(BUNDLED_NODE_CHECKSUMS.x64);
    expect(installer).toContain(BUNDLED_NODE_CHECKSUMS.arm64);
    expect(installer).toContain(`node-${BUNDLED_NODE_VERSION}-linux-$NODE_ARCH.tar.gz`);
    expect(installer).toContain("checksum mismatch");

    // Failed post-install health falls back to a last-known-good rollback via the installed CLI.
    expect(installer).toContain("lkg.json");
    expect(installer).toContain('"$VIBED_BIN" rollback');

    expect(buildVibedInstallCommand("https://vibedesktop.example/settings")).toBe(
      "curl -fsSL 'https://vibedesktop.example/api/setup/vibed' | sh"
    );
    expect(buildHostedShellInstallCommand("https://vibedesktop.example", "/api/setup/o'hare")).toBe(
      "curl -fsSL 'https://vibedesktop.example/api/setup/o'\"'\"'hare' | sh"
    );
  });

  it("produces a deterministic version id for identical files and a different one when content changes", () => {
    const filesA = fixtureFiles();
    const filesB = fixtureFiles();
    filesB.runtime = filesB.runtime.map((file) =>
      file.path === "daemon/server.mjs" ? { ...file, contents: Buffer.from("changed") } : file
    );

    const installerA = buildVibedInstaller(filesA);
    const installerB = buildVibedInstaller(filesB);
    const versionIdA = extractVersionId(installerA);
    const versionIdB = extractVersionId(installerB);

    expect(versionIdA).toMatch(/^0\.1\.0\+[0-9a-f]{12}$/);
    expect(versionIdA).not.toBe(versionIdB);
    // Rebuilding with byte-identical files reproduces the exact same version id.
    expect(extractVersionId(buildVibedInstaller(fixtureFiles()))).toBe(versionIdA);
  });

  it("embeds a release verification key only when the release build supplies one", () => {
    const unsigned = buildVibedInstaller(fixtureFiles());
    const signed = buildVibedInstaller(fixtureFiles(), "ZmFrZS1wdWJsaWMta2V5");

    expect(unsigned).toContain('.replaceAll("__RELEASE_PUBLIC_KEY__", () => shellQuote(""))');
    expect(signed).toContain('.replaceAll("__RELEASE_PUBLIC_KEY__", () => shellQuote("ZmFrZS1wdWJsaWMta2V5"))');
    expect(signed).toContain("VIBE_RELEASE_PUBLIC_KEY");
  });
});

function extractVersionId(installer: string): string {
  const match = installer.match(/const versionId = "([^"]+)";/);
  if (!match) throw new Error("versionId not found in generated installer");
  return match[1];
}
