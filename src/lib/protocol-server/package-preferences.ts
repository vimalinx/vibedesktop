import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { withStore } from "@/lib/store";
import { getDesktopPayload } from "@/lib/desktop-core";
import { validPackageId, validatePreferencesReplacement } from "@/protocol/v1/package";
import { protocolManifest } from "@/protocol/v1/manifest";
import { apiError, rejectCrossOriginMutation } from "@/lib/api-response";

interface Context { params: Promise<{ id: string }> }
export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  if (!validPackageId(id)) return apiError(400, "invalid_package_id", "Use a namespaced package ID.");
  const user = await requireCurrentUser();
  return NextResponse.json(await withStore(store => {
    const { desktop } = getDesktopPayload(store, user);
    return desktop.packagePreferences?.[id] ?? { revision: null, schemaVersion: 1, values: {} };
  }));
}
export async function PUT(request: Request, context: Context) {
  const denied = rejectCrossOriginMutation(request);
  if (denied) return denied;
  const { id } = await context.params;
  if (!validPackageId(id)) return apiError(400, "invalid_package_id", "Use a namespaced package ID.");
  let input;
  try { input = validatePreferencesReplacement(await request.json()); }
  catch (error) { return apiError(400, "invalid_preferences", error instanceof Error ? error.message : "Invalid preferences."); }
  const user = await requireCurrentUser();
  return withStore(store => {
    const { desktop } = getDesktopPayload(store, user);
    const collection = desktop.packagePreferences ?? {};
    const previous = collection[id];
    if ((previous?.revision ?? null) !== input.ifRevision) {
      return apiError(409, "revision_conflict", "Preferences changed. Read the current revision before saving again.");
    }
    if (!previous && Object.keys(collection).length >= protocolManifest.limits.packagesPerDesktop) return apiError(409, "package_limit", "The desktop already holds preferences for 32 packages.");
    const next = { schemaVersion: input.schemaVersion, values: input.values, revision: crypto.randomUUID() };
    desktop.packagePreferences = { ...collection, [id]: next };
    desktop.updatedAt = new Date().toISOString();
    return NextResponse.json(next);
  });
}
