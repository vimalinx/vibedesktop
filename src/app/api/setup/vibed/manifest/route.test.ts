import { Buffer } from "node:buffer";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/setup/vibed/manifest/route";
import { listAddAppSkillFileNames } from "@/lib/add-app-skill-installer";
import { sha256Hex, verifyManifestSignature } from "@/lib/vibed-release-manifest";

describe("GET /api/setup/vibed/manifest", () => {
  it("serves a JSON manifest whose digests match the served content and leaks no secret path", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const manifest = await response.json();

    expect(typeof manifest.version).toBe("string");
    expect(manifest.version).toContain("+");
    expect(manifest.releaseVersion).toBe("0.1.6");
    expect(Array.isArray(manifest.runtime)).toBe(true);
    expect(manifest.runtime.length).toBeGreaterThan(0);
    expect(manifest.signature).toBeNull();
    expect(manifest.keyId).toBeNull();

    const server = manifest.runtime.find((file: { path: string }) => file.path === "daemon/server.mjs");
    expect(server).toBeDefined();
    const contents = Buffer.from(server.contents, "base64");
    expect(contents.length).toBe(server.size);
    expect(sha256Hex(contents)).toBe(server.sha256);

    const serialized = JSON.stringify(manifest);
    expect(serialized).not.toContain(process.cwd());
    expect(serialized).not.toMatch(/daemon\.token/);

    const skillNames = manifest.skill.map((file: { path: string }) => file.path);
    expect(skillNames).toEqual(listAddAppSkillFileNames());
  });

  describe("with VIBE_RELEASE_SIGNING_KEY_FILE configured", () => {
    let tempDir: string | null = null;

    afterEach(async () => {
      delete process.env.VIBE_RELEASE_SIGNING_KEY_FILE;
      if (tempDir) await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    });

    it("attaches a signature+keyId verifiable by the matching public key", async () => {
      tempDir = await mkdtemp(path.join(tmpdir(), "vibed-manifest-route-key-test-"));
      const keyFilePath = path.join(tempDir, "release-signing-key.json");
      const { publicKey, privateKey } = generateKeyPairSync("ed25519");
      const privateKeyBase64 = privateKey.export({ format: "der", type: "pkcs8" }).subarray(-32).toString("base64");
      const publicKeyBase64 = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64");
      const keyId = "ed25519-route-test-key";
      await writeFile(keyFilePath, JSON.stringify({ keyId, publicKeyBase64, privateKeyBase64 }), "utf8");
      process.env.VIBE_RELEASE_SIGNING_KEY_FILE = keyFilePath;

      const response = await GET();
      expect(response.status).toBe(200);
      const manifest = await response.json();

      expect(manifest.keyId).toBe(keyId);
      expect(typeof manifest.signature).toBe("string");
      expect(verifyManifestSignature(manifest, manifest.signature, publicKeyBase64)).toBe(true);

      const tampered = { ...manifest, releaseVersion: "9.9.9" };
      expect(verifyManifestSignature(tampered, manifest.signature, publicKeyBase64)).toBe(false);

      // A different (wrong) public key must not verify — proves this isn't a no-op signature.
      const { publicKey: wrongPublicKey } = generateKeyPairSync("ed25519");
      const wrongPublicKeyBase64 = wrongPublicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64");
      expect(verifyManifestSignature(manifest, manifest.signature, wrongPublicKeyBase64)).toBe(false);
    });

    it("still serves an unsigned manifest (never fails the request) when the key file is missing", async () => {
      process.env.VIBE_RELEASE_SIGNING_KEY_FILE = "/nonexistent/path/for/tests/release-signing-key.json";

      const response = await GET();
      expect(response.status).toBe(200);
      const manifest = await response.json();
      expect(manifest.signature).toBeNull();
      expect(manifest.keyId).toBeNull();
    });
  });
});
