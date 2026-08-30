import type { Desktop, DesktopApp, DesktopPayload, VibeUser } from "@/lib/contracts";
import { builtinWallpapers, createDefaultApps } from "@/lib/seed-data";
import {
  desktopGridMaxColumns,
  desktopGridMinColumns,
  firstOpenGridSpanPosition,
  markGridSpan,
  maxGridXForSpan,
  weatherWidgetGridSpan,
  type DesktopGridSpan
} from "@/lib/desktop-grid";
import { defaultTileFields } from "@/lib/desktop-helpers";
import { assertTileMutationAllowed, isTileVariant } from "@/lib/tile-contract";
import { desktopThemes, shellStyleOptions } from "@/lib/theme-data";
import { StoreNotFoundError } from "@/lib/persistence-errors";

/**
 * The desktop rule set, as pure functions over an in-memory store.
 *
 * Every rule that decides what a desktop *is* — first-run seeding, seed
 * migration for older records, grid placement, tile-span validation,
 * normalisation of records written by earlier versions — lives here and nowhere
 * else. The two things that differ between the real product and the browser-only
 * trial are how the store is read and how it is written, so those are the only
 * things the adapters own:
 *
 *   store.ts                 → read/write a JSON file on the user's disk
 *   desktop-data/local-source → read/write one browser-storage key
 *
 * That split is what makes the trial desktop behave like the real one by
 * construction rather than by two implementations being kept in step by hand.
 *
 * Nothing here may import a `node:` module. The only ambient calls used are
 * `crypto.randomUUID()` and `new Date()`, both of which exist in the browser.
 */

export interface StoreShape {
  users: VibeUser[];
  desktops: Desktop[];
  apps: DesktopApp[];
}

export interface UserIdentity {
  identityIssuer: string;
  identitySubject: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  avatarUrl: string | null;
}

export const currentSeedVersion = 8;

export const emptyStore: StoreShape = {
  users: [],
  desktops: [],
  apps: []
};

export function createEmptyStore(): StoreShape {
  return structuredClone(emptyStore);
}

/* ------------------------------------------------------------------ *
 * Mutators — each takes the store, mutates it, and returns the payload
 * the caller should hand back. Persisting is the adapter's job.
 * ------------------------------------------------------------------ */

export function getOrCreateUser(store: StoreShape, identity: UserIdentity): VibeUser {
  const existing = store.users.find(
    (user) => user.identityIssuer === identity.identityIssuer && user.identitySubject === identity.identitySubject
  );
  const now = new Date().toISOString();

  if (existing) {
    existing.email = identity.email;
    existing.emailVerified = identity.emailVerified;
    existing.displayName = identity.displayName;
    existing.avatarUrl = identity.avatarUrl;
    existing.updatedAt = now;
    return existing;
  }

  const user: VibeUser = {
    id: crypto.randomUUID(),
    identityIssuer: identity.identityIssuer,
    identitySubject: identity.identitySubject,
    email: identity.email,
    emailVerified: identity.emailVerified,
    displayName: identity.displayName,
    avatarUrl: identity.avatarUrl,
    createdAt: now,
    updatedAt: now
  };

  store.users.push(user);

  return user;
}

export function getDesktopPayload(store: StoreShape, user: VibeUser): DesktopPayload {
  const { desktop, apps } = ensureDesktop(store, user.id);

  return {
    user,
    desktop,
    apps: sortApps(apps),
    wallpapers: builtinWallpapers,
    themes: desktopThemes,
    shellStyles: shellStyleOptions
  };
}

export type DesktopUpdates = Partial<
  Pick<
    Desktop,
    "wallpaperKind" | "wallpaperBuiltinId" | "startAppId" | "themeId" | "shellStyle" | "accentOverride" | "fontOverride"
  >
>;

