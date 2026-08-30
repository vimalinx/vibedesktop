import { Buffer } from "node:buffer";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildReleaseManifest,
  canonicalManifestDigestBytes,
  classifyDeviceRuntimeCompatibility,
  computeVersionId,
  currentReleaseInfo,
  signManifestDigest,
  signManifestFromKeyFile,
  verifyManifestSignature
} from "@/lib/vibed-release-manifest";

function runtimeFiles(entries: Record<string, string>) {
  return Object.entries(entries).map(([path, text]) => ({ path, contents: Buffer.from(text, "utf8") }));
}

describe("computeVersionId", () => {
  it("is deterministic and changes when file content changes", () => {
    const a = [{ path: "daemon/server.mjs", sha256: "a".repeat(64) }];
    const b = [{ path: "daemon/server.mjs", sha256: "a".repeat(64) }];
    const c = [{ path: "daemon/server.mjs", sha256: "b".repeat(64) }];
    expect(computeVersionId("0.1.0", a)).toBe(computeVersionId("0.1.0", b));
    expect(computeVersionId("0.1.0", a)).not.toBe(computeVersionId("0.1.0", c));
  });

  it("is order-independent over the file list", () => {
    const files = [
      { path: "b.mjs", sha256: "b".repeat(64) },
      { path: "a.mjs", sha256: "a".repeat(64) }
    ];
    const reversed = [...files].reverse();
    expect(computeVersionId("0.1.0", files)).toBe(computeVersionId("0.1.0", reversed));
  });
});

describe("buildReleaseManifest", () => {
  it("produces per-file digests and a stable version id for identical content", () => {
    const files = { runtime: runtimeFiles({ "daemon/server.mjs": "export const ok = 1;" }), skill: runtimeFiles({ "SKILL.md": "# skill" }) };
    const manifestA = buildReleaseManifest(files, "0.1.0");
    const manifestB = buildReleaseManifest(files, "0.1.0");
    expect(manifestA.version).toBe(manifestB.version);
    expect(manifestA.runtime[0].sha256).toHaveLength(64);
    expect(manifestA.runtime[0].size).toBe(Buffer.byteLength("export const ok = 1;"));
    expect(Buffer.from(manifestA.runtime[0].contents, "base64").toString("utf8")).toBe("export const ok = 1;");
    expect(manifestA.signature).toBeNull();
    expect(manifestA.keyId).toBeNull();
  });

  it("changes the version id when a runtime file's bytes change", () => {
    const filesA = { runtime: runtimeFiles({ "daemon/server.mjs": "v1" }), skill: [] };
    const filesB = { runtime: runtimeFiles({ "daemon/server.mjs": "v2" }), skill: [] };
    expect(buildReleaseManifest(filesA, "0.1.0").version).not.toBe(buildReleaseManifest(filesB, "0.1.0").version);
  });
});

describe("verifyManifestSignature", () => {
  it("accepts a valid detached Ed25519 signature and rejects a tampered manifest", () => {
    const files = { runtime: runtimeFiles({ "daemon/server.mjs": "export const ok = 1;" }), skill: [] };
    const manifest = buildReleaseManifest(files, "0.1.0");
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const rawPublicKey = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
    const signatureBase64 = sign(null, canonicalManifestDigestBytes(manifest), privateKey).toString("base64");
    const publicKeyBase64 = rawPublicKey.toString("base64");

    expect(verifyManifestSignature(manifest, signatureBase64, publicKeyBase64)).toBe(true);

    const tampered = { ...manifest, releaseVersion: "9.9.9" };
    expect(verifyManifestSignature(tampered, signatureBase64, publicKeyBase64)).toBe(false);
  });

  it("returns false (never throws) for malformed signature/key input", () => {
    const manifest = buildReleaseManifest({ runtime: [], skill: [] }, "0.1.0");
    expect(verifyManifestSignature(manifest, "not-base64!!", "also-not-base64!!")).toBe(false);
  });
});

