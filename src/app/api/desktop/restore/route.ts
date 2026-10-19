import { NextResponse } from "next/server";
import { apiError, rejectCrossOriginMutation } from "@/lib/api-response";
import { requireCurrentUser } from "@/lib/auth";
import { restoreDesktop } from "@/lib/store";
import { validateSnapshot } from "@/lib/desktop-backup-contract";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = rejectCrossOriginMutation(request);
  if (denied) return denied;
  let snapshot;
  try {
    const raw = await request.text();
    if (raw.length > 8 * 1024 * 1024) return apiError(413, "backup_too_large", "Desktop configuration exceeds 8 MB.");
    snapshot = validateSnapshot(JSON.parse(raw));
  } catch (error) {
    return apiError(400, "invalid_backup", error instanceof Error ? error.message : "Invalid backup.");
  }
  const user = await requireCurrentUser();
  return NextResponse.json(await restoreDesktop(user, snapshot));
}
