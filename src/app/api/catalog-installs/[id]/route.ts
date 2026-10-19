import { NextResponse } from "next/server";
import { apiError, rejectCrossOriginMutation } from "@/lib/api-response";
import { AuthRequiredError, requireCurrentUser } from "@/lib/auth";
import { startCatalogWorkspaceInstall, uninstallCatalogWorkspaceInstall } from "@/lib/catalog-workspace-installer";

export const runtime = "nodejs";

interface RouteContext { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  const csrf = rejectCrossOriginMutation(request);
  if (csrf) return csrf;
  try {
    await requireCurrentUser();
    const { id } = await context.params;
    return NextResponse.json({ install: await startCatalogWorkspaceInstall(id) }, { status: 202 });
  } catch (error) {
    if (error instanceof AuthRequiredError) return apiError(401, "auth_required", error.message);
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "install_failed";
    return apiError(code === "install_not_available" ? 404 : 500, code, error instanceof Error ? error.message : "Installation failed.");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const csrf = rejectCrossOriginMutation(request);
  if (csrf) return csrf;
  try {
    await requireCurrentUser();
    const { id } = await context.params;
    const body = await request.json().catch(() => ({})) as { purgeData?: unknown };
    return NextResponse.json({ install: await uninstallCatalogWorkspaceInstall(id, body.purgeData === true) });
  } catch (error) {
    if (error instanceof AuthRequiredError) return apiError(401, "auth_required", error.message);
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "uninstall_failed";
    return apiError(code === "install_not_available" ? 404 : 500, code, error instanceof Error ? error.message : "Uninstallation failed.");
  }
}
