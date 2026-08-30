import type { Desktop, DesktopApp, DesktopPayload, VibeUser } from "@/lib/contracts";
import * as store from "@/lib/store";

export { StoreNotFoundError } from "@/lib/persistence-errors";

export interface UserIdentity {
  identityIssuer: string;
  identitySubject: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  avatarUrl: string | null;
}

/**
 * Persistence facade over the local JSON file store (`store.ts`). Keeps the
 * function names routes already use so callers needed no changes when the
 * Postgres adapter was removed.
 */
export async function getOrCreateUser(identity: UserIdentity): Promise<VibeUser> {
  return store.getOrCreateUser(identity);
}

export async function getDesktopPayload(user: VibeUser): Promise<DesktopPayload> {
  return store.getDesktopPayload(user);
}

export async function updateDesktop(
  user: VibeUser,
  updates: Partial<Pick<Desktop, "wallpaperKind" | "wallpaperBuiltinId" | "startAppId" | "themeId" | "shellStyle" | "accentOverride" | "fontOverride">>
): Promise<DesktopPayload> {
  return store.updateDesktop(user, updates);
}

export async function createDesktopApp(
  user: VibeUser,
  input: Pick<DesktopApp, "kind" | "source" | "title" | "url" | "description" | "openingMode" | "iconKind" | "iconUrl"> &
    { setAsStart?: boolean } & Partial<Pick<DesktopApp, "gridX" | "gridY">>
): Promise<DesktopPayload> {
  return store.createDesktopApp(user, input);
}

export async function addDirectoryApp(
  user: VibeUser,
  directoryApp: { title: string; url: string; description: string; openingMode: DesktopApp["openingMode"]; iconUrl: string }
): Promise<DesktopPayload> {
  return store.addDirectoryApp(user, directoryApp);
}

export async function updateDesktopApp(
  user: VibeUser,
  appId: string,
  updates: Partial<Pick<DesktopApp, "title" | "url" | "description" | "openingMode" | "iconKind" | "iconUrl" | "gridX" | "gridY" | "spanColumns" | "spanRows" | "tileVariant">>
): Promise<DesktopPayload> {
  return store.updateDesktopApp(user, appId, updates);
}

export async function deleteDesktopApp(user: VibeUser, appId: string): Promise<DesktopPayload> {
  return store.deleteDesktopApp(user, appId);
}