export function updateDesktop(store: StoreShape, user: VibeUser, updates: DesktopUpdates): DesktopPayload {
  const { desktop, apps } = ensureDesktop(store, user.id);

  if (updates.wallpaperKind) {
    desktop.wallpaperKind = updates.wallpaperKind;
  }

  if (updates.accentOverride !== undefined) {
    desktop.accentOverride = updates.accentOverride;
  }
  if (updates.fontOverride !== undefined) {
    desktop.fontOverride = updates.fontOverride;
  }

  if (updates.wallpaperBuiltinId) {
    desktop.wallpaperBuiltinId = updates.wallpaperBuiltinId;
  }

  if (updates.startAppId !== undefined) {
    desktop.startAppId = updates.startAppId && apps.some((app) => app.id === updates.startAppId) ? updates.startAppId : null;
  }

  if (updates.themeId && desktopThemes.some((theme) => theme.id === updates.themeId)) {
    desktop.themeId = updates.themeId;
  }

  if (updates.shellStyle && shellStyleOptions.some((style) => style.id === updates.shellStyle)) {
    desktop.shellStyle = updates.shellStyle;
  }

  desktop.updatedAt = new Date().toISOString();

  return getDesktopPayload(store, user);
}

export type CreateDesktopAppInput = Pick<
  DesktopApp,
  "kind" | "source" | "title" | "url" | "description" | "openingMode" | "iconKind" | "iconUrl"
> & { setAsStart?: boolean } & Partial<Pick<DesktopApp, "gridX" | "gridY">>;

export function createDesktopApp(store: StoreShape, user: VibeUser, input: CreateDesktopAppInput): DesktopPayload {
  const { desktop, apps } = ensureDesktop(store, user.id);
  const now = new Date().toISOString();
  const { setAsStart, ...appInput } = input;
  const taken = occupiedGridCellsForStoredApps(apps);
  const position =
    Number.isFinite(appInput.gridX) && Number.isFinite(appInput.gridY)
      ? { gridX: Math.max(0, Number(appInput.gridX)), gridY: Math.max(0, Number(appInput.gridY)) }
      : firstFreeGridPosition(taken);
  const app: DesktopApp = {
    id: crypto.randomUUID(),
    desktopId: desktop.id,
    ...appInput,
    gridX: position.gridX,
    gridY: position.gridY,
    ...defaultTileFields,
    ...(appInput.kind === "url" ? { tileVariant: "app" as const } : {}),
    sortOrder: apps.length,
    metadata: {},
    createdAt: now,
    updatedAt: now
  };

  store.apps.push(app);
  if (setAsStart) {
    desktop.startAppId = app.id;
    desktop.updatedAt = now;
  }

  return getDesktopPayload(store, user);
}

export interface DirectoryAppInput {
  title: string;
  url: string;
  description: string;
  openingMode: DesktopApp["openingMode"];
  iconUrl: string;
}

export function addDirectoryApp(store: StoreShape, user: VibeUser, directoryApp: DirectoryAppInput): DesktopPayload {
  const { desktop, apps } = ensureDesktop(store, user.id);
  const taken = occupiedGridCellsForStoredApps(apps);
  const position = firstFreeGridPosition(taken);
  const now = new Date().toISOString();

  store.apps.push({
    id: crypto.randomUUID(),
    desktopId: desktop.id,
    kind: "url",
    source: "directory",
    title: directoryApp.title,
    url: directoryApp.url,
    description: directoryApp.description,
    openingMode: directoryApp.openingMode,
    iconKind: "favicon",
    iconUrl: directoryApp.iconUrl,
    gridX: position.gridX,
    gridY: position.gridY,
    ...defaultTileFields,
    tileVariant: "app",
    sortOrder: apps.length,
    metadata: {},
    createdAt: now,
    updatedAt: now
  });

  return getDesktopPayload(store, user);
}

export type DesktopAppUpdates = Partial<
  Pick<
    DesktopApp,
    "title" | "url" | "description" | "openingMode" | "iconKind" | "iconUrl" | "gridX" | "gridY" | "spanColumns" | "spanRows" | "tileVariant"
  >
>;

