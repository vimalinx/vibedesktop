import { NextResponse } from "next/server";
import { apiError, rejectCrossOriginMutation, RequestValidationError, requireString } from "@/lib/api-response";
import { AuthRequiredError, requireCurrentUser } from "@/lib/auth";
import { createDesktopApp } from "@/lib/persistence";
import type { IconKind, OpeningMode } from "@/lib/contracts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const csrf = rejectCrossOriginMutation(request);
  if (csrf) return csrf;
  try {
    const user = await requireCurrentUser();
    const body = (await request.json()) as {
      title?: string;
      url?: string;
      description?: string | null;
      openingMode?: OpeningMode;
      iconKind?: IconKind;
      iconUrl?: string | null;
      gridX?: number;
      gridY?: number;
      setAsStart?: boolean;
    };
    const url = requireHttpUrl(body.url, "url");
    const payload = await createDesktopApp(user, {
      kind: "url",
      source: "user",
      title: requireString(body.title, "title"),
      url,
      description: body.description ?? null,
      openingMode: body.openingMode ?? "desktop_window",
      iconKind: body.iconKind ?? "favicon",
      iconUrl: body.iconUrl ?? null,
      gridX: Number.isFinite(body.gridX) ? Number(body.gridX) : undefined,
      gridY: Number.isFinite(body.gridY) ? Number(body.gridY) : undefined,
      setAsStart: body.setAsStart === true
    });

    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return apiError(401, "auth_required", error.message);
    }

    if (error instanceof RequestValidationError) {
      return apiError(400, "invalid_request", error.message);
    }

    throw error;
  }
}

function requireHttpUrl(value: unknown, field: string): string {
  const raw = requireString(value, field);

  try {
    const url = new URL(raw);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new RequestValidationError(`${field} must use http or https`);
    }

    return url.toString();
  } catch (error) {
    if (error instanceof RequestValidationError) {
      throw error;
    }

    throw new RequestValidationError(`${field} must be a valid URL`);
  }
}
