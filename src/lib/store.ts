import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Desktop, DesktopApp, DesktopPayload, VibeUser } from "@/lib/contracts";
import * as core from "@/lib/desktop-core";
import type { StoreShape } from "@/lib/desktop-core";

export { StoreNotFoundError } from "@/lib/persistence-errors";

/**
 * Node adapter over `desktop-core`: read the JSON file, apply a rule from the
 * core, write the file back. The desktop rules themselves live in the core so
 * the browser-only trial can reuse them verbatim — see `desktop-core.ts`.
 */

interface UserIdentity {
  identityIssuer: string;
  identitySubject: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  avatarUrl: string | null;
}

const dataFile = process.env.VIBE_DATA_FILE ?? ".data/vibedesktop-dev.json";
const absoluteDataFile = path.resolve(process.cwd(), dataFile);

export async function getOrCreateUser(identity: UserIdentity): Promise<VibeUser> {
  const store = await readStore();
  const user = core.getOrCreateUser(store, identity);
  await writeStore(store);

  return user;
}

export async function getDesktopPayload(user: VibeUser): Promise<DesktopPayload> {
  const store = await readStore();
  const payload = core.getDesktopPayload(store, user);
  await writeStore(store);

  return payload;
}

export async function updateDesktop(
  user: VibeUser,
  updates: Partial<Pick<Desktop, "wallpaperKind" | "wallpaperBuiltinId" | "startAppId" | "themeId" | "shellStyle" | "accentOverride" | "fontOverride">>
): Promise<DesktopPayload> {
  const store = await readStore();
  const payload = core.updateDesktop(store, user, updates);
  await writeStore(store);

  return payload;
}

export async function createDesktopApp(
  user: VibeUser,
  input: Pick<
    DesktopApp,
    "kind" | "source" | "title" | "url" | "description" | "openingMode" | "iconKind" | "iconUrl"
  > & { setAsStart?: boolean }
    & Partial<Pick<DesktopApp, "gridX" | "gridY">>
): Promise<DesktopPayload> {
  const store = await readStore();
  const payload = core.createDesktopApp(store, user, input);
  await writeStore(store);

  return payload;
}

export async function addDirectoryApp(user: VibeUser, directoryApp: {
  title: string;
  url: string;
  description: string;
  openingMode: DesktopApp["openingMode"];
  iconUrl: string;
}): Promise<DesktopPayload> {
  const store = await readStore();
  const payload = core.addDirectoryApp(store, user, directoryApp);
  await writeStore(store);

  return payload;
}

export async function updateDesktopApp(
  user: VibeUser,
  appId: string,
  updates: Partial<Pick<DesktopApp, "title" | "url" | "description" | "openingMode" | "iconKind" | "iconUrl" | "gridX" | "gridY" | "spanColumns" | "spanRows" | "tileVariant">>
): Promise<DesktopPayload> {
  const store = await readStore();
  const payload = core.updateDesktopApp(store, user, appId, updates);
  await writeStore(store);

  return payload;
}

export async function deleteDesktopApp(user: VibeUser, appId: string): Promise<DesktopPayload> {
  const store = await readStore();
  const payload = core.deleteDesktopApp(store, user, appId);
  await writeStore(store);

  return payload;
}

async function readStore(): Promise<StoreShape> {
  try {
    const raw = await readFile(absoluteDataFile, "utf8");
    return core.normalizeStore(JSON.parse(raw));
  } catch (error) {
    if (isMissingFile(error)) {
      return core.createEmptyStore();
    }

    throw error;
  }
}

async function writeStore(store: StoreShape): Promise<void> {
  await mkdir(path.dirname(absoluteDataFile), { recursive: true });
  const tempFile = `${absoluteDataFile}.${process.pid}.${crypto.randomUUID()}.tmp`;

  await writeFile(tempFile, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await rename(tempFile, absoluteDataFile);
}

function isMissingFile(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
