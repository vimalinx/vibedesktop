import { NextResponse } from "next/server";
import { apiError, rejectCrossOriginMutation } from "@/lib/api-response";
import { AuthRequiredError, requireCurrentUser } from "@/lib/auth";
import { deleteDesktopApp, StoreNotFoundError, updateDesktopApp } from "@/lib/persistence";
import { TileValidationError } from "@/lib/tile-contract";
import type { IconKind, OpeningMode } from "@/lib/contracts";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  const csrf = rejectCrossOriginMutation(request);
  if (csrf) return csrf;
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const body = (await request.json()) as {
      title?: string;
      url?: string | null;
      description?: string | null;
      openingMode?: OpeningMode;
      iconKind?: IconKind;
      iconUrl?: string | null;
      gridX?: number;
      gridY?: number;
      spanColumns?: number;
      spanRows?: number;
      tileVariant?: string;
    };
    const payload = await updateDesktopApp(user, id, {
      title: body.title,
      url: body.url,
      description: body.description,
      openingMode: body.openingMode,
      iconKind: body.iconKind,
      iconUrl: body.iconUrl,
      gridX: body.gridX,
      gridY: body.gridY,
      spanColumns: body.spanColumns,
      spanRows: body.spanRows,
      tileVariant: body.tileVariant
    });

    return NextResponse.json(payload);
  } catch (error) {
    return handleAppRouteError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const csrf = rejectCrossOriginMutation(request);
  if (csrf) return csrf;
  try {
    const user = await requireCurrentUser();
    const { id } = await context.params;
    const payload = await deleteDesktopApp(user, id);

    return NextResponse.json(payload);
  } catch (error) {
    return handleAppRouteError(error);
  }
}

function handleAppRouteError(error: unknown) {
  if (error instanceof AuthRequiredError) {
    return apiError(401, "auth_required", error.message);
  }

  if (error instanceof StoreNotFoundError) {
    return apiError(404, "app_not_found", error.message);
  }

  if (error instanceof TileValidationError) {
    return apiError(400, error.code, error.message);
  }

  throw error;
}
