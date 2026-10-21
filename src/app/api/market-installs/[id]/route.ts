import { NextResponse } from "next/server";
import { rejectCrossOriginMutation } from "@/lib/api-response";
import { requireCurrentUser } from "@/lib/auth";
import { marketRouteError } from "@/lib/market-install-route";
import { uninstallMarketInstall } from "@/lib/market-installer";

export const runtime = "nodejs";

interface RouteContext { params: Promise<{ id: string }> }

export async function DELETE(request: Request, context: RouteContext) {
  const csrf = rejectCrossOriginMutation(request);
  if (csrf) return csrf;
  try {
    await requireCurrentUser();
    const { id } = await context.params;
    const body = await request.json().catch(() => ({})) as { purgeData?: unknown };
    return NextResponse.json({ install: await uninstallMarketInstall(id, body.purgeData === true) });
  } catch (error) {
    return marketRouteError(error, "uninstall_failed");
  }
}
