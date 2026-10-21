import { NextResponse } from "next/server";
import { invalidJsonBody, readJsonObject, rejectCrossOriginMutation } from "@/lib/api-response";
import { requireCurrentUser } from "@/lib/auth";
import { marketRouteError } from "@/lib/market-install-route";
import { previewMarketInstall } from "@/lib/market-installer";

export const runtime = "nodejs";

/** Read-only: fetches the pinned commit's manifest and icon. Nothing from the repository runs. */
export async function POST(request: Request) {
  const csrf = rejectCrossOriginMutation(request);
  if (csrf) return csrf;
  try {
    await requireCurrentUser();
    const body = await readJsonObject(request);
    if (!body) return invalidJsonBody();
    return NextResponse.json({ preview: await previewMarketInstall({ repository: body.repository, ref: body.ref }) });
  } catch (error) {
    return marketRouteError(error, "preview_failed");
  }
}