describe("classifyDeviceRuntimeCompatibility", () => {
  const current = { version: "0.1.0+aaaa11112222", releaseVersion: "0.1.0" };

  it("is unknown when the device has never reported a runtime version", () => {
    expect(classifyDeviceRuntimeCompatibility(null, current)).toBe("unknown");
  });

  it("is compatible when the device's exact content-addressed version matches", () => {
    expect(classifyDeviceRuntimeCompatibility("0.1.0+aaaa11112222", current)).toBe("compatible");
  });

  it("is update_available when only the content hash differs on the same release line", () => {
    expect(classifyDeviceRuntimeCompatibility("0.1.0+bbbb33334444", current)).toBe("update_available");
  });

  it("is update_required when the release line itself differs", () => {
    expect(classifyDeviceRuntimeCompatibility("0.2.0+cccc55556666", current)).toBe("update_required");
  });
});

describe("currentReleaseInfo", () => {
  it("returns null instead of throwing when the runtime/skill sources are unavailable", async () => {
    const result = await currentReleaseInfo("/nonexistent/project/root/for/tests");
    expect(result).toBeNull();
  });
});

describe("signManifestDigest / signManifestFromKeyFile", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  });

  it("signManifestDigest produces a signature verifiable by the matching raw public key", () => {
    const manifest = buildReleaseManifest({ runtime: runtimeFiles({ "daemon/server.mjs": "export const ok = 1;" }), skill: [] }, "0.1.0");
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const privateKeyBase64 = privateKey.export({ format: "der", type: "pkcs8" }).subarray(-32).toString("base64");
    const publicKeyBase64 = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64");

    const signatureBase64 = signManifestDigest(manifest, privateKeyBase64);
    expect(verifyManifestSignature(manifest, signatureBase64, publicKeyBase64)).toBe(true);

    const tampered = { ...manifest, releaseVersion: "9.9.9" };
    expect(verifyManifestSignature(tampered, signatureBase64, publicKeyBase64)).toBe(false);
  });

  it("signManifestFromKeyFile attaches signature+keyId from a real key file, verifiable with the printed public key", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "vibed-release-key-test-"));
    const keyFilePath = path.join(tempDir, "release-signing-key.json");
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const privateKeyBase64 = privateKey.export({ format: "der", type: "pkcs8" }).subarray(-32).toString("base64");
    const publicKeyBase64 = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64");
    const keyId = "ed25519-test-key";
    await writeFile(keyFilePath, JSON.stringify({ keyId, publicKeyBase64, privateKeyBase64 }), "utf8");

    const manifest = buildReleaseManifest({ runtime: runtimeFiles({ "daemon/server.mjs": "export const ok = 1;" }), skill: [] }, "0.1.0");
    const signed = await signManifestFromKeyFile(manifest, keyFilePath);

    expect(signed.keyId).toBe(keyId);
    expect(typeof signed.signature).toBe("string");
    expect(verifyManifestSignature(signed, signed.signature ?? "", publicKeyBase64)).toBe(true);

    const tampered = { ...signed, releaseVersion: "9.9.9" };
    expect(verifyManifestSignature(tampered, tampered.signature ?? "", publicKeyBase64)).toBe(false);
  });

  it("signManifestFromKeyFile returns the manifest unchanged when no key file path is configured", async () => {
    const manifest = buildReleaseManifest({ runtime: [], skill: [] }, "0.1.0");
    const result = await signManifestFromKeyFile(manifest, undefined);
    expect(result).toBe(manifest);
    expect(result.signature).toBeNull();
  });

  it("signManifestFromKeyFile returns the manifest unchanged (never throws) when the key file is missing or malformed", async () => {
    const manifest = buildReleaseManifest({ runtime: [], skill: [] }, "0.1.0");

    const missing = await signManifestFromKeyFile(manifest, "/nonexistent/path/for/tests/release-signing-key.json");
    expect(missing).toBe(manifest);

    tempDir = await mkdtemp(path.join(tmpdir(), "vibed-release-key-test-malformed-"));
    const malformedPath = path.join(tempDir, "release-signing-key.json");
    await writeFile(malformedPath, JSON.stringify({ keyId: "x" }), "utf8");
    const malformed = await signManifestFromKeyFile(manifest, malformedPath);
    expect(malformed).toBe(manifest);
  });
});
