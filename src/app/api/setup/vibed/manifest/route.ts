import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { loadVibedInstallerFiles } from "@/lib/vibed-installer";
import { buildReleaseManifest, signManifestFromKeyFile, VIBE_RELEASE_VERSION } from "@/lib/vibed-release-manifest";

export const runtime = "nodejs";

/**
 * Public, non-secret JSON manifest for `vibed update` / `vibed rollback`.
 * Serves the exact same runtime + skill files as `GET /api/setup/vibed`, just
 * structured for programmatic fetch-and-verify instead of shell execution.
 *
 * When `VIBE_RELEASE_SIGNING_KEY_FILE` points at a signing key file outside
 * the repository (see `scripts/generate-release-signing-key.mjs`), the
 * response also carries a detached Ed25519 `signature` + `keyId`. Machines
 * running `vibed update` with `VIBE_RELEASE_PUBLIC_KEY` configured reject an
 * unsigned or mismatched manifest before staging anything (see
 * `daemon/release/lifecycle-update.mjs`).
 */
export async function GET() {
  try {
    const files = await loadVibedInstallerFiles(process.cwd());
    const manifest = buildReleaseManifest(files, VIBE_RELEASE_VERSION);
    const signedManifest = await signManifestFromKeyFile(manifest, process.env.VIBE_RELEASE_SIGNING_KEY_FILE);
    return NextResponse.json(signedManifest, {
      headers: {
        "cache-control": "public, max-age=300, stale-while-revalidate=3600"
      }
    });
  } catch {
    return apiError(503, "vibed_installer_unavailable", "The vibed update manifest is unavailable.");
  }
}
