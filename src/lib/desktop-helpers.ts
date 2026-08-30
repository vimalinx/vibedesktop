import type {
  AppDirectoryItem,
  BuiltinWallpaper,
  Desktop,
  DesktopApp,
  DesktopTheme,
  LocalAppView,
  OpeningMode
} from "@/lib/contracts";
import {
  desktopGridMaxColumns,
  desktopGridMinColumns,
  firstOpenGridSpanPosition,
  gridSpanIsFree,
  markGridSpan,
  maxGridXForSpan,
  nearestOpenGridSpanPosition,
  weatherWidgetGridSpan,
  type DesktopGridPosition,
  type DesktopGridSpan
} from "@/lib/desktop-grid";
import { intlLocale, messagesForLocale, type I18nMessages, type Locale } from "@/lib/i18n";

/* ------------------------------------------------------------------ *
 * Layout constants (shared by desktop canvas + orchestrator)
 * ------------------------------------------------------------------ */
export const cellWidth = 112;
export const cellHeight = 118;
export const desktopInset = 28;
export const desktopIconWidth = 92;
export const desktopIconGap = 8;
export const dragStartThreshold = 5;

export interface DesktopCellMetrics {
  cellWidth: number;
  cellHeight: number;
  desktopInset: number;
}

/**
 * The grid geometry currently in effect, read from the CSS tokens so the drag
 * math can never disagree with what is painted: the compact breakpoint shrinks
 * `--cell-width` / `--cell-height` / `--desktop-inset` together with the icon
 * sizes, and this is how the JS side follows. Falls back to the constants on
 * the server and in tests, where no stylesheet is applied.
 */
export function desktopCellMetrics(): DesktopCellMetrics {
  const fallback = { cellWidth, cellHeight, desktopInset };
  if (typeof window === "undefined") return fallback;
  const style = window.getComputedStyle(document.documentElement);
  const read = (name: string, defaultValue: number) => {
    const parsed = Number.parseFloat(style.getPropertyValue(name));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
  };
  return {
    cellWidth: read("--cell-width", cellWidth),
    cellHeight: read("--cell-height", cellHeight),
    desktopInset: read("--desktop-inset", desktopInset)
  };
}

