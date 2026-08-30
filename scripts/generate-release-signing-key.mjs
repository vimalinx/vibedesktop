#!/usr/bin/env node
// @ts-check
/**
 * Generates a production Ed25519 release-signing keypair OUTSIDE this
 * repository. Run this once per signing environment (e.g. directly on the
 * production host, or in a dedicated offline signing environment) and never
 * commit its output.
 *
 * Usage:
 *   node scripts/generate-release-signing-key.mjs [output-file]
 *
 * Default output-file: ~/.config/vibedesktop-release/release-signing-key.json
 *
 * Writes a JSON file `{ keyId, publicKeyBase64, privateKeyBase64, generatedAt }`
 * at mode 0600 (parent directory mode 0700). Configure the *server* that
 * serves `/api/setup/vibed/manifest` with:
 *
 *   VIBE_RELEASE_SIGNING_KEY_FILE=<output-file>
 *
 * and configure every machine running `vibed update` (that should verify
 * signatures) with the printed public key:
 *
 *   VIBE_RELEASE_PUBLIC_KEY=<publicKeyBase64>
 *
 * The private key file must stay on the signing host only. It is never read
 * by `vibed update` and is not part of any release artifact.
 */
import { createHash, generateKeyPairSync } from "node:crypto";
import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const DEFAULT_OUTPUT_FILE = path.join(homedir(), ".config", "vibedesktop-release", "release-signing-key.json");

function deriveKeyId(publicKeyRaw) {
  return `ed25519-${createHash("sha256").update(publicKeyRaw).digest("hex").slice(0, 12)}`;
}

async function main() {
  const outputFile = path.resolve(process.argv[2] || DEFAULT_OUTPUT_FILE);
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyRaw = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  const privateKeyRaw = privateKey.export({ format: "der", type: "pkcs8" }).subarray(-32);
  const keyId = deriveKeyId(publicKeyRaw);
  const publicKeyBase64 = publicKeyRaw.toString("base64");
  const privateKeyBase64 = privateKeyRaw.toString("base64");

  const outputDir = path.dirname(outputFile);
  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  await chmod(outputDir, 0o700).catch(() => {});

  const payload = {
    keyId,
    publicKeyBase64,
    privateKeyBase64,
    generatedAt: new Date().toISOString()
  };
  const temporaryFile = `${outputFile}.${process.pid}.tmp`;
  await writeFile(temporaryFile, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  await chmod(temporaryFile, 0o600);
  await rename(temporaryFile, outputFile);
  await chmod(outputFile, 0o600);

  process.stderr.write(`Wrote release signing key: ${outputFile} (mode 0600, private key never printed)\n`);
  process.stdout.write(`keyId=${keyId}\n`);
  process.stdout.write(`publicKeyBase64=${publicKeyBase64}\n`);
  process.stdout.write(
    "\nConfigure the manifest-serving host with:\n" +
    `  VIBE_RELEASE_SIGNING_KEY_FILE=${outputFile}\n` +
    "Configure every machine that should verify updates with:\n" +
    `  VIBE_RELEASE_PUBLIC_KEY=${publicKeyBase64}\n`
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
