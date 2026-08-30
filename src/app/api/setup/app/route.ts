import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { buildAppInstaller } from "@/lib/app-installer";

export const runtime = "nodejs";

/** Public, non-secret Linux installer for the whole Vibe Desktop program. */
export async function GET() {
  try {
    const installer = buildAppInstaller();
    return new NextResponse(installer, {
      headers: {
        "cache-control": "public, max-age=300, stale-while-revalidate=3600",
        "content-disposition": 'inline; filename="install-vibedesktop.sh"',
        "content-type": "text/x-shellscript; charset=utf-8",
        "x-content-type-options": "nosniff"
      }
    });
  } catch {
    return apiError(503, "app_installer_unavailable", "The Vibe Desktop installer is unavailable.");
  }
}
