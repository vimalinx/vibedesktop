import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { AuthRequiredError, requireCurrentUser } from "@/lib/auth";
import { discoverLocalWebApps, LocalAppDiscoveryError } from "@/lib/local-app-discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireCurrentUser();
    const candidates = await discoverLocalWebApps(process.cwd());
    return NextResponse.json({ candidates });
  } catch (error) {
    if (error instanceof AuthRequiredError) return apiError(401, "auth_required", error.message);
    if (error instanceof LocalAppDiscoveryError) return apiError(503, "discovery_failed", error.message);
    throw error;
  }
}
