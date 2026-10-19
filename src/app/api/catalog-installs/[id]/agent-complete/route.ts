import { NextResponse } from "next/server";
import { apiError, rejectCrossOriginMutation } from "@/lib/api-response";
import { AuthRequiredError, requireCurrentUser } from "@/lib/auth";
import { completeCatalogAgentInstall } from "@/lib/catalog-workspace-installer";

export const runtime = "nodejs";

interface RouteContext { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  const csrf = rejectCrossOriginMutation(request);
  if (csrf) return csrf;
  try {
    await requireCurrentUser();
    const { id } = await context.params;
    return NextResponse.json({ install: await completeCatalogAgentInstall(id) });
  } catch (error) {
    if (error instanceof AuthRequiredError) return apiError(401, "auth_required", error.message);
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "agent_completion_failed";
    return apiError(code === "install_not_available" ? 404 : 409, code, error instanceof Error ? error.message : "Agent installation could not be verified.");
  }
}
