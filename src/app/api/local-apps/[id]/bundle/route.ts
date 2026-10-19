import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { AuthRequiredError, requireCurrentUser } from "@/lib/auth";
import { DaemonApiError, DaemonTimeoutError, DaemonUnreachableError, getLocalApp } from "@/lib/daemon-client";
import { readLocalAppBundle } from "@/lib/local-app-import";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireCurrentUser();
    const { id } = await context.params;
    const app = await getLocalApp(id);
    const bundle = await readLocalAppBundle(app.command);
    return NextResponse.json({ bundle });
  } catch (error) {
    if (error instanceof AuthRequiredError) return apiError(401, "auth_required", error.message);
    if (error instanceof DaemonTimeoutError) return apiError(504, "daemon_timeout", error.message);
    if (error instanceof DaemonUnreachableError) return apiError(503, "daemon_unreachable", error.message);
    if (error instanceof DaemonApiError) {
      const status = error.code === "not_found" ? 404 : 502;
      return apiError(status, error.code, error.message);
    }
    throw error;
  }
}