export function desktopIconPaintWidth(): number {
  if (typeof window === "undefined") return desktopIconWidth;
  const desktop = document.querySelector<HTMLElement>(".desktop");
  const parsed = Number.parseFloat(
    window.getComputedStyle(desktop ?? document.documentElement).getPropertyValue("--desktop-icon-width")
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : desktopIconWidth;
}

export interface DesktopGridLayout {
  columns: number;
  metrics: DesktopCellMetrics;
  fitted: boolean;
}

/**
 * Fit every usable column into real residual space while preserving icon gaps.
 *
 * Counting only whole base cells leaves a visually empty strip on the right:
 * icons are narrower than their cell pitch. When that strip plus the slack in
 * every cell can preserve the icon width and an 8px gap, calculate the maximum
 * safe column count instead of trying only one extra column. Painting and drag
 * math both consume the returned metrics, so every visible column is droppable.
 */
export function desktopGridLayoutForWidth(
  visibleWidth: number,
  metrics: DesktopCellMetrics = { cellWidth, cellHeight, desktopInset },
  iconWidth = desktopIconWidth
): DesktopGridLayout {
  const usableWidth = Math.max(0, visibleWidth - metrics.desktopInset * 2);
  const wholeColumns = Math.floor(usableWidth / metrics.cellWidth);
  const columns = Math.max(desktopGridMinColumns, Math.min(desktopGridMaxColumns, wholeColumns));

  // Narrow screens deliberately keep the minimum-width, horizontally
  // scrollable grid. Compressing eight cells into a phone viewport would make
  // icons overlap and destroy the drag target geometry.
  if (wholeColumns < desktopGridMinColumns || columns >= desktopGridMaxColumns) {
    return { columns, metrics, fitted: false };
  }

  const maximumSpacedColumns = Math.max(
    1,
    Math.floor((usableWidth - iconWidth) / (iconWidth + desktopIconGap)) + 1
  );
  const fittedColumns = Math.min(desktopGridMaxColumns, maximumSpacedColumns);
  if (fittedColumns <= columns) {
    return { columns, metrics, fitted: false };
  }
  const fittedCellWidth = (usableWidth - iconWidth) / (fittedColumns - 1);

  return {
    columns: fittedColumns,
    metrics: { ...metrics, cellWidth: fittedCellWidth },
    fitted: true
  };
}
export const onboardingStorageKey = "vd:onboarding:v1:dismissed";
export const pomodoroDefaultSeconds = 25 * 60;

/* ------------------------------------------------------------------ *
 * Shared component types
 * ------------------------------------------------------------------ */
export interface WeatherReading {
  place: string;
  country: string;
  temperature: number;
  humidity: number;
  windSpeed: number;
  code: number;
  label: string;
  updatedAt: string;
}

export type WeatherCondition = "sunny" | "rain" | "snow" | "wind";

export type LocalWebUiProbeStatus = "idle" | "checking" | "found" | "missing";

/** A category id, or one of the two reserved pseudo-categories: "all" (no
    filtering) and "local-webui" (the import card, which is not a directory
    entry). Category ids are open-ended, so this is a string. */
export type DirectoryCategoryFilter = string;

/** Categories that ship with the built-in seed and have localized labels.
    Listed in the order the store shows them; anything else is appended in
    first-seen order. */
export const knownDirectoryCategories = ["system", "global-ai", "china-ai"] as const;

export interface LocalWebUiCandidate {
  id: string;
  title: string;
  url: string;
  description: string;
  openingMode: OpeningMode;
}

export const localWebUiCandidates: LocalWebUiCandidate[] = [
  {
    id: "stable-diffusion-webui",
    title: "Stable Diffusion WebUI",
    url: "http://127.0.0.1:7860",
    description: "Automatic1111, Forge, Gradio, and image-generation WebUI defaults.",
    openingMode: "desktop_window"
  },
  {
    id: "comfyui",
    title: "ComfyUI",
    url: "http://127.0.0.1:8188",
    description: "Node-based image workflow UI running on the local machine.",
    openingMode: "desktop_window"
  },
  {
    id: "open-webui",
    title: "Open WebUI",
    url: "http://127.0.0.1:8080",
    description: "Local LLM chat UI commonly paired with Ollama.",
    openingMode: "desktop_window"
  },
  {
    id: "n8n",
    title: "n8n",
    url: "http://127.0.0.1:5678",
    description: "Local automation workflow builder.",
    openingMode: "desktop_window"
  },
  {
    id: "jupyter",
    title: "JupyterLab",
    url: "http://127.0.0.1:8888",
    description: "Notebook and data workspace running locally.",
    openingMode: "desktop_window"
  },
  {
    id: "anythingllm",
    title: "AnythingLLM",
    url: "http://127.0.0.1:3001",
    description: "Local knowledge-base chat workspace.",
    openingMode: "desktop_window"
  },
  {
    id: "librechat",
    title: "LibreChat",
    url: "http://127.0.0.1:3080",
    description: "Self-hosted multi-provider chat UI.",
    openingMode: "desktop_window"
  },
  {
    id: "sillytavern",
    title: "SillyTavern",
    url: "http://127.0.0.1:8000",
    description: "Local character and agent chat interface.",
    openingMode: "desktop_window"
  }
];

/* ------------------------------------------------------------------ *
 * Builtin app detection
 * ------------------------------------------------------------------ */
export function isWeatherApp(app: DesktopApp): boolean {
  return app.kind === "builtin" && (app.iconUrl === "vd://icon/weather" || app.title === "Weather");
}

export function isStartBoardApp(app: DesktopApp): boolean {
  return app.kind === "builtin" && (app.iconUrl === "vd://icon/start-board" || app.title === "Start Board");
}

export function isAppStoreApp(app: DesktopApp): boolean {
  return app.kind === "builtin" && (app.iconUrl === "vd://icon/app-store" || app.title === "App Store");
}

export function isSettingsApp(app: DesktopApp): boolean {
  return app.kind === "builtin" && (app.iconUrl === "vd://icon/settings" || app.title === "Settings");
}

export function isWebUiImportApp(app: DesktopApp): boolean {
  return app.kind === "builtin" && (app.iconUrl === "vd://icon/webui-import" || app.title === "WebUI Import");
}

export function isLocalAppsApp(app: DesktopApp): boolean {
  return app.kind === "builtin" && (app.iconUrl === "vd://icon/local-apps" || app.title === "Local WebApps");
}

export function shouldAutoResolveIcon(app: DesktopApp): boolean {
  return app.kind === "url" && Boolean(app.url) && app.iconKind !== "custom_local" && (!app.iconUrl || app.iconKind === "fallback");
}

/* ------------------------------------------------------------------ *
 * Local webapp bridge (vibe-daemon -> virtual desktop icons)
 * ------------------------------------------------------------------ */
export type LocalAppStatus = "running" | "booting" | "stopped" | "error";

export function isLocalApp(app: DesktopApp): boolean {
  return app.source === "local";
}

export function localAppStatus(view: LocalAppView): LocalAppStatus {
  if (view.status.running) return view.status.healthy ? "running" : "booting";
  if (view.status.lastError || view.status.lastExitCode !== null) return "error";
  return "stopped";
}

/**
 * Project daemon-managed local webapps onto the desktop as virtual icons.
 * They are NOT persisted in the desktop store — the daemon stays the single
 * source of truth. Optional `layout` (a localStorage-backed map of app-id to
 * grid cell) honours user drag positions; anything without a layout entry is
 * placed at the first open cell after the real apps.
 */
export function localAppToVirtualDesktopApps(
  realApps: DesktopApp[],
  localApps: LocalAppView[],
  layout: Record<string, { gridX: number; gridY: number; spanColumns?: number; spanRows?: number }> = {}
): DesktopApp[] {
  const taken = occupiedGridCellsForApps(realApps, "");
  const desktopId = realApps[0]?.desktopId ?? "";

  return localApps.map((view, index) => {
    const id = `local-app:${view.id}`;
    const desired = layout[id];
    const span: DesktopGridSpan = {
      columns: Math.max(1, desired?.spanColumns ?? 1),
      rows: Math.max(1, desired?.spanRows ?? 1)
    };
    const position =
      desired && gridSpanIsFree(taken, desired.gridX, desired.gridY, span)
        ? desired
        : firstOpenGridSpanPosition(taken, span, desktopGridMinColumns);
    markGridSpan(taken, position, span);

    return {
      id,
      desktopId,
      kind: "url",
      source: "local",
      title: view.name,
      url: view.status.url,
      description: null,
      openingMode: "desktop_window",
      iconKind: view.iconKind ?? "fallback",
      iconUrl: view.iconUrl ?? null,
      gridX: position.gridX,
      gridY: position.gridY,
      spanColumns: span.columns,
      spanRows: span.rows,
      tileVariant: "status",
      sortOrder: 10_000 + index,
      metadata: {},
      createdAt: view.createdAt,
      updatedAt: view.updatedAt
    };
  });
}

/* ------------------------------------------------------------------ *
 * Display helpers — title / description / icon
 * ------------------------------------------------------------------ */
export function displayAppTitle(app: DesktopApp, t: I18nMessages): string {
  if (app.iconUrl === "vd://icon/start-board") return t.builtins.startBoard.title;
  if (app.iconUrl === "vd://icon/weather") return t.builtins.weather.title;
  if (app.iconUrl === "vd://icon/app-store") return t.builtins.appStore.title;
  if (app.iconUrl === "vd://icon/webui-import") return t.builtins.webUiImport.title;
  if (app.iconUrl === "vd://icon/local-apps") return t.builtins.localApps.title;
  if (app.iconUrl === "vd://icon/settings") return t.builtins.settings.title;

  const directoryId = directoryIdForApp(app);
  if (directoryId && titleLooksLikeSeedDirectoryTitle(app.title, directoryId)) {
    return t.data.directory[directoryId]?.title ?? app.title;
  }

  return app.title;
}

export function displayAppDescription(app: DesktopApp, t: I18nMessages): string | null {
  if (app.iconUrl === "vd://icon/start-board") return t.builtins.startBoard.description;
  if (app.iconUrl === "vd://icon/weather") return t.builtins.weather.description;
  if (app.iconUrl === "vd://icon/app-store") return t.builtins.appStore.description;
  if (app.iconUrl === "vd://icon/webui-import") return t.builtins.webUiImport.description;
  if (app.iconUrl === "vd://icon/local-apps") return t.builtins.localApps.description;
  if (app.iconUrl === "vd://icon/settings") return t.builtins.settings.description;

  const directoryId = directoryIdForApp(app);
  if (directoryId && descriptionLooksLikeSeedDirectoryDescription(app.description, directoryId)) {
    return t.data.directory[directoryId]?.description ?? app.description;
  }

  return app.description;
}

export function directoryIdForApp(app: DesktopApp): string | null {
  if (!app.url) return null;

  try {
    const url = new URL(app.url);
    const host = url.hostname.replace(/^www\./, "");
    const directoryByHost: Record<string, string> = {
      "chatgpt.com": "chatgpt",
      "claude.ai": "claude",
      "chat.deepseek.com": "deepseek",
      "kimi.moonshot.cn": "kimi",
      "doubao.com": "doubao",
      "chat.qwen.ai": "qwen",
      "yuanbao.tencent.com": "yuanbao",
      "yiyan.baidu.com": "wenxin"
    };
    return directoryByHost[host] ?? null;
  } catch {
    return null;
  }
}

function titleLooksLikeSeedDirectoryTitle(title: string, directoryId: string): boolean {
  const enTitle = messagesForLocale("en").data.directory[directoryId]?.title;
  const zhTitle = messagesForLocale("zh").data.directory[directoryId]?.title;
  return title === enTitle || title === zhTitle;
}

function descriptionLooksLikeSeedDirectoryDescription(description: string | null, directoryId: string): boolean {
  if (!description) return false;
  const enDescription = messagesForLocale("en").data.directory[directoryId]?.description;
  const zhDescription = messagesForLocale("zh").data.directory[directoryId]?.description;
  return description === enDescription || description === zhDescription;
}

export function initialsForTitle(title: string): string {
  const label = title || "App";
  const initials = label
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
  return initials || "VD";
}

export function iconImageCandidates(app: DesktopApp, localUrl?: string): string[] {
  const isLocal = isLocalApp(app);
  const candidates = [
    localUrl,
    app.iconKind === "favicon" ? app.iconUrl : null,
    // For daemon-managed local apps, fetch the service's own favicon directly —
    // DuckDuckGo/Google key off hostname and resolve nothing for localhost.
    // Works once the app is running; <img onError> degrades to initials when stopped.
    isLocal && app.url ? localFaviconUrl(app.url) : null,
    !isLocal && app.url ? duckDuckGoIconUrl(app.url) : null,
    !isLocal && app.url ? googleIconUrl(app.url) : null
  ].filter((url): url is string => Boolean(url));
  return [...new Set(candidates)];
}

function localFaviconUrl(appUrl: string): string | null {
  try {
    return `${new URL(appUrl).origin}/favicon.ico`;
  } catch {
    return null;
  }
}

function duckDuckGoIconUrl(appUrl: string): string | null {
  try {
    const hostname = faviconLookupHost(new URL(appUrl).hostname);
    return `https://icons.duckduckgo.com/ip3/${hostname}.ico`;
  } catch {
    return null;
  }
}

function faviconLookupHost(hostname: string): string {
  const normalized = hostname.replace(/^www\./, "");
  if (normalized === "chat.deepseek.com") return "deepseek.com";
  return normalized;
}

function googleIconUrl(appUrl: string): string | null {
  try {
    const hostname = new URL(appUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=128`;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * URL helpers
 * ------------------------------------------------------------------ */
export function normalizeHttpUrlInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(trimmed)) return `http://${trimmed}`;
  return `https://${trimmed}`;
}

export function titleFromUrl(value: string, t?: I18nMessages): string {
  try {
    const url = new URL(normalizeHttpUrlInput(value));
    const host =
      url.hostname === "127.0.0.1" || url.hostname === "localhost"
        ? `localhost:${url.port || defaultPortForProtocol(url.protocol)}`
        : url.hostname;
    return host.replace(/^www\./, "");
  } catch {
    return t?.dialogs.untitledApp ?? "Untitled App";
  }
}

function defaultPortForProtocol(protocol: string): string {
  return protocol === "https:" ? "443" : "80";
}

export function hostnameForUrl(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, "");
  } catch {
    return rawUrl;
  }
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeUrlForComparison(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    if (url.pathname === "/") url.pathname = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.trim();
  }
}

export function isCurrentOrigin(value: string): boolean {
  try {
    return new URL(value).origin === window.location.origin;
  } catch {
    return false;
  }
}

export function parseManualWebUiEntries(raw: string, t: I18nMessages): Array<{ title: string; url: string; description: string }> {
  return raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [maybeTitle, maybeUrl] = line.includes("|") ? line.split("|", 2).map((part) => part.trim()) : ["", line];
      const url = normalizeHttpUrlInput(maybeUrl);
      return {
        title: maybeTitle || titleFromUrl(url, t),
        url,
        description: t.webUi.importedDescription
      };
    })
    .filter((entry) => isHttpUrl(entry.url));
}

