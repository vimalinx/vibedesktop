import { NextResponse } from "next/server";
import { apiError, rejectCrossOriginMutation, invalidJsonBody, readJsonObject } from "@/lib/api-response";
import { AuthRequiredError, requireCurrentUser } from "@/lib/auth";
import { getDesktopPayload, updateDesktop } from "@/lib/persistence";
import { StyleOverrideError, validateStyleOverrides } from "@/lib/style-packs";
import type { ShellStyle, ThemeId, WallpaperFit, WallpaperKind } from "@/lib/contracts";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const payload = await getDesktopPayload(user);

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return apiError(401, "auth_required", error.message);
    }

    throw error;
  }
}

export async function PATCH(request: Request) {
  const csrf = rejectCrossOriginMutation(request);
  if (csrf) return csrf;
  try {
    const user = await requireCurrentUser();
    const body = (await readJsonObject(request)) as null | {
      wallpaperKind?: WallpaperKind;
      wallpaperBuiltinId?: string;
      wallpaperFit?: WallpaperFit;
      startAppId?: string | null;
      themeId?: ThemeId;
      shellStyle?: ShellStyle;
      accentOverride?: string | null;
      fontOverride?: string | null;
    };
    if (!body) return invalidJsonBody();
    validateStyleOverrides(body);
    const payload = await updateDesktop(user, {
      wallpaperKind: body.wallpaperKind,
      wallpaperBuiltinId: body.wallpaperBuiltinId,
      wallpaperFit: body.wallpaperFit,
      startAppId: body.startAppId,
      themeId: body.themeId,
      shellStyle: body.shellStyle,
      accentOverride: body.accentOverride,
      fontOverride: body.fontOverride
    });

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return apiError(401, "auth_required", error.message);
    }

    if (error instanceof StyleOverrideError) {
      return apiError(400, "invalid_style_override", error.message);
    }

    throw error;
  }
}
