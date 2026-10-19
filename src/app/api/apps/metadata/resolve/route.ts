import { NextResponse } from "next/server";
import { apiError, rejectCrossOriginMutation, RequestValidationError, requireString, invalidJsonBody, readJsonObject } from "@/lib/api-response";
import { AuthRequiredError, requireCurrentUser } from "@/lib/auth";
import { resolveUrlMetadata } from "@/lib/metadata-resolver";
import { UnsafeUrlError } from "@/lib/url-safety";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const csrf = rejectCrossOriginMutation(request);
  if (csrf) return csrf;
  try {
    await requireCurrentUser();
    const body = (await readJsonObject(request)) as null | { url?: string };
    if (!body) return invalidJsonBody();
    const result = await resolveUrlMetadata(requireString(body.url, "url"));

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return apiError(401, "auth_required", error.message);
    }

    if (error instanceof RequestValidationError || error instanceof UnsafeUrlError) {
      return apiError(400, "invalid_url", error.message);
    }

    throw error;
  }
}