/* ------------------------------------------------------------------ *
 * Localization helpers
 * ------------------------------------------------------------------ */
export function localizedWallpaperName(wallpaper: BuiltinWallpaper, t: I18nMessages): string {
  return t.data.wallpapers[wallpaper.id] ?? wallpaper.name;
}

export function localizedDesktopTheme(theme: DesktopTheme, t: I18nMessages): Pick<DesktopTheme, "name" | "browserFit" | "description"> {
  return t.data.themes[theme.id] ?? theme;
}

export function localizedShellStyle(style: { id: string; name: string; description: string }, t: I18nMessages): { name: string; description: string } {
  return t.data.shellStyles[style.id] ?? style;
}

export function localizedDirectoryItem(item: AppDirectoryItem, t: I18nMessages): Pick<AppDirectoryItem, "title" | "description"> {
  return t.data.directory[item.id] ?? item;
}

export function directoryCategoryOptions(
  directory: AppDirectoryItem[],
  hasWebUiImport: boolean,
  t: I18nMessages
): Array<{ id: DirectoryCategoryFilter; label: string; count: number }> {
  const counts = new Map<string, number>();

  // First-seen order for unknown categories; known ones are ordered explicitly
  // below, so their position here does not matter.
  for (const item of directory) {
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  }

  const knownOptions = knownDirectoryCategories
    // A category with no entries would be an empty tab. This also preserves the
    // pre-catalog behaviour where "system" only appeared when non-empty.
    .filter((category) => (counts.get(category) ?? 0) > 0)
    .map((category) => ({
      id: category as DirectoryCategoryFilter,
      label: directoryCategoryLabel(category, t),
      count: counts.get(category) ?? 0
    }));

  const unknownOptions = [...counts.keys()]
    .filter((category) => !(knownDirectoryCategories as readonly string[]).includes(category))
    .map((category) => ({
      id: category as DirectoryCategoryFilter,
      label: directoryCategoryLabel(category, t),
      count: counts.get(category) ?? 0
    }));

  const webUiCount = hasWebUiImport ? 1 : 0;

  return [
    { id: "all", label: t.appStore.categories.all, count: directory.length + webUiCount },
    ...knownOptions,
    ...unknownOptions,
    { id: "local-webui", label: t.appStore.categories.localWebUi, count: webUiCount }
  ];
}

