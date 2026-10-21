import { NextResponse } from "next/server";
import { invalidJsonBody, readJsonObject, rejectCrossOriginMutation } from "@/lib/api-response";
import { requireCurrentUser } from "@/lib/auth";
import { marketRouteError } from "@/lib/market-install-route";
import { listMarketInstalls, startMarketInstall } from "@/lib/market-installer";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireCurrentUser();
    return NextResponse.json({ installs: await listMarketInstalls() });
  } catch (error) {
    return marketRouteError(error, "market_list_failed");
  }
}

export async function POST(request: Request) {
  const csrf = rejectCrossOriginMutation(request);
  if (csrf) return csrf;
  try {
    await requireCurrentUser();
    const body = await readJsonObject(request);
    if (!body) return invalidJsonBody();
    return NextResponse.json({ install: await startMarketInstall({ repository: body.repository, ref: body.ref, digest: body.digest }) }, { status: 202 });
  } catch (error) {
    return marketRouteError(error, "install_failed");
  }
}
