// @ts-check
/**
 * Mirrors `src/lib/vibed-release-manifest.ts`'s canonical bytes and Ed25519
 * verification exactly (same key order, same DER wrapping) so a signature
 * produced against the Next.js-side canonical bytes verifies here too. Kept
 * as a separate small implementation because only `daemon/**\/*.mjs` ships
 * in the installed runtime bundle — it cannot import a `.ts` file from the
 * Next.js app.
 */
import { createPublicKey, verify } from "node:crypto";

/**
 * @param {{ version: string; releaseVersion: string; generatedAt: string;
 *   runtime: Array<{ path: string; sha256: string; size: number }>;
 *   skill: Array<{ path: string; sha256: string; size: number }> }} manifest
 */
export function canonicalManifestDigestBytes(manifest) {
  const digestOnly = (files) => files.map(({ path: filePath, sha256, size }) => ({ path: filePath, sha256, size }));
  return Buffer.from(JSON.stringify({
    version: manifest.version,
    releaseVersion: manifest.releaseVersion,
    generatedAt: manifest.generatedAt,
    runtime: digestOnly(manifest.runtime),
    skill: digestOnly(manifest.skill),
  }), "utf8");
}

/**
 * @param {Parameters<typeof canonicalManifestDigestBytes>[0]} manifest
 * @param {string} signatureBase64
 * @param {string} publicKeyBase64 raw 32-byte Ed25519 public key, base64
 */
export function verifyManifestSignature(manifest, signatureBase64, publicKeyBase64) {
  try {
    const publicKeyDer = Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      Buffer.from(publicKeyBase64, "base64"),
    ]);
    const publicKey = createPublicKey({ key: publicKeyDer, format: "der", type: "spki" });
    return verify(null, canonicalManifestDigestBytes(manifest), publicKey, Buffer.from(signatureBase64, "base64"));
  } catch {
    return false;
  }
}