export function directoryCategoryLabel(category: AppDirectoryItem["category"], t: I18nMessages): string {
  if (category === "system") return t.appStore.categories.system;
  if (category === "global-ai") return t.appStore.categories.globalAi;
  if (category === "china-ai") return t.appStore.categories.chinaAi;
  if (category === "ai-platforms") return t.appStore.categories.aiPlatforms;
  if (category === "automation") return t.appStore.categories.automation;
  if (category === "design") return t.appStore.categories.design;
  if (category === "media") return t.appStore.categories.media;
  if (category === "documents") return t.appStore.categories.documents;
  if (category === "monitoring") return t.appStore.categories.monitoring;
  if (category === "notes") return t.appStore.categories.notes;
  if (category === "developer-tools") return t.appStore.categories.developerTools;
  if (category === "finance") return t.appStore.categories.finance;
  // An unknown category comes from a catalog, so there is no translation for
  // it. Show its own id rather than mislabelling it as a known category.
  return humanizeCategoryId(category);
}

function humanizeCategoryId(category: string): string {
  const words = category
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1));

  return words.join(" ") || category;
}

export function openingModeLabel(openingMode: OpeningMode, t: I18nMessages): string {
  return openingMode === "external_tab" ? t.appStore.openingModes.externalTab : t.appStore.openingModes.desktopWindow;
}

