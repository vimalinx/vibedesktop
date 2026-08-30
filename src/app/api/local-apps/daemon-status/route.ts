import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { AuthRequiredError, requireCurrentUser } from "@/lib/auth";
import { getDaemonHealth } from "@/lib/daemon-client";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireCurrentUser();
    const health = await getDaemonHealth();
    return NextResponse.json(health);
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return apiError(401, "auth_required", error.message);
    }
    // If the daemon is unreachable, getDaemonHealth already returns { ok: false }
    // rather than throwing — so this is a true catch-all.
    return NextResponse.json({ ok: false });
  }
}