export function updateDesktopApp(
  store: StoreShape,
  user: VibeUser,
  appId: string,
  updates: DesktopAppUpdates
): DesktopPayload {
  const { desktop } = ensureDesktop(store, user.id);
  const app = store.apps.find((candidate) => candidate.id === appId && candidate.desktopId === desktop.id);

  if (!app) {
    throw new StoreNotFoundError("App not found");
  }

  assertTileMutationAllowed(store.apps.filter((candidate) => candidate.desktopId === desktop.id), appId, updates);
  applyDefinedUpdates(app, updates);
  app.updatedAt = new Date().toISOString();

  return getDesktopPayload(store, user);
}

export function deleteDesktopApp(store: StoreShape, user: VibeUser, appId: string): DesktopPayload {
  const { desktop } = ensureDesktop(store, user.id);
  const before = store.apps.length;
  store.apps = store.apps.filter((candidate) => !(candidate.id === appId && candidate.desktopId === desktop.id));

  if (store.apps.length === before) {
    throw new StoreNotFoundError("App not found");
  }

  if (desktop.startAppId === appId) {
    desktop.startAppId = null;
    desktop.updatedAt = new Date().toISOString();
  }

  return getDesktopPayload(store, user);
}

/* ------------------------------------------------------------------ *
 * Seeding, migration, placement
 * ------------------------------------------------------------------ */

export function ensureDesktop(store: StoreShape, userId: string): { desktop: Desktop; apps: DesktopApp[] } {
  const existing = store.desktops.find((desktop) => desktop.userId === userId);

  if (existing) {
    migrateDesktopSeed(store, existing);

    return {
      desktop: existing,
      apps: store.apps.filter((app) => app.desktopId === existing.id)
    };
  }

  const now = new Date().toISOString();
  const desktop: Desktop = {
    id: crypto.randomUUID(),
    userId,
    wallpaperKind: "builtin",
    wallpaperBuiltinId: "noir-dawn",
    startAppId: null,
    themeId: "mineral",
    shellStyle: "glass",
    accentOverride: null,
    fontOverride: null,
    seedVersion: currentSeedVersion,
    createdAt: now,
    updatedAt: now
  };
  const apps = createDefaultApps(desktop.id, now);

  store.desktops.push(desktop);
  store.apps.push(...apps);

  return { desktop, apps };
}

function sortApps(apps: DesktopApp[]): DesktopApp[] {
  return [...apps].sort((a: DesktopApp, b: DesktopApp) => a.sortOrder - b.sortOrder);
}

function firstFreeGridPosition(taken: Set<string>): { gridX: number; gridY: number } {
  return firstFreeGridSpanPosition(taken, { columns: 1, rows: 1 });
}

function firstFreeGridSpanPosition(taken: Set<string>, span: DesktopGridSpan): { gridX: number; gridY: number } {
  return firstOpenGridSpanPosition(taken, span, desktopGridMinColumns);
}

function occupiedGridCellsForStoredApps(apps: DesktopApp[]): Set<string> {
  const taken = new Set<string>();

  for (const app of apps) {
    markGridSpan(taken, { gridX: app.gridX, gridY: app.gridY }, desktopGridSpanForStoredApp(app));
  }

  return taken;
}

function desktopGridSpanForStoredApp(app: DesktopApp): DesktopGridSpan {
  return isStoredWeatherApp(app) ? weatherWidgetGridSpan : { columns: 1, rows: 1 };
}

function applyDefinedUpdates(app: DesktopApp, updates: DesktopAppUpdates): void {
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      (app as unknown as Record<string, unknown>)[key] = value;
    }
  }
}

/* ------------------------------------------------------------------ *
 * Normalisation of stored records
 * ------------------------------------------------------------------ */