export function probeStatusLabel(status: LocalWebUiProbeStatus, t: I18nMessages): string {
  return t.webUi.probe[status];
}

/* ------------------------------------------------------------------ *
 * Format helpers
 * ------------------------------------------------------------------ */
export function formatClock(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function formatShortDate(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function formatTimer(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

/* Re-export locale helper to keep imports single-source */
export { intlLocale };

/* ------------------------------------------------------------------ *
 * Window sizing
 * ------------------------------------------------------------------ */
export function initialWindowSize(app: DesktopApp): { width: number; height: number } {
  if (isWeatherApp(app)) return { width: 820, height: 600 };
  if (isStartBoardApp(app)) return { width: 820, height: 620 };
  if (isSettingsApp(app)) return { width: 840, height: 610 };
  if (isAppStoreApp(app)) return { width: 840, height: 600 };
  if (isWebUiImportApp(app)) return { width: 940, height: 740 };
  if (isLocalAppsApp(app)) return { width: 880, height: 680 };
  if (app.kind === "builtin") return { width: 760, height: 520 };
  return { width: 880, height: 620 };
}

/* ------------------------------------------------------------------ *
 * Desktop grid
 * ------------------------------------------------------------------ */
/** Tile fields for records created before tiles existed, and for callers that
    build virtual apps. 1×1 "icon" reproduces the classic desktop icon. */
export const defaultTileFields = { spanColumns: 1, spanRows: 1, tileVariant: "icon" } as const;

export function desktopGridSpanForApp(app: DesktopApp): DesktopGridSpan {
  // A pure read of persisted data. The weather widget's old hard-coded branch
  // is reproduced by its seeded/normalized reading variant, not by code.
  const columns = Number.isInteger(app.spanColumns) && app.spanColumns >= 1 ? app.spanColumns : 1;
  const rows = Number.isInteger(app.spanRows) && app.spanRows >= 1 ? app.spanRows : 1;
  return { columns, rows };
}

/**
 * Derive the positions that fit the grid currently visible in the browser.
 *
 * Persisted coordinates remain untouched: when a user returns to a wider
 * viewport, their wide-screen layout comes back. Apps that already fit get
 * first claim on their cells; only stale/out-of-range coordinates reflow to the
 * nearest free position. This avoids an old right-edge icon pushing a valid
 * icon out of place after the viewport narrows.
 */
export function layoutDesktopAppsForViewport(
  apps: DesktopApp[],
  gridColumns: number
): Map<string, DesktopGridPosition> {
  const columns = Math.max(1, gridColumns);
  const positions = new Map<string, DesktopGridPosition>();
  const taken = new Set<string>();
  const maxRows = Math.max(
    48,
    ...apps.map((app) => Math.max(0, app.gridY) + desktopGridSpanForApp(app).rows + apps.length + 8)
  );
  const fitsViewport = (app: DesktopApp) => {
    const span = desktopGridSpanForApp(app);
    return app.gridX >= 0 && app.gridX <= maxGridXForSpan(columns, span) && app.gridY >= 0;
  };
  const sortedApps = [...apps].sort((a, b) => {
    const viewportOrder = Number(fitsViewport(b)) - Number(fitsViewport(a));
    if (viewportOrder !== 0) return viewportOrder;
    return a.gridY - b.gridY || a.gridX - b.gridX || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);
  });

  for (const app of sortedApps) {
    const span = desktopGridSpanForApp(app);
    const desired = {
      gridX: Math.max(0, Math.min(maxGridXForSpan(columns, span), app.gridX)),
      gridY: Math.max(0, app.gridY)
    };
    const position = gridSpanIsFree(taken, desired.gridX, desired.gridY, span)
      ? desired
      : nearestOpenGridSpanPosition(taken, desired, span, columns, maxRows);
    positions.set(app.id, position);
    markGridSpan(taken, position, span);
  }

  return positions;
}

export function occupiedGridCellsForApps(
  apps: DesktopApp[],
  excludedAppId: string,
  positions?: ReadonlyMap<string, DesktopGridPosition>
): Set<string> {
  const taken = new Set<string>();
  for (const app of apps) {
    if (app.id === excludedAppId) continue;
    const position = positions?.get(app.id) ?? { gridX: app.gridX, gridY: app.gridY };
    markGridSpan(taken, position, desktopGridSpanForApp(app));
  }
  return taken;
}

export function autoArrangeDesktopApps(apps: DesktopApp[], gridColumns: number): Map<string, { gridX: number; gridY: number }> {
  const positions = new Map<string, { gridX: number; gridY: number }>();
  const taken = new Set<string>();
  const sortedApps = [...apps].sort((a, b) => a.sortOrder - b.sortOrder);

  for (const app of sortedApps) {
    const span = desktopGridSpanForApp(app);
    const position = firstOpenGridSpanPosition(taken, span, gridColumns);
    positions.set(app.id, position);
    markGridSpan(taken, position, span);
  }

  return positions;
}

export function pointToGridPosition(
  planeX: number,
  planeY: number,
  span: DesktopGridSpan,
  gridColumns: number,
  metrics: DesktopCellMetrics = { cellWidth, cellHeight, desktopInset }
): { gridX: number; gridY: number } {
  return {
    gridX: Math.max(
      0,
      Math.min(maxGridXForSpan(gridColumns, span), Math.round((planeX - metrics.desktopInset) / metrics.cellWidth))
    ),
    gridY: Math.max(0, Math.round((planeY - metrics.desktopInset) / metrics.cellHeight))
  };
}

export { desktopGridMinColumns, weatherWidgetGridSpan };

/* ------------------------------------------------------------------ *
 * PWA / browser detection
 * ------------------------------------------------------------------ */
export function isRunningStandalone(): boolean {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
}

/* ------------------------------------------------------------------ *
 * Local JSON storage
 * ------------------------------------------------------------------ */
export function readLocalJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeLocalJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Browser storage can be disabled or full; in-memory state still works.
  }
}

