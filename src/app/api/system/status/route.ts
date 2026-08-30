import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { AuthRequiredError, requireCurrentUser } from "@/lib/auth";
import { readSystemStatus } from "@/lib/system-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireCurrentUser();
    return NextResponse.json(readSystemStatus(), {
      headers: { "cache-control": "no-store" }
    });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return apiError(401, "auth_required", error.message);
    }
    return apiError(500, "system_status_failed", "System status is temporarily unavailable.");
  }
}
