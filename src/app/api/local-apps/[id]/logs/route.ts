import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { AuthRequiredError, requireCurrentUser } from "@/lib/auth";
import { DaemonApiError, DaemonUnreachableError, getLocalAppLogs } from "@/lib/daemon-client";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireCurrentUser();
    const { id } = await context.params;
    const logs = await getLocalAppLogs(id);
    return NextResponse.json({ logs });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return apiError(401, "auth_required", error.message);
    }
    if (error instanceof DaemonUnreachableError) {
      return apiError(503, "daemon_unreachable", error.message);
    }
    if (error instanceof DaemonApiError) {
      const status = error.code === "not_found" ? 404 : 502;
      return apiError(status, error.code, error.message);
    }
    throw error;
  }
}