/* ------------------------------------------------------------------ *
 * Resolve helpers
 * ------------------------------------------------------------------ */
export function resolveWallpaper(wallpapers: BuiltinWallpaper[], id: string): BuiltinWallpaper {
  return wallpapers.find((wallpaper) => wallpaper.id === id) ?? wallpapers[0];
}

/* Appearance recency: the desktop background can come from the wallpaper picker
   (context menu) or a theme preset (settings). Whichever the user touched most
   recently wins; the marks live in localStorage, same per-browser scope as the
   uploaded-wallpaper feature. Desktops created after the noir default shipped
   start wallpaper-driven; legacy desktops stay theme-driven until the user
   picks a wallpaper once. */
export const appearanceWallpaperChosenAtKey = "vd:appearance:wallpaper-chosen-at";
export const appearanceThemeChosenAtKey = "vd:appearance:theme-chosen-at";

const legacyDefaultWallpaperId = "mineral-morning";

export function wallpaperDrivesBackground(desktop: Pick<Desktop, "wallpaperKind" | "wallpaperBuiltinId">): boolean {
  if (desktop.wallpaperKind === "custom_local") return true;
  if (desktop.wallpaperBuiltinId !== legacyDefaultWallpaperId) return true;
  return readLocalJson<number>(appearanceWallpaperChosenAtKey, 0) > readLocalJson<number>(appearanceThemeChosenAtKey, 0);
}

