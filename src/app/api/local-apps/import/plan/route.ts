import { NextResponse } from "next/server";
import { apiError, rejectCrossOriginMutation, invalidJsonBody, readJsonObject } from "@/lib/api-response";
import { AuthRequiredError, requireCurrentUser } from "@/lib/auth";
import { LocalAppImportError, localAppImportErrorStatus, planLocalAppImport } from "@/lib/local-app-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const csrf = rejectCrossOriginMutation(request);
  if (csrf) return csrf;
  try {
    await requireCurrentUser();
    const body = (await readJsonObject(request)) as null | { path?: unknown; name?: unknown };
    if (!body) return invalidJsonBody();
    if (typeof body.path !== "string") return apiError(400, "invalid_request", "path is required");
    const plan = await planLocalAppImport({
      path: body.path,
      ...(typeof body.name === "string" ? { name: body.name } : {})
    });
    return NextResponse.json({ plan });
  } catch (error) {
    if (error instanceof AuthRequiredError) return apiError(401, "auth_required", error.message);
    if (error instanceof LocalAppImportError) return apiError(localAppImportErrorStatus(error.code), error.code, error.message);
    throw error;
  }
}