export function normalizeStore(value: unknown): StoreShape {
  const parsed = value as Partial<StoreShape>;
  const store: StoreShape = {
    users: Array.isArray(parsed.users) ? parsed.users.map(normalizeUser) : [],
    desktops: Array.isArray(parsed.desktops) ? parsed.desktops.map(normalizeDesktop) : [],
    apps: Array.isArray(parsed.apps) ? parsed.apps : []
  };

  store.apps = store.apps.map((app, index) => {
    const normalized: DesktopApp = {
      ...app,
      title: typeof app.title === "string" && app.title.length > 0 ? app.title : "Untitled App",
      description: typeof app.description === "string" ? app.description : null,
      openingMode: app.openingMode === "external_tab" ? "external_tab" : "desktop_window",
      iconKind: app.iconKind ?? "fallback",
      iconUrl: normalizeStoredIconUrl(app),
      gridX: Number.isFinite(app.gridX) ? Math.max(0, app.gridX) : index % 5,
      gridY: Number.isFinite(app.gridY) ? Math.max(0, app.gridY) : Math.floor(index / 5),
      sortOrder: Number.isFinite(app.sortOrder) ? app.sortOrder : index,
      // Records written before tiles existed have no span. The weather widget
      // migrates to its historical multi-cell footprint as data; everything
      // else becomes a classic 1×1 icon, which reproduces the old desktop.
      ...(Number.isInteger(app.spanColumns) && app.spanColumns >= 1 && Number.isInteger(app.spanRows) && app.spanRows >= 1 && isTileVariant(app.tileVariant)
        ? {
            spanColumns: app.spanColumns,
            spanRows: app.spanRows,
            tileVariant: app.kind === "url" && app.tileVariant === "icon" ? ("app" as const) : app.tileVariant
          }
        : app.kind === "builtin" && (app.title === "Weather" || app.iconUrl === "vd://icon/weather")
          ? { spanColumns: weatherWidgetGridSpan.columns, spanRows: weatherWidgetGridSpan.rows, tileVariant: "reading" as const }
          : app.kind === "url"
            ? { spanColumns: 1, spanRows: 1, tileVariant: "app" as const }
            : defaultTileFields),
      metadata: app.metadata && typeof app.metadata === "object" ? app.metadata : {},
      updatedAt: typeof app.updatedAt === "string" ? app.updatedAt : new Date().toISOString()
    };

    if (isStoredWeatherApp(normalized)) {
      normalized.gridX = Math.min(maxGridXForSpan(desktopGridMaxColumns, weatherWidgetGridSpan), normalized.gridX);
    }

    return normalized;
  });

  return store;
}

function normalizeUser(user: VibeUser): VibeUser {
  return {
    ...user,
    identityIssuer:
      typeof user.identityIssuer === "string" && user.identityIssuer.length > 0
        ? user.identityIssuer
        : user.identitySubject.startsWith("dev:")
          ? "development:vibe-desktop"
          : "legacy:unknown",
    emailVerified: user.emailVerified === true
  };
}

function isStoredWeatherApp(app: DesktopApp): boolean {
  return app.kind === "builtin" && (app.title === "Weather" || app.iconUrl === "vd://icon/weather");
}

function normalizeStoredIconUrl(app: DesktopApp): string | null {
  if (typeof app.iconUrl !== "string") {
    return null;
  }

  if (!app.iconUrl.startsWith("https://www.google.com/s2/favicons")) {
    return app.iconUrl;
  }

  if (app.url) {
    try {
      return new URL("/favicon.ico", app.url).toString();
    } catch {
      return app.iconUrl;
    }
  }

  return app.iconUrl;
}

function normalizeDesktop(desktop: Desktop): Desktop {
  return {
    ...desktop,
    wallpaperKind: desktop.wallpaperKind === "custom_local" ? "custom_local" : "builtin",
    wallpaperBuiltinId: typeof desktop.wallpaperBuiltinId === "string" ? desktop.wallpaperBuiltinId : "noir-dawn",
    startAppId: typeof desktop.startAppId === "string" ? desktop.startAppId : null,
    themeId: desktopThemes.some((theme) => theme.id === desktop.themeId) ? desktop.themeId : "mineral",
    shellStyle: shellStyleOptions.some((style) => style.id === desktop.shellStyle) ? desktop.shellStyle : "glass",
    accentOverride: typeof desktop.accentOverride === "string" ? desktop.accentOverride : null,
    fontOverride: typeof desktop.fontOverride === "string" ? desktop.fontOverride : null,
    seedVersion: Number.isFinite(desktop.seedVersion) ? desktop.seedVersion : 1
  };
}