export function markWallpaperChosen(): void {
  writeLocalJson(appearanceWallpaperChosenAtKey, Date.now());
}

export function markThemeChosen(): void {
  writeLocalJson(appearanceThemeChosenAtKey, Date.now());
}

export function resolveActiveTheme(themes: DesktopTheme[], id: string): DesktopTheme {
  return themes.find((theme) => theme.id === id) ?? themes[0];
}

export function findCreatedApp(apps: DesktopApp[], match: { title: string; url: string }): DesktopApp | null {
  const title = match.title.trim();
  const url = match.url.trim();
  const candidates = apps.filter((app) => app.source === "user" && app.title === title && app.url === url);
  return candidates.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null;
}

/* ------------------------------------------------------------------ *
 * Weather
 * ------------------------------------------------------------------ */
export function weatherCodeLabel(code: number, t: I18nMessages): string {
  if (code === 0) return t.weather.conditionLabels.clear;
  if ([1, 2].includes(code)) return t.weather.conditionLabels.mainlyClear;
  if (code === 3) return t.weather.conditionLabels.partlyCloudy;
  if ([45, 48].includes(code)) return t.weather.conditionLabels.fog;
  if ([51, 53, 55].includes(code)) return t.weather.conditionLabels.drizzle;
  if ([56, 57].includes(code)) return t.weather.conditionLabels.freezingDrizzle;
  if ([61, 63, 65, 80, 81, 82].includes(code)) return t.weather.conditionLabels.rain;
  if ([66, 67].includes(code)) return t.weather.conditionLabels.freezingRain;
  if ([71, 73, 75, 77, 85, 86].includes(code)) return t.weather.conditionLabels.snow;
  if ([95, 96, 99].includes(code)) return t.weather.conditionLabels.thunderstorm;
  return t.weather.conditionLabels.windy;
}

