import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { AuthRequiredError, requireCurrentUser } from "@/lib/auth";
import { buildCatalogAgentInstallInstruction } from "@/lib/catalog-workspace-installer";

export const runtime = "nodejs";

interface RouteContext { params: Promise<{ id: string }> }

export async function GET(request: Request, context: RouteContext) {
  try {
    await requireCurrentUser();
    const { id } = await context.params;
    return NextResponse.json({
      instruction: await buildCatalogAgentInstallInstruction(id, new URL(request.url).origin)
    });
  } catch (error) {
    if (error instanceof AuthRequiredError) return apiError(401, "auth_required", error.message);
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "instruction_failed";
    return apiError(code === "install_not_available" ? 404 : 500, code, error instanceof Error ? error.message : "Could not create an Agent instruction.");
  }
}
