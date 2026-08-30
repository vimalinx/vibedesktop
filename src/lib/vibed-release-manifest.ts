import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadVibedInstallerFiles, type VibedInstallerFile, type VibedInstallerFiles } from "@/lib/vibed-installer";
import packageJson from "../../package.json";

/** Single owner of the Vibe release version string on the Next.js side. Mirrors `daemon/version.mjs`'s `DAEMON_RELEASE_VERSION`, which is the equivalent single owner for the shipped daemon runtime. */
export const VIBE_RELEASE_VERSION = packageJson.version;

export interface VibedManifestFile {
  path: string;
  sha256: string;
  size: number;
  contents: string;
}

export interface VibedReleaseManifest {
  version: string;
  releaseVersion: string;
  generatedAt: string;
  runtime: VibedManifestFile[];
  skill: VibedManifestFile[];
  /** Detached Ed25519 signature (base64) over `canonicalManifestBytes`, when a release signing pipeline exists. */
  signature: string | null;
  /** Identifier for the public key that should verify `signature`, when present. */
  keyId: string | null;
}

export function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Computes a deterministic, content-addressed version id:
 * `<releaseVersion>+<first 12 hex chars of sha256 over sorted "path:sha256" lines>`.
 * Identical runtime bytes always produce the same id; any byte change produces a new one.
 */
export function computeVersionId(releaseVersion: string, fileDigests: Array<{ path: string; sha256: string }>): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,40}$/.test(releaseVersion)) {
    throw new Error("Unsafe release version.");
  }
  const sorted = [...fileDigests].sort((left, right) => left.path.localeCompare(right.path));
  const combined = sorted.map((file) => `${file.path}:${file.sha256}`).join("\n");
  const contentHash = sha256Hex(Buffer.from(combined, "utf8")).slice(0, 12);
  return `${releaseVersion}+${contentHash}`;
}

function digestFiles(files: VibedInstallerFile[]): VibedManifestFile[] {
  return files.map((file) => ({
    path: file.path,
    sha256: sha256Hex(file.contents),
    size: file.contents.length,
    contents: file.contents.toString("base64")
  }));
}

export function buildReleaseManifest(files: VibedInstallerFiles, releaseVersion: string): VibedReleaseManifest {
  const runtime = digestFiles(files.runtime);
  const skill = digestFiles(files.skill);
  const version = computeVersionId(releaseVersion, runtime);
  return {
    version,
    releaseVersion,
    generatedAt: new Date().toISOString(),
    runtime,
    skill,
    signature: null,
    keyId: null
  };
}

/** Canonical bytes signed/verified for a manifest — digests only, never file contents, so verification is cheap and stable regardless of payload size. */
export function canonicalManifestDigestBytes(manifest: Pick<VibedReleaseManifest, "version" | "releaseVersion" | "generatedAt" | "runtime" | "skill">): Buffer {
  const digestOnly = (files: VibedManifestFile[]) => files.map(({ path, sha256, size }) => ({ path, sha256, size }));
  return Buffer.from(JSON.stringify({
    version: manifest.version,
    releaseVersion: manifest.releaseVersion,
    generatedAt: manifest.generatedAt,
    runtime: digestOnly(manifest.runtime),
    skill: digestOnly(manifest.skill)
  }), "utf8");
}

export type DeviceRuntimeCompatibility = "unknown" | "compatible" | "update_available" | "update_required";

/**
 * Compares a device-reported heartbeat `runtimeVersion` (a content-addressed
 * `<releaseVersion>+<hash>` id, see `daemon/version.mjs`) against the
 * currently hosted release. `update_required` means the device's release
 * line itself differs (a real version bump); `update_available` means only
 * the content hash differs on the same release line (e.g. a hotfix cutover
 * of the same version). No heartbeat yet reported is `unknown`, never a
 * false "compatible".
 */
export function classifyDeviceRuntimeCompatibility(
  deviceRuntimeVersion: string | null,
  current: { version: string; releaseVersion: string }
): DeviceRuntimeCompatibility {
  if (!deviceRuntimeVersion) return "unknown";
  if (deviceRuntimeVersion === current.version) return "compatible";
  const deviceReleaseVersion = deviceRuntimeVersion.split("+")[0];
  return deviceReleaseVersion === current.releaseVersion ? "update_available" : "update_required";
}

let cachedCurrentReleaseInfo: { version: string; releaseVersion: string } | null = null;

