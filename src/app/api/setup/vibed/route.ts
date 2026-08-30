import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { buildVibedInstaller, loadVibedInstallerFiles } from "@/lib/vibed-installer";

export const runtime = "nodejs";

/** Public, non-secret Linux installer for the local vibed runtime. */
export async function GET() {
  try {
    const installer = buildVibedInstaller(await loadVibedInstallerFiles(process.cwd()));
    return new NextResponse(installer, {
      headers: {
        "cache-control": "public, max-age=300, stale-while-revalidate=3600",
        "content-disposition": 'inline; filename="install-vibedesktop-vibed.sh"',
        "content-type": "text/x-shellscript; charset=utf-8",
        "x-content-type-options": "nosniff"
      }
    });
  } catch {
    return apiError(503, "vibed_installer_unavailable", "The vibed installer is unavailable.");
  }
}