function migrateDesktopSeed(store: StoreShape, desktop: Desktop): void {
  if (desktop.seedVersion >= currentSeedVersion) {
    return;
  }

  const existingApps = store.apps.filter((app) => app.desktopId === desktop.id);
  const obsoleteWebUiImport = existingApps.find(
    (app) => app.kind === "builtin" && app.source === "seed" &&
      (app.title === "WebUI Import" || app.iconUrl === "vd://icon/webui-import")
  );
  if (obsoleteWebUiImport) {
    store.apps = store.apps.filter((app) => app.id !== obsoleteWebUiImport.id);
    if (desktop.startAppId === obsoleteWebUiImport.id) desktop.startAppId = null;
  }
  const activeApps = existingApps.filter((app) => app.id !== obsoleteWebUiImport?.id);
  const startBoardApp = activeApps.find((app) => app.kind === "builtin" && app.title === "Start Board");
  const hasStartBoard = Boolean(startBoardApp);
  const hasWeather = activeApps.some((app) => app.kind === "builtin" && (app.title === "Weather" || app.iconUrl === "vd://icon/weather"));
  const now = new Date().toISOString();
  const taken = occupiedGridCellsForStoredApps(activeApps);
  let sortOrder = activeApps.length;

  if (!hasStartBoard) {
    const position = firstFreeGridPosition(taken);
    const startBoard: DesktopApp = {
      id: crypto.randomUUID(),
      desktopId: desktop.id,
      kind: "builtin",
      source: "seed",
      title: "Start Board",
      url: null,
      description: "Todo, pomodoro, and clipping cards.",
      openingMode: "desktop_window",
      iconKind: "builtin",
      iconUrl: "vd://icon/start-board",
      gridX: position.gridX,
      gridY: position.gridY,
      ...defaultTileFields,
      sortOrder,
      metadata: {},
      createdAt: now,
      updatedAt: now
    };

    store.apps.push(startBoard);
    markGridSpan(taken, position, { columns: 1, rows: 1 });
    sortOrder += 1;
  } else if (desktop.startAppId === startBoardApp?.id) {
    desktop.startAppId = null;
  }

  if (!hasWeather) {
    const span = weatherWidgetGridSpan;
    const position = firstFreeGridSpanPosition(taken, span);
    const weatherApp: DesktopApp = {
      id: crypto.randomUUID(),
      desktopId: desktop.id,
      kind: "builtin",
      source: "seed",
      title: "Weather",
      url: null,
      description: "Animated live weather widget.",
      openingMode: "desktop_window",
      iconKind: "builtin",
      iconUrl: "vd://icon/weather",
      gridX: position.gridX,
      gridY: position.gridY,
      spanColumns: weatherWidgetGridSpan.columns,
      spanRows: weatherWidgetGridSpan.rows,
      tileVariant: "reading",
      sortOrder,
      metadata: {},
      createdAt: now,
      updatedAt: now
    };

    store.apps.push(weatherApp);
    markGridSpan(taken, position, span);
    sortOrder += 1;
  }

  const hasLocalApps = activeApps.some(
    (app) => app.kind === "builtin" && (app.title === "Local WebApps" || app.iconUrl === "vd://icon/local-apps")
  );

  if (!hasLocalApps) {
    const position = firstFreeGridPosition(taken);
    const localAppsApp: DesktopApp = {
      id: crypto.randomUUID(),
      desktopId: desktop.id,
      kind: "builtin",
      source: "seed",
      title: "Local WebApps",
      url: null,
      description: "Spawn and control local web servers from vibe-daemon.",
      openingMode: "desktop_window",
      iconKind: "builtin",
      iconUrl: "vd://icon/local-apps",
      gridX: position.gridX,
      gridY: position.gridY,
      ...defaultTileFields,
      sortOrder,
      metadata: {},
      createdAt: now,
      updatedAt: now
    };

    store.apps.push(localAppsApp);
    markGridSpan(taken, position, { columns: 1, rows: 1 });
  }

  desktop.seedVersion = currentSeedVersion;
  desktop.updatedAt = new Date().toISOString();
}