export function weatherConditionFromReading(weather: WeatherReading | null): WeatherCondition {
  if (!weather) return "sunny";
  if ([61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(weather.code)) return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(weather.code)) return "snow";
  if (weather.windSpeed >= 18 || [1, 2, 3, 45, 48, 51, 53, 55, 56, 57].includes(weather.code)) return "wind";
  return "sunny";
}

export function desktopWeatherStatusText(status: string, t: I18nMessages): string {
  if (!status || /failed|could not|no matching|incomplete/i.test(status)) {
    return t.weather.openToUpdate;
  }
  return status;
}

export async function fetchWeather(city: string, locale: Locale, t: I18nMessages, signal?: AbortSignal): Promise<WeatherReading> {
  const geocodeUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
  geocodeUrl.search = new URLSearchParams({
    name: city,
    count: "1",
    language: locale === "zh" ? "zh" : "en",
    format: "json"
  }).toString();

  const geocodeResponse = await fetch(geocodeUrl, { signal });
  if (!geocodeResponse.ok) throw new Error(t.weather.lookupFailed);

  const geocode = (await geocodeResponse.json()) as {
    results?: Array<{ name: string; country?: string; latitude: number; longitude: number }>;
  };
  const place = geocode.results?.[0];
  if (!place) throw new Error(t.weather.noMatchingCity);

  const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
  forecastUrl.search = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: "temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m",
    temperature_unit: "celsius",
    wind_speed_unit: "kmh",
    timezone: "auto"
  }).toString();

  const forecastResponse = await fetch(forecastUrl, { signal });
  if (!forecastResponse.ok) throw new Error(t.weather.forecastFailed);

  const forecast = (await forecastResponse.json()) as {
    current?: {
      temperature_2m?: number;
      weather_code?: number;
      relative_humidity_2m?: number;
      wind_speed_10m?: number;
      time?: string;
    };
  };
  const current = forecast.current;
  if (!current || typeof current.temperature_2m !== "number") throw new Error(t.weather.incomplete);

  const code = typeof current.weather_code === "number" ? current.weather_code : -1;

  return {
    place: place.name,
    country: place.country ?? "",
    temperature: current.temperature_2m,
    humidity: typeof current.relative_humidity_2m === "number" ? current.relative_humidity_2m : 0,
    windSpeed: typeof current.wind_speed_10m === "number" ? current.wind_speed_10m : 0,
    code,
    label: weatherCodeLabel(code, t),
    updatedAt: current.time ? formatShortDate(new Date(current.time), locale) : formatShortDate(new Date(), locale)
  };
}

export function readWeatherCity(): string {
  return readLocalJson("vd:weather:city", readLocalJson("vd:start-board:city", "Shanghai"));
}

export function readWeatherReading(): WeatherReading | null {
  return readLocalJson("vd:weather:reading", readLocalJson<WeatherReading | null>("vd:start-board:weather", null));
}

export function openExternalUrl(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}
