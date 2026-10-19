import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { AuthRequiredError, requireCurrentUser } from "@/lib/auth";
import { listCatalogWorkspaceInstalls } from "@/lib/catalog-workspace-installer";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireCurrentUser();
    return NextResponse.json({ installs: await listCatalogWorkspaceInstalls() });
  } catch (error) {
    if (error instanceof AuthRequiredError) return apiError(401, "auth_required", error.message);
    throw error;
  }
}
