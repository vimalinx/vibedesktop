import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { AuthRequiredError, requireCurrentUser } from "@/lib/auth";
import { DaemonApiError, DaemonUnreachableError, getLocalApp } from "@/lib/daemon-client";
import { checkLocalAppEmbeddability } from "@/lib/metadata-resolver";
import { UnsafeUrlError } from "@/lib/url-safety";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Reports whether a registered local app allows being framed, so the desktop
 * can show its controlled fallback instead of a blank window. The target is
 * resolved from the daemon registry by app id — never from a client-supplied
 * URL — so this adds no SSRF surface, and only a verdict is returned.
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    await requireCurrentUser();
    const { id } = await context.params;
    const app = await getLocalApp(id);
    const result = await checkLocalAppEmbeddability(app, request.headers.get("origin"));
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthRequiredError) return apiError(401, "auth_required", error.message);
    if (error instanceof UnsafeUrlError) return apiError(400, "not_loopback", error.message);
    if (error instanceof DaemonUnreachableError) return apiError(503, "daemon_unreachable", error.message);
    if (error instanceof DaemonApiError) {
      const status = error.code === "not_found" ? 404 : error.code === "invalid_request" ? 400 : 502;
      return apiError(status, error.code, error.message);
    }
    throw error;
  }
}
