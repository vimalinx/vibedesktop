import { NextResponse } from "next/server";
import { apiError, rejectCrossOriginMutation } from "@/lib/api-response";
import { AuthRequiredError, requireCurrentUser } from "@/lib/auth";
import { DaemonApiError, DaemonUnreachableError, listLocalApps, createLocalApp } from "@/lib/daemon-client";
import type { IconKind, LocalAppControlAction } from "@/lib/contracts";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireCurrentUser();
    const apps = await listLocalApps();
    return NextResponse.json({ apps });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  const csrf = rejectCrossOriginMutation(request);
  if (csrf) return csrf;
  try {
    await requireCurrentUser();
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

    if (!body.name?.trim()) {
      return apiError(400, "invalid_request", "name is required");
    }
    if (!body.command?.trim()) {
      return apiError(400, "invalid_request", "command is required");
    }
    if (!Number.isFinite(body.port) || body.port! < 1 || body.port! > 65535) {
      return apiError(400, "invalid_request", "port must be 1..65535");
    }

    const app = await createLocalApp({
      name: body.name!.trim(),
      command: body.command!.trim(),
      args: body.args,
      cwd: body.cwd,
      port: body.port!,
      env: body.env,
      autoStart: body.autoStart === true,
      restart: body.restart,
      iconKind: body.iconKind,
      iconUrl: body.iconUrl ?? null
    });

    return NextResponse.json({ app }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

// Re-exported for type completeness — kept for downstream callers
export type { LocalAppControlAction };

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