/**
 * The installed runtime/skill files driving `version`/`releaseVersion` do not
 * change while this server process is running, so this memoizes the (mildly
 * expensive: hashes every runtime file) computation for the process
 * lifetime instead of redoing it on every device-list poll.
 */
export async function currentReleaseInfo(projectRoot: string): Promise<{ version: string; releaseVersion: string } | null> {
  if (cachedCurrentReleaseInfo) return cachedCurrentReleaseInfo;
  try {
    const files = await loadVibedInstallerFiles(projectRoot);
    const manifest = buildReleaseManifest(files, VIBE_RELEASE_VERSION);
    cachedCurrentReleaseInfo = { version: manifest.version, releaseVersion: manifest.releaseVersion };
    return cachedCurrentReleaseInfo;
  } catch {
    return null;
  }
}

/** Test-only seam: resets the process-lifetime memoization between test cases. */
export function __resetCurrentReleaseInfoForTests(): void {
  cachedCurrentReleaseInfo = null;
}

/**
 * Verifies a detached Ed25519 signature over a manifest's canonical digest bytes.
 * `publicKeyBase64` is a raw 32-byte Ed25519 public key, base64-encoded.
 * Returns false (never throws) on any malformed input — callers decide whether
 * a failed/missing signature should block an update.
 */
export function verifyManifestSignature(manifest: Parameters<typeof canonicalManifestDigestBytes>[0], signatureBase64: string, publicKeyBase64: string): boolean {
  try {
    const publicKeyDer = Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      Buffer.from(publicKeyBase64, "base64")
    ]);
    const publicKey = createPublicKey({ key: publicKeyDer, format: "der", type: "spki" });
    return verify(null, canonicalManifestDigestBytes(manifest), publicKey, Buffer.from(signatureBase64, "base64"));
  } catch {
    return false;
  }
}

/**
 * Signs a manifest's canonical digest bytes with a raw 32-byte Ed25519
 * private key (base64). The private key never leaves this process: callers
 * load it from a file outside the repository (see
 * `scripts/generate-release-signing-key.mjs` and `signManifestFromKeyFile`).
 */
export function signManifestDigest(manifest: Parameters<typeof canonicalManifestDigestBytes>[0], privateKeyBase64: string): string {
  const privateKeyDer = Buffer.concat([
    Buffer.from("302e020100300506032b657004220420", "hex"),
    Buffer.from(privateKeyBase64, "base64")
  ]);
  const privateKey = createPrivateKey({ key: privateKeyDer, format: "der", type: "pkcs8" });
  return sign(null, canonicalManifestDigestBytes(manifest), privateKey).toString("base64");
}

interface ReleaseSigningKeyFile {
  keyId: string;
  publicKeyBase64: string;
  privateKeyBase64: string;
}

function parseReleaseSigningKeyFile(raw: string): ReleaseSigningKeyFile {
  const parsed = JSON.parse(raw) as Partial<ReleaseSigningKeyFile>;
  if (
    typeof parsed.keyId !== "string" || !parsed.keyId ||
    typeof parsed.publicKeyBase64 !== "string" || !parsed.publicKeyBase64 ||
    typeof parsed.privateKeyBase64 !== "string" || !parsed.privateKeyBase64
  ) {
    throw new Error("Release signing key file is missing keyId/publicKeyBase64/privateKeyBase64.");
  }
  return parsed as ReleaseSigningKeyFile;
}

/**
 * Attaches a detached signature + keyId to `manifest` using the signing key
 * file at `keyFilePath` (JSON: `{ keyId, publicKeyBase64, privateKeyBase64 }`,
 * written by `scripts/generate-release-signing-key.mjs` and never committed
 * to the repository). Returns `manifest` unchanged — never throws — when
 * `keyFilePath` is not configured or unreadable: an unsigned manifest is the
 * documented interim state (see `daemon/release/lifecycle-update.mjs`), and a
 * transient signing misconfiguration must not take down the public installer
 * or update endpoint.
 */
export async function signManifestFromKeyFile(manifest: VibedReleaseManifest, keyFilePath: string | undefined | null): Promise<VibedReleaseManifest> {
  if (!keyFilePath) return manifest;
  try {
    const key = parseReleaseSigningKeyFile(await readFile(keyFilePath, "utf8"));
    const signature = signManifestDigest(manifest, key.privateKeyBase64);
    return { ...manifest, signature, keyId: key.keyId };
  } catch {
    return manifest;
  }
}
