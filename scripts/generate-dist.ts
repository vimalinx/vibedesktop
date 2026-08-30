/**
 *   dist/install.sh      — the self-contained vibed (daemon) Linux installer,
 *                          byte-identical to what `GET /api/setup/vibed` serves.
 *   dist/install-app.sh  — the whole-program (Next.js app + vibed) Linux
 *                          installer, byte-identical to `GET /api/setup/app`.
 *   dist/manifest.json   — the update manifest consumed by `vibed update`.
 * When `VIBE_RELEASE_SIGNING_KEY_FILE` points at a signing key file (see
 * `scripts/generate-release-signing-key.mjs`; never committed), the manifest
 * carries a detached Ed25519 signature + keyId. Without it the manifest is
 * unsigned, which is the documented interim state in
 * `daemon/cloud/lifecycle-update.mjs`.
 *
 * Usage: npm run dist:generate
 * Then attach dist/install.sh, dist/install-app.sh, and dist/manifest.json to the GitHub Release.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildVibedInstaller, loadVibedInstallerFiles } from "../src/lib/vibed-installer";
import { buildAppInstaller } from "../src/lib/app-installer";
import {
  buildReleaseManifest,
  signManifestFromKeyFile,
  verifyManifestSignature,
  VIBE_RELEASE_VERSION
} from "../src/lib/vibed-release-manifest";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(projectRoot, "dist");
const signingKeyFile = process.env.VIBE_RELEASE_SIGNING_KEY_FILE;
const requireSignedRelease = process.env.VIBE_REQUIRE_SIGNED_RELEASE === "1";

const files = await loadVibedInstallerFiles(projectRoot);
const releaseKey = signingKeyFile ? await loadReleaseKey(signingKeyFile) : null;
const installer = buildVibedInstaller(files, releaseKey?.publicKeyBase64 ?? null);
const manifest = await signManifestFromKeyFile(
  buildReleaseManifest(files, VIBE_RELEASE_VERSION),
  signingKeyFile
);

if (requireSignedRelease && (!manifest.signature || !manifest.keyId || !releaseKey)) {
  throw new Error("A signed release is required, but VIBE_RELEASE_SIGNING_KEY_FILE did not produce a signature.");
}
if (manifest.signature && releaseKey && !verifyManifestSignature(manifest, manifest.signature, releaseKey.publicKeyBase64)) {
  throw new Error("The release manifest signature does not match the public key in the signing key file.");
}

await mkdir(distDir, { recursive: true });
const appInstaller = buildAppInstaller();
const assets = new Map<string, string>([
  ["install.sh", installer],
  ["install-app.sh", appInstaller],
  ["manifest.json", `${JSON.stringify(manifest, null, 2)}\n`]
]);
try {
  assets.set("catalog.json", await readFile(path.join(distDir, "catalog.json"), "utf8"));
} catch {
  // The public catalog is optional; `npm run catalog:build` adds it before a release.
}
if (manifest.signature && manifest.keyId && releaseKey) {
  assets.set("release-public-key.json", `${JSON.stringify({
    algorithm: "Ed25519",
    keyId: manifest.keyId,
    publicKeyBase64: releaseKey.publicKeyBase64
  }, null, 2)}\n`);
} else {
  await rm(path.join(distDir, "release-public-key.json"), { force: true });
}
for (const [name, contents] of assets) {
  await writeFile(path.join(distDir, name), contents, "utf8");
}
const checksums = [...assets]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([name, contents]) => `${createHash("sha256").update(contents).digest("hex")}  ${name}`)
  .join("\n");
await writeFile(path.join(distDir, "SHA256SUMS"), `${checksums}\n`, "utf8");

console.log(`dist/install.sh       ${installer.length} bytes`);
console.log(`dist/install-app.sh   ${appInstaller.length} bytes`);
console.log(
  `dist/manifest.json version ${manifest.version} ` +
  (manifest.signature ? `signed (keyId ${manifest.keyId})` : "UNSIGNED (no VIBE_RELEASE_SIGNING_KEY_FILE)")
);
console.log(`dist/SHA256SUMS       ${assets.size} release asset digests`);

async function loadReleaseKey(filePath: string): Promise<{ keyId: string; publicKeyBase64: string }> {
  const value = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
  if (typeof value.keyId !== "string" || !value.keyId ||
      typeof value.publicKeyBase64 !== "string" || Buffer.from(value.publicKeyBase64, "base64").length !== 32) {
    throw new Error("Release signing key file has an invalid keyId or Ed25519 public key.");
  }
  return { keyId: value.keyId, publicKeyBase64: value.publicKeyBase64 };
}
