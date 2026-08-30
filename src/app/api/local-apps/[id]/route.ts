import { NextResponse } from "next/server";
import { apiError, rejectCrossOriginMutation } from "@/lib/api-response";
import { AuthRequiredError, requireCurrentUser } from "@/lib/auth";
import { DaemonApiError, DaemonUnreachableError, deleteLocalApp, updateLocalApp } from "@/lib/daemon-client";
import type { IconKind } from "@/lib/contracts";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireCurrentUser();
    const { id } = await context.params;
    const { getLocalApp } = await import("@/lib/daemon-client");
    const app = await getLocalApp(id);
    return NextResponse.json({ app });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const csrf = rejectCrossOriginMutation(request);
  if (csrf) return csrf;
  try {
    await requireCurrentUser();
    const { id } = await context.params;
    const body = (await request.json()) as {
      name?: string;
      command?: string;
      args?: string[];
      cwd?: string;
      port?: number;
      env?: Record<string, string>;
      autoStart?: boolean;
      restart?: "no" | "on-crash" | "always";
      iconKind?: IconKind;
      iconUrl?: string | null;
    };

    const app = await updateLocalApp(id, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.command !== undefined ? { command: body.command } : {}),
      ...(body.args !== undefined ? { args: body.args } : {}),
      ...(body.cwd !== undefined ? { cwd: body.cwd } : {}),
      ...(body.port !== undefined ? { port: body.port } : {}),
      ...(body.env !== undefined ? { env: body.env } : {}),
      ...(body.autoStart !== undefined ? { autoStart: body.autoStart } : {}),
      ...(body.restart !== undefined ? { restart: body.restart } : {}),
      ...(body.iconKind !== undefined ? { iconKind: body.iconKind } : {}),
      ...(body.iconUrl !== undefined ? { iconUrl: body.iconUrl ?? null } : {})
    });

    return NextResponse.json({ app });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const csrf = rejectCrossOriginMutation(request);
  if (csrf) return csrf;
  try {
    await requireCurrentUser();
    const { id } = await context.params;
    await deleteLocalApp(id);
    return NextResponse.json({ deleted: id });
  } catch (error) {
    return handleError(error);
  }
}

function handleError(error: unknown) {
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
