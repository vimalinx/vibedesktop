import { NextResponse } from "next/server";
import { apiError, rejectCrossOriginMutation } from "@/lib/api-response";
import { AuthRequiredError, requireCurrentUser } from "@/lib/auth";
import { controlLocalApp, DaemonApiError, DaemonUnreachableError } from "@/lib/daemon-client";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const csrf = rejectCrossOriginMutation(request);
  if (csrf) return csrf;
  try {
    await requireCurrentUser();
    const { id } = await context.params;
    const body = (await request.json()) as { action?: "start" | "stop" | "restart" };

    if (!body.action || !["start", "stop", "restart"].includes(body.action)) {
      return apiError(400, "invalid_request", "action must be start | stop | restart");
    }

    const app = await controlLocalApp(id, body.action);
    return NextResponse.json({ app });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return apiError(401, "auth_required", error.message);
    }
    if (error instanceof DaemonUnreachableError) {
      return apiError(503, "daemon_unreachable", error.message);
    }
    if (error instanceof DaemonApiError) {
      const status = error.code === "not_found" ? 404 : error.code === "invalid_request" ? 400 : 502;
      return apiError(status, error.code, error.message);
    }
    throw error;
  }
}
