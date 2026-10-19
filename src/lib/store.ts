import { copyFile, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import type { Desktop, DesktopApp, DesktopPayload, VibeUser } from "@/lib/contracts";
import * as core from "@/lib/desktop-core";
import type { StoreShape } from "@/lib/desktop-core";

export { StoreNotFoundError } from "@/lib/persistence-errors";

/**
 * Node adapter over `desktop-core`: read the JSON file, apply a rule from the
 * core, write the file back. The desktop rules themselves live in the core so
 * browser and API behavior reuse them verbatim — see `desktop-core.ts`.
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
  return withStore((store) => core.getOrCreateUser(store, identity));
}

export async function getDesktopPayload(user: VibeUser): Promise<DesktopPayload> {
  return withStore((store) => core.getDesktopPayload(store, user));
}

export async function updateDesktop(
  user: VibeUser,
  updates: Partial<Pick<Desktop, "wallpaperKind" | "wallpaperBuiltinId" | "wallpaperFit" | "startAppId" | "themeId" | "shellStyle" | "accentOverride" | "fontOverride">>
): Promise<DesktopPayload> {
  return withStore((store) => core.updateDesktop(store, user, updates));
}

export async function createDesktopApp(
  user: VibeUser,
  input: Pick<
    DesktopApp,
    "kind" | "source" | "title" | "url" | "description" | "openingMode" | "iconKind" | "iconUrl"
  > & { setAsStart?: boolean }
    & Partial<Pick<DesktopApp, "gridX" | "gridY">>
): Promise<DesktopPayload> {
  return withStore((store) => core.createDesktopApp(store, user, input));
}

export async function addDirectoryApp(user: VibeUser, directoryApp: {
  title: string;
  url: string;
  description: string;
  openingMode: DesktopApp["openingMode"];
  iconUrl: string;
}): Promise<DesktopPayload> {
  return withStore((store) => core.addDirectoryApp(store, user, directoryApp));
}

export async function updateDesktopApp(
  user: VibeUser,
  appId: string,
  updates: Partial<Pick<DesktopApp, "title" | "url" | "description" | "openingMode" | "iconKind" | "iconUrl" | "gridX" | "gridY" | "spanColumns" | "spanRows" | "tileVariant">>
): Promise<DesktopPayload> {
  return withStore((store) => core.updateDesktopApp(store, user, appId, updates));
}

export async function deleteDesktopApp(user: VibeUser, appId: string): Promise<DesktopPayload> {
  return withStore((store) => core.deleteDesktopApp(store, user, appId));
}

// Share the transaction queue across route bundles and development reloads.
const shared = globalThis as typeof globalThis & { __vibeStoreTails?: Map<string, Promise<unknown>> };
const tails = shared.__vibeStoreTails ??= new Map();

export function withStore<T>(operation: (store: StoreShape) => T): Promise<T> {
  const result = (tails.get(absoluteDataFile) ?? Promise.resolve()).then(async () => {
    const store = await readStore();
    const before = JSON.stringify(store);
    const value = operation(store);
    if (JSON.stringify(store) !== before) await writeStore(store);
    return value;
  });
  const settled = result.catch(() => undefined);
  tails.set(absoluteDataFile, settled);
  void settled.then(() => { if (tails.get(absoluteDataFile) === settled) tails.delete(absoluteDataFile); });
  return result;
}

const backupDataFile = `${absoluteDataFile}.bak`;

/**
 * A truncated or corrupt desktop file must not turn every request into a 500:
 * fall back to the last good copy and keep the unreadable file for inspection.
 */
async function readStore(): Promise<StoreShape> {
  const primary = await readStoreFile(absoluteDataFile);
  if (primary.ok) return primary.store;
  if (primary.missing) {
    const backup = await readStoreFile(backupDataFile);
    return backup.ok ? backup.store : core.createEmptyStore();
  }
  const backup = await readStoreFile(backupDataFile);
  const aside = `${absoluteDataFile}.corrupt-${Date.now()}`;
  await rename(absoluteDataFile, aside).catch(() => undefined);
  console.error(`[vibedesktop] ${absoluteDataFile} was unreadable; moved to ${aside}${backup.ok ? " and restored the last good copy" : ""}.`);
  return backup.ok ? backup.store : core.createEmptyStore();
}

async function readStoreFile(file: string): Promise<{ ok: true; store: StoreShape } | { ok: false; missing: boolean }> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    return { ok: false, missing: isMissingFile(error) };
  }
  try {
    return { ok: true, store: core.normalizeStore(JSON.parse(raw)) };
  } catch {
    return { ok: false, missing: false };
  }
}

async function writeStore(store: StoreShape): Promise<void> {
  await mkdir(path.dirname(absoluteDataFile), { recursive: true });
  const tempFile = `${absoluteDataFile}.${process.pid}.${crypto.randomUUID()}.tmp`;

  try {
    // fsync before rename so a crash leaves either the old or the new file, never a torn one.
    const handle = await open(tempFile, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(store, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    if ((await readStoreFile(absoluteDataFile)).ok) {
      await copyFile(absoluteDataFile, backupDataFile).catch(() => undefined);
    }
    await rename(tempFile, absoluteDataFile);
  } finally {
    await rm(tempFile, { force: true });
  }
}

function isMissingFile(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

export async function restoreDesktop(user: VibeUser, value: unknown): Promise<DesktopPayload> {
  const { validateSnapshot } = await import("@/lib/desktop-backup-contract");
  const snapshot = validateSnapshot(value);
  return withStore((store) => {
    const oldIds = new Set(store.desktops.filter(d => d.userId === user.id).map(d => d.id));
    store.desktops = store.desktops.filter(d => !oldIds.has(d.id));
    store.apps = store.apps.filter(a => !oldIds.has(a.desktopId));
    // Identity remains this machine's local owner. Backup files never provision users.
    const restored = structuredClone(snapshot.desktop);
    for (const preferences of Object.values(restored.packagePreferences ?? {})) preferences.revision = crypto.randomUUID();
    store.desktops.push({ ...restored, userId: user.id });
    store.apps.push(...structuredClone(snapshot.apps));
    return core.getDesktopPayload(store, user);
  });
}
