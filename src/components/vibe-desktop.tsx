"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { DesktopApp, DesktopPayload, LocalAppView, VibeUser } from "@/lib/contracts";
import { loadLocalAsset, saveLocalAsset } from "@/lib/browser-local-assets";
import { desktopData, reasonFor, DesktopDataError } from "@/lib/desktop-data";
import {
  desktopGridMinColumns,
  gridSpanIsFree,
  nearestOpenGridSpanPosition
} from "@/lib/desktop-grid";
import {
  detectInitialLocale,
  intlLocale,
  messagesForLocale,
  persistLocale,
  type Locale
} from "@/lib/i18n";
import { applyLocalStyleOverrides, resolveDesktopStyle } from "@/lib/desktop-style";
import {
  autoArrangeDesktopApps,
  defaultTileFields,
  desktopCellMetrics,
  desktopGridLayoutForWidth,
  desktopGridSpanForApp,
  desktopIconPaintWidth,
  dragStartThreshold,
  fetchWeather,
  formatClock,
  initialWindowSize,
  isLocalAppsApp,
  isLocalApp,
  isRunningStandalone,
  shellSurfacesConflict,
  isWeatherApp,
  layoutDesktopAppsForViewport,
  localAssetHydrationKey,
  localAppStatus,
  localAppToVirtualDesktopApps,
  occupiedGridCellsForApps,
  onboardingStorageKey,
  pointToGridPosition,
  readLocalJson,
  readWeatherCity,
  readWeatherReading,
  shouldAutoResolveIcon,
  writeLocalJson,
  type LocalAppStatus,
  type WeatherReading
} from "@/lib/desktop-helpers";

import { restoreWindows, windowSession, windowSessionKey } from "@/lib/window-session";

import { PackageShell } from "@/components/packages/package-shell";
import { PackageManager } from "@/components/packages/package-manager";
import { defaultPackageId, selectionKey } from "@/lib/desktop-packages/bundle";
import { displayAppTitle, iconImageCandidates } from "@/lib/desktop-helpers";
import { normalizeWindowPatch } from "@/protocol/shell/window-patch";
import type { DesktopShellCommands } from "@/protocol/shell/package";
import { CatalogActivity } from "@/components/chrome/catalog-activity";
import { ProductivityBar } from "@/components/chrome/productivity-bar";
import { automaticBackupTick } from "@/lib/automatic-backup";
import { runActivity } from "@/lib/desktop-activity";
import { BootScreen } from "@/components/chrome/boot-screen";
import { ContextMenu, type ContextMenuState } from "@/components/chrome/context-menu";
import { DesktopOnboarding } from "@/components/packages/desktop-onboarding";
import { TourOverlay } from "@/components/chrome/tour-overlay";
import { demoLocalApps, makeDemoPayload } from "@/components/chrome/tour-demo-data";
import { DesktopCanvas, type DesktopDragTarget } from "@/components/desktop/desktop-canvas";
import { Dock } from "@/components/dock/dock";
import { DesktopWindow } from "@/components/window/desktop-window";
import type { AppWindowState } from "@/protocol/shell/v1";
import { WindowContent } from "@/components/window/window-content";
import { WindowErrorBoundary } from "@/components/window/window-error-boundary";
import { AddAppDialog } from "@/components/dialogs/add-app-dialog";
import { EditAppDialog } from "@/components/dialogs/edit-app-dialog";
import { WallpaperDialog } from "@/components/dialogs/wallpaper-dialog";
import { MarketInstallDialog } from "@/components/dialogs/market-install-dialog";
import { marketInstallEvent, readMarketInstallQuery, type MarketInstallRequest } from "@/lib/market-install-request";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface DesktopDragState {
  app: DesktopApp;
  pointerId: number;
  element: HTMLButtonElement;
  offsetX: number;
  offsetY: number;
  originX: number;
  originY: number;
  startX: number;
  startY: number;
  latestX: number;
  latestY: number;
  active: boolean;
  frame: number | null;
}

function resetDraggedElement(element: HTMLElement): void {
  element.style.transform = "";
  element.classList.remove("is-dragging");
}

export function VibeDesktop() {
  const iconPlaneRef = useRef<HTMLElement>(null);
  const dragRef = useRef<DesktopDragState | null>(null);
  const dragTargetRef = useRef<DesktopDragTarget | null>(null);
  // The drop preview is painted imperatively so crossing a grid line does not
  // rerender every desktop icon (which makes photographic wallpapers flash).
  const dragTargetElementRef = useRef<HTMLDivElement>(null);
  // Click-vs-double-click disambiguation: single click opens embedded (after a
  // short delay so a following double-click can cancel it and open external instead).
  const clickTimerRef = useRef<number | null>(null);
  // A just-completed drag would otherwise emit a click and open the app — suppress it.
  const suppressClickRef = useRef(false);

  const [user, setUser] = useState<VibeUser | null>(null);
  const [payload, setPayload] = useState<DesktopPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState<"" | "protocol_mismatch" | "unreachable">("");
  const [packageId, setPackageId] = useState<string>(defaultPackageId);
  const [packageManagerOpen, setPackageManagerOpen] = useState(false);
  const [workspaceRequest, setWorkspaceRequest] = useState<{ panel: "windows" | "scenes" | "organize" | "activity" } | null>(null);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get("desktop");
    const requested = query === "windows" ? "org.vibedesktop.windows" : query === "macos" ? "org.vibedesktop.macos" : query;
    setPackageId(requested || readLocalJson<string>(selectionKey, defaultPackageId));
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === "p") { event.preventDefault(); setPackageManagerOpen(true); }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  function selectPackage(id: string) {
    writeLocalJson(selectionKey, id); setPackageId(id);
    const url = new URL(window.location.href); url.searchParams.delete("desktop"); window.history.replaceState(null, "", url);
  }
  const [windows, setWindows] = useState<AppWindowState[]>([]);
  const windowStack = useMemo(() => new Map([...windows].sort((a,b) => a.z-b.z).map((item,index) => [item.id,index+10])), [windows]);
  const [filteredIds, setFilteredIds] = useState<string[] | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [marketRequest, setMarketRequest] = useState<MarketInstallRequest | null>(null);
  const [editingApp, setEditingApp] = useState<DesktopApp | null>(null);
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const [closeConfirm, setCloseConfirm] = useState<{
    windowId: string;
    daemonId: string;
    name: string;
  } | null>(null);
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const legacyTour = onboardingVisible && packageId === "classic";
  const [activeDragAppId, setActiveDragAppId] = useState<string | null>(null);
  const [localAssets, setLocalAssets] = useState<Record<string, string>>({});
  // SSR renders with "en" (matching detectInitialLocale's server return).
  // After mount, an effect swaps in the real client locale. Avoids hydration
  // mismatch when the browser locale differs from the server default.
  const [locale, setLocale] = useState<Locale>("zh");
  const [clock, setClock] = useState(() => formatClock(new Date(), "zh"));
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [startPageUrl, setStartPageUrl] = useState("");
  const [weatherCity, setWeatherCity] = useState(() => readWeatherCity());
  const [weather, setWeather] = useState<WeatherReading | null>(() => readWeatherReading());
  const [weatherStatus, setWeatherStatus] = useState("");
  const [localApps, setLocalApps] = useState<LocalAppView[]>([]);
  const realLocalAppsRef = useRef<LocalAppView[] | null>(null);
  const [localAppLayout, setLocalAppLayout] = useState<
    Record<string, { gridX: number; gridY: number; spanColumns?: number; spanRows?: number }>
  >(() => readLocalJson("vd:local-app-layout", {}));
  const [tileNotice, setTileNotice] = useState("");
  const [localAppsError, setLocalAppsError] = useState("");
  const [localAppsLoaded, setLocalAppsLoaded] = useState(false);
  const [sessionRestored, setSessionRestored] = useState(false);
  const refreshPending = useRef(false);
  const pendingLocalSession = useRef<unknown>(null);

  const t = messagesForLocale(locale);
  const desktopHasWeather = payload?.apps.some(isWeatherApp) ?? false;

  // Daemon-managed local webapps, projected onto the desktop as virtual icons
  // (not persisted in the store). Polled so their status badges stay live.
  const localAppViewById = useMemo(() => {
    const map = new Map<string, LocalAppView>();
    for (const view of localApps) map.set(`local-app:${view.id}`, view);
    return map;
  }, [localApps]);

  const displayApps = useMemo(() => {
    if (!payload) return [];
    return [...payload.apps, ...localAppToVirtualDesktopApps(payload.apps, localApps, localAppLayout)];
  }, [payload, localApps, localAppLayout]);

  const statusByApp = useMemo(() => {
    const map: Record<string, LocalAppStatus> = {};
    for (const view of localApps) map[`local-app:${view.id}`] = localAppStatus(view);
    return map;
  }, [localApps]);

  const loadWeather = useCallback(
    async (query: string, signal?: AbortSignal) => {
      if (!query) {
        setWeatherStatus(t.weather.statusEnterCity);
        return;
      }
      setWeatherStatus(t.weather.statusUpdating);
      try {
        const nextWeather = await fetchWeather(query, locale, t, signal);
        setWeather(nextWeather);
        setWeatherStatus(t.weather.statusUpdated(nextWeather.updatedAt));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setWeatherStatus(error instanceof Error ? error.message : t.weather.statusCouldNotLoad);
      }
    },
    [locale, t]
  );

  // `?install=owner/repo&ref=<sha>` (from a vibedesktop:// link or `vibedesktop install`) and the
  // Local WebApps panel both open the same confirmation dialog. The query is consumed once.
  useEffect(() => {
    const fromQuery = readMarketInstallQuery(window.location.search);
    if (fromQuery) {
      setMarketRequest(fromQuery);
      const url = new URL(window.location.href);
      url.searchParams.delete("install");
      url.searchParams.delete("ref");
      window.history.replaceState(window.history.state, "", url);
    }
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<MarketInstallRequest>).detail;
      if (detail?.repository) setMarketRequest(detail);
    };
    window.addEventListener(marketInstallEvent, onRequest);
    return () => window.removeEventListener(marketInstallEvent, onRequest);
  }, []);

  const refreshLocalApps = useCallback(async () => {
    if (refreshPending.current) return;
    refreshPending.current = true;
    try {
      setLocalApps(await desktopData().localApps.list());
      setLocalAppsError("");
    } catch (error) {
      setLocalAppsError(error instanceof DesktopDataError && error.code === "daemon_unreachable" ? "daemon_unreachable" : reasonFor(error) ?? "daemon_unreachable");
    } finally {
      refreshPending.current = false;
      setLocalAppsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (legacyTour) {
      if (realLocalAppsRef.current === null) realLocalAppsRef.current = localApps;
      setLocalApps(demoLocalApps(locale));
      return;
    }
    if (realLocalAppsRef.current !== null) {
      setLocalApps(realLocalAppsRef.current);
      realLocalAppsRef.current = null;
    }
    void refreshLocalApps();
    // Poll only while the tab is visible: a hidden desktop must not keep the
    // daemon busy, and a hidden tab resumes with one immediate refresh.
    const timer = window.setInterval(() => {
      if (!document.hidden) void refreshLocalApps();
    }, 5000);
    const onVisible = () => {
      if (!document.hidden) void refreshLocalApps();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- capture real apps only when entering the tour
  }, [refreshLocalApps, legacyTour, locale]);

  useEffect(() => {
    if (onboardingVisible) return;
    const tick = () => { void automaticBackupTick().catch(() => undefined); };
    tick();
    const timer = window.setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [payload?.desktop.id, onboardingVisible]);

  // Auto-capture each running local app's own icon (its favicon) and persist the
  // bytes so the icon survives even when the app stops. The browser can't fetch
  // a localhost favicon directly (no CORS headers on most local apps), so the
  // /resolve-icon route does the CORS-free fetch and hands back the bytes. One
  // attempt per app per session.
  const resolvedLocalAppIconIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    // During onboarding/tour, localApps holds demo data — don't fire resolve
    // requests against ids the daemon doesn't know.
    if (onboardingVisible) return;
    const localAppsSource = desktopData().localApps;
    let cancelled = false;
    async function resolveLocalAppIcons() {
      let changed = false;
      for (const view of localApps) {
        if (cancelled) return;
        if (!view.status.running) continue;
        // Skip apps that already have an icon — either embedded at registration
        // (favicon kind) or uploaded (custom_local). Only fill iconless (fallback) ones.
        if (view.iconKind && view.iconKind !== "fallback") continue;
        if (resolvedLocalAppIconIdsRef.current.has(view.id)) continue;
        resolvedLocalAppIconIdsRef.current.add(view.id);
        try {
          const blob = await localAppsSource.resolveIcon(view.id);
          if (!blob) continue;
          await saveLocalAsset(`app:local-app:${view.id}:icon`, new File([blob], "icon", { type: blob.type }));
          await localAppsSource.update(view.id, { iconKind: "custom_local" });
          changed = true;
        } catch {
          // Resolve failed (app not truly up yet, no favicon) — leave as-is.
        }
      }
      if (changed && !cancelled) void refreshLocalApps();
    }
    void resolveLocalAppIcons();
    return () => {
      cancelled = true;
    };
  }, [localApps, refreshLocalApps, onboardingVisible]);

  // During the guided tour, swap to a curated demo payload so the user sees
  // example apps (not their real ones). Restore on dismiss.
  const realPayloadRef = useRef<DesktopPayload | null>(null);
  useEffect(() => {
    if (legacyTour && payload && !realPayloadRef.current) {
      realPayloadRef.current = payload;
      setPayload(makeDemoPayload(payload, locale));
    }
    if (!legacyTour && realPayloadRef.current) {
      void refreshDesktop();
      realPayloadRef.current = null;
    }
    // refreshDesktop only calls state setters; re-running this on every render would add nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacyTour, payload, locale]);

  /* ----- boot ----- */
  useEffect(() => {
    void boot();
  }, []);

  useEffect(() => {
    setClock(formatClock(new Date(), locale));
    const timer = window.setInterval(() => setClock(formatClock(new Date(), locale)), 30_000);
    return () => window.clearInterval(timer);
  }, [locale]);

  // After mount, swap in the real client-detected locale (browser language or stored pref).
  // SSR + first hydration both used "zh" (the default), so this is a normal state update — no mismatch.
  useEffect(() => {
    const detected = detectInitialLocale();
    if (detected !== "zh") {
      setLocale(detected);
    }
  }, []);

  useEffect(() => {
    persistLocale(locale);
    document.documentElement.lang = intlLocale(locale);
  }, [locale]);

  // Apply stored custom font + accent on mount (set via the settings panel).
  useEffect(() => {
    applyLocalStyleOverrides();
  }, []);

  useEffect(() => {
    function clearStaleDrag() {
      const dragging = dragRef.current;
      if (dragging && dragging.frame !== null) window.cancelAnimationFrame(dragging.frame);
      if (dragging) resetDraggedElement(dragging.element);
      dragRef.current = null;
      dragTargetRef.current = null;
      const target = dragTargetElementRef.current;
      if (target) delete target.dataset.active;
      setActiveDragAppId(null);
    }
    window.addEventListener("blur", clearStaleDrag);
    return () => window.removeEventListener("blur", clearStaleDrag);
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    setStartPageUrl(`${window.location.origin}/start`);
    setIsStandalone(isRunningStandalone());

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }
    function handleAppInstalled() {
      setInstallPrompt(null);
      setIsStandalone(true);
    }
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  // Keys for daemon-managed local-app icons stored in IndexedDB. Memoized so the
  // hydrate effect below doesn't refire on every 5s localApps poll — only when the
  // set of custom_local local apps actually changes.
  const localAppIconKeys = useMemo(
    () => localApps.filter((v) => v.iconKind === "custom_local").map((v) => `app:local-app:${v.id}:icon`),
    [localApps]
  );
  const localAssetKey = useMemo(
    () => (payload ? localAssetHydrationKey(payload, localAppIconKeys) : ""),
    [payload, localAppIconKeys]
  );
  useEffect(() => {
    if (!payload) return;
    void hydrateLocalAssetsFromPayload(payload, localAppIconKeys);
    // App movement changes payload twice (optimistic + saved response), but it
    // does not change the browser-local assets and must not remint the wallpaper.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localAssetKey]);

  useEffect(() => {
    writeLocalJson("vd:weather:city", weatherCity);
  }, [weatherCity]);

  useEffect(() => {
    writeLocalJson("vd:weather:reading", weather);
  }, [weather]);

  useEffect(() => {
    if (!desktopHasWeather) return;
    const query = weatherCity.trim();
    if (!query) {
      setWeatherStatus(t.weather.statusEnterCity);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadWeather(query, controller.signal), 650);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [desktopHasWeather, loadWeather, weatherCity, t.weather.statusEnterCity]);

  useEffect(() => {
    if (!payload || !localAppsLoaded || sessionRestored || onboardingVisible) return;
    // `?safe=1` boots without reopening the saved windows, a way out of any window that keeps failing.
    const safeMode = new URLSearchParams(window.location.search).has("safe");
    const saved = safeMode ? null : readLocalJson<unknown>(windowSessionKey, null);
    if (localAppsError) pendingLocalSession.current = saved;
    const restored = restoreWindows(saved, payload.desktop.id, displayApps, window.innerWidth, window.innerHeight);
    const startApp = payload.apps.find((app) => app.id === payload.desktop.startAppId);
    setWindows(restored);
    // Keep the existing start-app preference meaningful when restoring a session.
    if (startApp && !restored.some(item => item.app.id === startApp.id)) openApp(startApp);
    setSessionRestored(true);
  }, [payload, localAppsLoaded, sessionRestored, onboardingVisible, displayApps, localAppsError]);

  useEffect(() => {
    if (!sessionRestored || !payload || localAppsError || onboardingVisible || !pendingLocalSession.current) return;
    const localWindows = restoreWindows(pendingLocalSession.current, payload.desktop.id, displayApps, window.innerWidth, window.innerHeight)
      .filter(item => item.app.id.startsWith("local-app:"));
    pendingLocalSession.current = null;
    if (localWindows.length) setWindows(current => [...current, ...localWindows.filter(item => !current.some(existing => existing.app.id === item.app.id))]);
  }, [sessionRestored, payload, localAppsError, onboardingVisible, displayApps]);

  useEffect(() => {
    if (!sessionRestored || !payload || onboardingVisible) return;
    const current = windowSession(payload.desktop.id, windows);
    const previous = readLocalJson<ReturnType<typeof windowSession> | null>(windowSessionKey, null);
    if (localAppsError && previous?.desktopId === current.desktopId && Array.isArray(previous.windows)) {
      current.windows.push(...previous.windows.filter(item => typeof item?.appId === "string" && item.appId.startsWith("local-app:") && !current.windows.some(existing => existing.appId === item.appId)));
    }
    writeLocalJson(windowSessionKey, current);
  }, [windows, payload, sessionRestored, onboardingVisible, localAppsError]);

  useEffect(() => {
    if (!user || !payload) return;
    if (!readLocalJson(onboardingStorageKey, false)) setOnboardingVisible(true);
  }, [user, payload]);

  useEffect(() => {
    if (!payload) return;
    const appsMissingIcons = payload.apps.filter(shouldAutoResolveIcon).slice(0, 4);
    if (appsMissingIcons.length === 0) return;
    let cancelled = false;

    const source = desktopData();
    const urlMetadata = source.urlMetadata;

    async function resolveIcons() {
      for (const app of appsMissingIcons) {
        if (!app.url || cancelled) continue;
        try {
          const metadata = await urlMetadata.resolve(app.url);
          if (cancelled) continue;
          const iconUrl = metadata.iconCandidates[0];
          if (!iconUrl) continue;
          const next = await source.updateApp(app.id, { iconKind: "favicon", iconUrl });
          if (!cancelled) setPayload(next);
        } catch {
          // One unreadable site must not stop the rest.
        }
      }
    }
    void resolveIcons();
    return () => {
      cancelled = true;
    };
  }, [payload]);

  /* ----- session ----- */
  async function boot() {
    setLoading(true);
    setBootError("");
    try {
      await desktopData().describe();
      const currentUser = await desktopData().getUser();
      if (currentUser) {
        setUser(currentUser);
        setPayload(await desktopData().loadDesktop());
      } else {
        setUser(null);
        setPayload(null);
      }
    } catch (error) {
      setBootError(error instanceof DesktopDataError && error.code === "protocol_mismatch" ? "protocol_mismatch" : "unreachable");
      setUser(null);
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }

  async function refreshDesktop() {
    try {
      setPayload(await desktopData().loadDesktop());
    } catch {
      // Keep the desktop that is already on screen; a brief service hiccup is not a reason to blank it.
      setTileNotice(locale === "zh" ? "暂时无法刷新桌面，稍后会自动重试。" : "Could not refresh the desktop right now; it will retry.");
      window.setTimeout(() => setTileNotice(""), 5000);
    }
  }

  // Tracks the object URLs minted by the previous hydrate so we can revoke ones
  // that are no longer in use. loadLocalAsset never revokes, so without this each
  // hydrate would leak blob URLs.
  const hydratedAssetsRef = useRef<Record<string, string>>({});
  async function hydrateLocalAssetsFromPayload(nextPayload: DesktopPayload, localAppIconKeys: string[]) {
    const assets: Record<string, string> = {};
    let missingCustomWallpaper = false;
    // IndexedDB can be blocked or fail per key; a missing image falls back, it never aborts the desktop.
    const loadLocalAssetSafely = (key: string) => loadLocalAsset(key).catch(() => null);
    const wallpaperKey = `desktop:${nextPayload.desktop.id}:wallpaper`;
    const wallpaper = hydratedAssetsRef.current[wallpaperKey] ?? (await loadLocalAssetSafely(wallpaperKey));
    if (wallpaper) assets[wallpaperKey] = wallpaper;
    else if (nextPayload.desktop.wallpaperKind === "custom_local") missingCustomWallpaper = true;
    for (const app of nextPayload.apps) {
      if (app.iconKind !== "custom_local") continue;
      const key = `app:${app.id}:icon`;
      const icon = hydratedAssetsRef.current[key] ?? (await loadLocalAssetSafely(key));
      if (icon) assets[key] = icon;
    }
    // Uploaded icons for daemon-managed local apps. The IndexedDB key mirrors the
    // virtual desktop-app id (`local-app:<daemonId>`) so desktop-canvas's existing
    // `localAssets[`app:${app.id}:icon`]` lookup finds them with no change.
    for (const key of localAppIconKeys) {
      const icon = hydratedAssetsRef.current[key] ?? (await loadLocalAssetSafely(key));
      if (icon) assets[key] = icon;
    }
    const kept = new Set(Object.values(assets));
    const staleUrls = Object.values(hydratedAssetsRef.current).filter((url) => !kept.has(url));
    hydratedAssetsRef.current = assets;
    setLocalAssets(assets);
    // React may paint the previous state for one more frame. Revoking before
    // that commit is exactly what produced the black wallpaper flash.
    window.setTimeout(() => staleUrls.forEach((url) => URL.revokeObjectURL(url)), 1000);
    if (missingCustomWallpaper) {
      try {
        const restored = await desktopData().updateDesktop({
          wallpaperKind: "builtin",
          wallpaperBuiltinId: "noir-dawn",
          wallpaperFit: "cover"
        });
        setPayload(restored);
        setTileNotice(t.dialogs.wallpaperMissingRestored);
        window.setTimeout(() => setTileNotice(""), 5000);
      } catch {
        // Keep the built-in visual fallback even if persistence is temporarily unavailable.
      }
    }
  }

  function rememberLocalAsset(key: string, url: string): void {
    const previous = hydratedAssetsRef.current[key];
    hydratedAssetsRef.current = { ...hydratedAssetsRef.current, [key]: url };
    setLocalAssets((current) => ({ ...current, [key]: url }));
    if (previous && previous !== url) {
      window.setTimeout(() => URL.revokeObjectURL(previous), 1000);
    }
  }

  /* ----- window manager ----- */
  function openApp(app: DesktopApp) {
    setContextMenu(null);
    startTransition(() => {
      setWindows((current) => {
        const prepared = current.map((item) =>
          shellSurfacesConflict(app, item.app) ? { ...item, mode: "minimized" as const } : item
        );
        const existing = prepared.find((windowState) => windowState.app.id === app.id);
        const topZ = prepared.reduce((highest, item) => Math.max(highest, item.z), 10);
        if (existing) {
          return prepared.map((item) =>
            item.id === existing.id ? { ...item, z: topZ + 1, mode: "open" } : item
          );
        }
        const size = initialWindowSize(app);
        return [
          ...prepared,
          {
            id: crypto.randomUUID(),
            app,
            x: 160 + current.length * 26,
            y: 92 + current.length * 22,
            width: size.width,
            height: size.height,
            z: topZ + 1,
            mode: "open"
          }
        ];
      });
    });
  }

  function openUrlApp(input: { id: string; url: string; title: string }) {
    // Synthesize a transient DesktopApp with a stable id so repeated clicks
    // focus the same window instead of stacking new ones. It is not persisted
    // to the store — the daemon owns the local-app registry.
    const syntheticApp: DesktopApp = {
      id: `local-app:${input.id}`,
      desktopId: payload?.desktop.id ?? "",
      kind: "url",
      source: "directory",
      title: input.title,
      url: input.url,
      description: null,
      openingMode: "desktop_window",
      iconKind: "favicon",
      iconUrl: null,
      gridX: 0,
      gridY: 0,
      ...defaultTileFields,
      sortOrder: 0,
      metadata: {},
      createdAt: "",
      updatedAt: ""
    };
    openApp(syntheticApp);
  }

  function openCatalogTrial(input: { id: string; url: string; title: string; iconUrl: string }) {
    // Official online trials are temporary windows: opening one must not add a
    // desktop shortcut or alter the daemon-managed local application registry.
    const syntheticApp: DesktopApp = {
      id: `catalog-trial:${input.id}`,
      desktopId: payload?.desktop.id ?? "",
      kind: "url",
      source: "directory",
      title: input.title,
      url: input.url,
      description: null,
      openingMode: "desktop_window",
      iconKind: input.iconUrl ? "favicon" : "fallback",
      iconUrl: input.iconUrl || null,
      gridX: 0,
      gridY: 0,
      ...defaultTileFields,
      sortOrder: 0,
      metadata: { transientCatalogTrial: true },
      createdAt: "",
      updatedAt: ""
    };
    openApp(syntheticApp);
  }

  async function controlLocalApp(id: string, action: "start" | "stop" | "restart") {
    try {
      await runActivity(`${localApps.find(app => app.id === id)?.name || id} · ${action}`, async () => { await desktopData().localApps.control(id, action); await refreshLocalApps(); }, true);
    } catch (error) {
      setTileNotice(reasonFor(error) ?? (locale === "zh" ? "操作失败，请检查应用管理器后重试。" : "Action failed. Check the application manager and retry."));
      return false;
    }
    await refreshLocalApps();
    return true;
  }

  async function openLocalApp(view: LocalAppView) {
    if (!view.status.running) {
      if (!(await controlLocalApp(view.id, "start"))) return;
    }
    openUrlApp({ id: view.id, url: view.status.url, title: view.name });
  }

  // Single click respects the saved preference; double click explicitly opens a tab.
  function openInDesktop(app: DesktopApp) {
    const view = localAppViewById.get(app.id);
    if (app.openingMode === "external_tab" && app.url) openInBrowser(app);
    else if (view) void openLocalApp(view);
    else openApp(app);
  }

  function openInBrowser(app: DesktopApp) {
    const view = localAppViewById.get(app.id);
    const url = view?.status.url ?? app.url;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else openInDesktop(app);
  }

  function focusWindow(id: string) {
    setWindows((current) => {
      const topZ = current.reduce((highest, item) => Math.max(highest, item.z), 10);
      return current.map((item) => (item.id === id ? { ...item, z: topZ + 1, mode: "open" } : item));
    });
  }

  function patchWindow(id: string, updates: Partial<AppWindowState>) {
    setWindows((current) => current.map((item) => (item.id === id ? { ...item, ...updates } : item)));
  }

  function closeWindow(id: string) {
    setWindows((current) => current.filter((item) => item.id !== id));
  }

  function dismissOnboarding() {
    writeLocalJson(onboardingStorageKey, true);
    setOnboardingVisible(false);
  }

  async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
    if (!installPrompt) return "unavailable";
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "accepted") setIsStandalone(true);
    return choice.outcome;
  }

  /* ----- desktop drag ----- */
  async function resizeTile(app: DesktopApp, span: { columns: number; rows: number }) {
    setContextMenu(null);
    // Daemon-managed apps are virtual — not rows in the desktop store — so
    // their size lives in the same local layout map as their position.
    if (app.id.startsWith("local-app:")) {
      setLocalAppLayout((current) => {
        const previous = current[app.id] ?? { gridX: app.gridX, gridY: app.gridY };
        const next = { ...current, [app.id]: { ...previous, spanColumns: span.columns, spanRows: span.rows } };
        writeLocalJson("vd:local-app-layout", next);
        return next;
      });
      return;
    }
    try {
      setPayload(await desktopData().updateApp(app.id, { spanColumns: span.columns, spanRows: span.rows }));
    } catch (error) {
      // The rule names the reason (unsupported size / overlap); show it briefly
      // instead of silently reverting. A failure with no authored reason (offline,
      // a 500) falls back to our own copy rather than leaking a status line.
      setTileNotice(reasonFor(error) ?? t.contextMenu.tileSizeRejected);
      window.setTimeout(() => setTileNotice(""), 4000);
    }
  }

  function optimisticallyMoveApp(appId: string, gridX: number, gridY: number) {
    setPayload((current) => {
      if (!current) return current;
      return {
        ...current,
        apps: current.apps.map((app) => (app.id === appId ? { ...app, gridX, gridY } : app))
      };
    });
  }

  async function saveAppPosition(app: DesktopApp, gridX: number, gridY: number) {
    try {
      setPayload(await desktopData().updateApp(app.id, { gridX, gridY }));
    } catch {
      // The optimistic move stands. Rolling it back is deliberately not done
      // here — see the task design; a failed save keeps the icon where the user
      // dropped it until the next full desktop load.
    }
  }

  // Local-app icons aren't in the store; their drag positions live in localStorage
  // so they survive polls and reloads without daemon round-trips.
  function optimisticallyMoveLocalApp(appId: string, gridX: number, gridY: number) {
    setLocalAppLayout((current) => ({ ...current, [appId]: { gridX, gridY } }));
  }

  function saveLocalAppLayout(appId: string, gridX: number, gridY: number) {
    setLocalAppLayout((current) => {
      const next = { ...current, [appId]: { gridX, gridY } };
      writeLocalJson("vd:local-app-layout", next);
      return next;
    });
  }

  function scheduleDragFrame(dragging: DesktopDragState) {
    if (dragging.frame !== null) return;
    dragging.frame = window.requestAnimationFrame(() => {
      dragging.frame = null;
      if (dragRef.current !== dragging || !dragging.active) return;
      const x = dragging.latestX - dragging.startX;
      const y = dragging.latestY - dragging.startY;
      dragging.element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    });
  }

  function updateDragTarget(nextTarget: DesktopDragTarget | null) {
    const current = dragTargetRef.current;
    if (
      current?.gridX === nextTarget?.gridX &&
      current?.gridY === nextTarget?.gridY &&
      current?.desiredGridX === nextTarget?.desiredGridX &&
      current?.desiredGridY === nextTarget?.desiredGridY &&
      current?.span.columns === nextTarget?.span.columns &&
      current?.span.rows === nextTarget?.span.rows &&
      current?.adjusted === nextTarget?.adjusted
    ) {
      return;
    }
    dragTargetRef.current = nextTarget;
    const element = dragTargetElementRef.current;
    if (!element) return;
    if (!nextTarget) {
      delete element.dataset.active;
      delete element.dataset.adjusted;
      delete element.dataset.widget;
      return;
    }
    const metrics = currentDesktopGridLayout().metrics;
    const width = nextTarget.span.columns === 1 ? 88 : nextTarget.span.columns * metrics.cellWidth;
    const height = nextTarget.span.rows === 1 ? 96 : nextTarget.span.rows * metrics.cellHeight;
    const x = metrics.desktopInset + nextTarget.gridX * metrics.cellWidth;
    const y = metrics.desktopInset + nextTarget.gridY * metrics.cellHeight;
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
    element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    element.dataset.active = "true";
    element.dataset.adjusted = String(nextTarget.adjusted);
    element.dataset.widget = String(nextTarget.span.columns > 1 || nextTarget.span.rows > 1);
  }

  function clearDragState(options: { keepTransformForFrame?: boolean } = {}) {
    const dragging = dragRef.current;
    if (!dragging) {
      setActiveDragAppId(null);
      updateDragTarget(null);
      return;
    }
    if (dragging.frame !== null) window.cancelAnimationFrame(dragging.frame);
    dragRef.current = null;
    updateDragTarget(null);

    if (options.keepTransformForFrame) {
      window.requestAnimationFrame(() => {
        resetDraggedElement(dragging.element);
        setActiveDragAppId(null);
      });
      return;
    }
    resetDraggedElement(dragging.element);
    setActiveDragAppId(null);
  }

  async function autoArrange() {
    if (!payload) return;
    let nextPayload = payload;
    const positions = autoArrangeDesktopApps(payload.apps, currentDesktopGridLayout().columns);
    const source = desktopData();
    for (const app of payload.apps) {
      const position = positions.get(app.id);
      if (!position) continue;
      try {
        nextPayload = await source.updateApp(app.id, { gridX: position.gridX, gridY: position.gridY });
      } catch {
        // Keep arranging the rest; the last successful payload wins.
      }
    }
    setPayload(nextPayload);
    setContextMenu(null);
  }

  async function removeApp(app: DesktopApp) {
    try {
      setPayload(await desktopData().deleteApp(app.id));
    } catch {
      // Nothing removed; the desktop is unchanged.
    }
    setContextMenu(null);
  }

  function clientPointToIconPlane(clientX: number, clientY: number): { x: number; y: number } {
    const iconPlane = iconPlaneRef.current;
    if (!iconPlane) return { x: clientX, y: clientY };
    const bounds = iconPlane.getBoundingClientRect();
    return { x: clientX - bounds.left + iconPlane.scrollLeft, y: clientY - bounds.top + iconPlane.scrollTop };
  }

  function currentDesktopGridLayout() {
    const iconPlane = iconPlaneRef.current;
    const metrics = desktopCellMetrics();
    if (!iconPlane) {
      return { columns: desktopGridMinColumns, metrics, fitted: false };
    }
    const visibleWidth = iconPlane.clientWidth || iconPlane.getBoundingClientRect().width;
    return desktopGridLayoutForWidth(visibleWidth, metrics, desktopIconPaintWidth());
  }

  function resolveDragTarget(app: DesktopApp, planeX: number, planeY: number): DesktopDragTarget | null {
    if (!payload) return null;
    const span = desktopGridSpanForApp(app);
    const layout = currentDesktopGridLayout();
    const gridColumns = layout.columns;
    const desired = pointToGridPosition(planeX, planeY, span, gridColumns, layout.metrics);
    const visiblePositions = layoutDesktopAppsForViewport(displayApps, gridColumns);
    const taken = occupiedGridCellsForApps(displayApps, app.id, visiblePositions);
    const maxRows = Math.max(
      48,
      desired.gridY + 24,
      ...displayApps.map((item) => {
        const position = visiblePositions.get(item.id) ?? item;
        return position.gridY + desktopGridSpanForApp(item).rows + 24;
      })
    );
    const target = gridSpanIsFree(taken, desired.gridX, desired.gridY, span)
      ? desired
      : nearestOpenGridSpanPosition(taken, desired, span, gridColumns, maxRows);

    return {
      ...target,
      desiredGridX: desired.gridX,
      desiredGridY: desired.gridY,
      span,
      adjusted: target.gridX !== desired.gridX || target.gridY !== desired.gridY
    };
  }

  /* ----- render ----- */
  if (loading) {
    return <BootScreen message={t.app.loading} />;
  }

  if (!user || !payload) {
    const bootMessage = bootError === "protocol_mismatch"
      ? (locale === "zh" ? "桌面与本地服务版本不兼容，请使用同一发行版后重试。" : "Desktop and local service versions are incompatible. Use a matching release and retry.")
      : bootError === "unreachable"
        ? (locale === "zh" ? "无法连接桌面服务，请检查服务后重试。" : "Could not connect to the desktop service. Check the service and retry.")
        : (locale === "zh" ? "桌面数据不可用。" : "Desktop data is unavailable.");
    return <div className="boot-screen"><p role="alert">{bootMessage}</p><button onClick={() => void boot()}>{locale === "zh" ? "重试连接" : "Retry connection"}</button></div>;
  }

  const desktopStyle = resolveDesktopStyle(payload, localAssets[`desktop:${payload.desktop.id}:wallpaper`]);

  const renderWindowContent = (windowState: AppWindowState) => (
        <WindowErrorBoundary
          key={windowState.id}
          locale={locale}
          title={displayAppTitle(windowState.app, t)}
          onClose={() => closeWindow(windowState.id)}
        >
          <WindowContent
            app={windowState.app}
            locale={locale}
            t={t}
            weatherCity={weatherCity}
            weather={weather}
            weatherStatus={weatherStatus}
            onWeatherCityChange={setWeatherCity}
            onWeatherRefresh={() => loadWeather(weatherCity.trim())}
            onAddDirectoryApp={async (id) => {
              setPayload(await desktopData().addCatalogApp(id));
            }}
            onOpenCatalogTrial={openCatalogTrial}
            onOpenLocalApps={() => {
              const localAppsEntry = payload.apps.find(isLocalAppsApp);
              if (localAppsEntry) openInDesktop(localAppsEntry);
            }}
            localApps={localApps}
            onRefreshLocalApps={refreshLocalApps}
            onControlLocalApp={async (id, action) => { if (!(await controlLocalApp(id, action))) throw new Error(locale === "zh" ? "操作失败，请查看任务通知。" : "Action failed; check Activity."); }}
            onOpenUrlApp={openUrlApp}
            payload={payload}
            startPageUrl={startPageUrl}
            canPromptInstall={Boolean(installPrompt)}
            isStandalone={isStandalone}
            onInstall={promptInstall}
            onShowOnboarding={() => setOnboardingVisible(true)}
            onLocaleChange={setLocale}
            onPayloadUpdated={(nextPayload) => {
              setPayload(nextPayload);
              setWindows((current) =>
                current.map((item) => {
                  const updatedApp = nextPayload.apps.find((app) => app.id === item.app.id);
                  return updatedApp ? { ...item, app: updatedApp } : item;
                })
              );
            }}
          />
        </WindowErrorBoundary>
  );
  const packageCommands: DesktopShellCommands = {
    open: id => { const app = displayApps.find(a => a.id === id); if (app) openInDesktop(app); },
    external: id => { const app = displayApps.find(a => a.id === id); if (app) openInBrowser(app); },
    focus: focusWindow,
    patch: (id, patch) => patchWindow(id, normalizeWindowPatch(patch)),
    close: id => {
      const item = windows.find(w => w.id === id);
      if (item?.app.id.startsWith("local-app:")) setCloseConfirm({ windowId: id, daemonId: item.app.id.slice(10), name: item.app.title });
      else closeWindow(id);
    },
    addApp: () => setAddOpen(true),
    editApp: id => { const app = displayApps.find(a => a.id === id); if (app) setEditingApp(app); },
    removeApp: id => { const app = displayApps.find(a => a.id === id); if (app) void removeApp(app); },
    arrangeApps: autoArrange,
    moveApp: (id, x, y) => { const app = displayApps.find(a => a.id === id); if (!app || !Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x < 0 || y < 0) return; if (isLocalApp(app)) saveLocalAppLayout(id, x, y); else void saveAppPosition(app, x, y); },
    wallpaper: () => setWallpaperOpen(true),
    managePackages: () => setPackageManagerOpen(true),
    workspace: panel => { if (["windows", "scenes", "organize", "activity"].includes(panel)) setWorkspaceRequest({ panel }); },
    notify: setTileNotice,
  };

  return (
    <main
      className={`${desktopStyle.className}${packageId !== "classic" ? " has-desktop-package" : ""}`}
      style={desktopStyle.style}
      {...desktopStyle.dataAttributes}
      tabIndex={0}
      aria-label={t.app.desktopAria}
      onClick={() => setContextMenu(null)}
      onContextMenu={(event) => {
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        setContextMenu({ kind: "desktop", x: event.clientX, y: event.clientY });
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
        event.preventDefault();
        const bounds = event.currentTarget.getBoundingClientRect();
        setContextMenu({ kind: "desktop", x: bounds.left + 32, y: bounds.top + 88 });
      }}
      onPointerMove={(event) => {
        const dragging = dragRef.current;
        if (!dragging || event.pointerId !== dragging.pointerId) return;

        const movedFarEnough =
          dragging.active ||
          Math.hypot(event.clientX - dragging.originX, event.clientY - dragging.originY) >= dragStartThreshold;
        if (!movedFarEnough) return;

        const nextPoint = clientPointToIconPlane(event.clientX, event.clientY);
        dragging.latestX = nextPoint.x - dragging.offsetX;
        dragging.latestY = nextPoint.y - dragging.offsetY;

        if (!dragging.active) {
          dragging.active = true;
          dragging.element.classList.add("is-dragging");
          setActiveDragAppId(dragging.app.id);
        }
        updateDragTarget(resolveDragTarget(dragging.app, dragging.latestX, dragging.latestY));
        scheduleDragFrame(dragging);
      }}
      onPointerUp={(event) => {
        const dragging = dragRef.current;
        if (!dragging || event.pointerId !== dragging.pointerId) {
          clearDragState();
          return;
        }
        const completedDrag = dragging;
        const movedFarEnough =
          completedDrag.active ||
          Math.hypot(event.clientX - completedDrag.originX, event.clientY - completedDrag.originY) >= dragStartThreshold;
        if (!movedFarEnough || !iconPlaneRef.current) {
          clearDragState();
          return;
        }
        suppressClickRef.current = true; // a real drag just ended — swallow the resulting click
        const finalPoint = clientPointToIconPlane(event.clientX, event.clientY);
        const finalX = finalPoint.x - completedDrag.offsetX;
        const finalY = finalPoint.y - completedDrag.offsetY;
        const target = resolveDragTarget(completedDrag.app, finalX, finalY);
        if (!target) {
          clearDragState();
          return;
        }
        const { gridX, gridY } = target;
        const metrics = currentDesktopGridLayout().metrics;
        const snappedX = metrics.desktopInset + gridX * metrics.cellWidth;
        const snappedY = metrics.desktopInset + gridY * metrics.cellHeight;
        completedDrag.element.style.transform = `translate3d(${snappedX - completedDrag.startX}px, ${
          snappedY - completedDrag.startY
        }px, 0)`;
        const draggedIsLocal = isLocalApp(completedDrag.app);
        flushSync(() => {
          if (draggedIsLocal) optimisticallyMoveLocalApp(completedDrag.app.id, gridX, gridY);
          else optimisticallyMoveApp(completedDrag.app.id, gridX, gridY);
        });
        clearDragState({ keepTransformForFrame: true });
        if (draggedIsLocal) saveLocalAppLayout(completedDrag.app.id, gridX, gridY);
        else void saveAppPosition(completedDrag.app, gridX, gridY);
      }}
      onPointerCancel={(event) => {
        const dragging = dragRef.current;
        if (!dragging || event.pointerId === dragging.pointerId) clearDragState();
      }}
    >
      <CatalogActivity />
      <ProductivityBar hiddenToolbar={packageId !== "classic"} request={workspaceRequest} apps={displayApps} payload={payload} windows={windows} t={t} zh={locale === "zh"}
        onOpen={openInDesktop} onWindows={setWindows} onPayload={setPayload} onFilter={setFilteredIds}
        onPrepareScene={async apps => {
          for (const app of apps) {
            const local = localAppViewById.get(app.id);
            if (local && !local.status.running && !(await controlLocalApp(local.id, "start"))) throw new Error(locale === "zh" ? `无法启动 ${local.name}，请查看任务通知。` : `Could not start ${local.name}; check Activity.`);
          }
        }}
        onCloseWindow={id => {
          const item = windows.find(w => w.id === id);
          if (item?.app.id.startsWith("local-app:")) setCloseConfirm({ windowId: id, daemonId: item.app.id.slice(10), name: item.app.title });
          else closeWindow(id);
        }} />

      {packageId === "classic" ? <>
      <div className="desktop-brand">
        <span>Vibe Desktop</span>
        <strong>{t.app.personalWebDesktop}</strong>
      </div>

      <DesktopCanvas
        apps={filteredIds ? displayApps.filter(app => filteredIds.includes(app.id)) : displayApps}
        localAssets={localAssets}
        activeDragAppId={activeDragAppId}
        dragTargetElementRef={dragTargetElementRef}
        weatherCity={weatherCity}
        weather={weather}
        weatherStatus={weatherStatus}
        t={t}
        statusByApp={statusByApp}
        onTileResize={(app, span) => void resizeTile(app, span)}
        localAppViewById={localAppViewById}
        onLocalAppControl={(view, action) => void controlLocalApp(view.id, action)}
        iconPlaneRef={iconPlaneRef}
        onIconPointerDown={(event, app) => {
          if (event.button !== 0) return;
          suppressClickRef.current = false;
          clearDragState();
          const target = event.currentTarget.getBoundingClientRect();
          const targetPoint = clientPointToIconPlane(target.left, target.top);
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // Synthetic events in tests may not have an active pointer capture target.
          }
          dragRef.current = {
            app,
            pointerId: event.pointerId,
            element: event.currentTarget,
            offsetX: event.clientX - target.left,
            offsetY: event.clientY - target.top,
            originX: event.clientX,
            originY: event.clientY,
            startX: targetPoint.x,
            startY: targetPoint.y,
            latestX: targetPoint.x,
            latestY: targetPoint.y,
            active: false,
            frame: null
          };
        }}
        onIconDoubleClick={(app) => {
          if (clickTimerRef.current !== null) {
            window.clearTimeout(clickTimerRef.current);
            clickTimerRef.current = null;
          }
          openInBrowser(app);
        }}
        onIconContextMenu={(event, app) => {
          event.preventDefault();
          event.stopPropagation();
          const view = localAppViewById.get(app.id);
          if (view) {
            setContextMenu({ kind: "local-app", x: event.clientX, y: event.clientY, app: view, projected: app });
          } else {
            setContextMenu({ kind: "app", x: event.clientX, y: event.clientY, app });
          }
        }}
        onIconClick={(event, app) => {
          event.stopPropagation();
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
          clickTimerRef.current = window.setTimeout(() => {
            clickTimerRef.current = null;
            openInDesktop(app);
          }, 220);
        }}
      />

      {windows.map((windowState) => (
        <DesktopWindow
          key={windowState.id}
          state={{ ...windowState, z: windowStack.get(windowState.id) ?? 10 }}
          onFocus={() => focusWindow(windowState.id)}
          onPatch={(updates) => patchWindow(windowState.id, updates)}
          onClose={() => {
            if (windowState.app.id.startsWith("local-app:")) {
              setCloseConfirm({
                windowId: windowState.id,
                daemonId: windowState.app.id.slice("local-app:".length),
                name: windowState.app.title
              });
            } else {
              closeWindow(windowState.id);
            }
          }}
          t={t}
        >
          {renderWindowContent(windowState)}
        </DesktopWindow>
      ))}


      </> : <PackageShell packageId={packageId}
        snapshot={{ desktopAppIds: filteredIds ?? undefined, apps: displayApps.map(app => ({ ...app, label: displayAppTitle(app, t), imageUrl: app.iconKind === "builtin" ? undefined : iconImageCandidates(app, localAssets[`app:${app.id}:icon`])[0], running: statusByApp[app.id] === "running" })), windows, locale, clock, userName: user.displayName || "Vibe", localService: !localAppsLoaded ? "checking" : localAppsError ? "unavailable" : "connected", wallpaper: payload.desktop.wallpaperKind === "custom_local" ? desktopStyle.style.backgroundImage as string : null }}
        commands={packageCommands} renderWindow={id => { const state = windows.find(w => w.id === id); return state ? renderWindowContent(state) : null; }} />}
      {packageManagerOpen ? <PackageManager selected={packageId} onSelect={selectPackage} onClose={() => setPackageManagerOpen(false)} /> : null}
      {tileNotice || (localAppsError && packageId === "classic") ? (
        <div className="tile-notice" role="alert">
          <span>{tileNotice || (localAppsError === "daemon_unreachable" ? (locale === "zh" ? "暂时无法连接本地应用管理器。已保留最后的应用列表。" : "The local application manager is unreachable. Your last app list is preserved.") : localAppsError)}</span>{" "}
          <button type="button" onClick={() => { setTileNotice(""); void refreshLocalApps(); }}>
            {locale === "zh" ? "重试连接" : "Retry connection"}
          </button>{" "}
          {tileNotice ? <button type="button" onClick={() => setTileNotice("")}>{locale === "zh" ? "关闭" : "Dismiss"}</button> : null}
        </div>
      ) : null}

      {contextMenu ? (
        <ContextMenu
          state={contextMenu}
          t={t}
          onResize={(app, span) => void resizeTile(app, span)}
          onDismiss={() => setContextMenu(null)}
          onAdd={() => {
            setAddOpen(true);
            setContextMenu(null);
          }}
          onAutoArrange={autoArrange}
          onWallpaper={() => {
            setWallpaperOpen(true);
            setContextMenu(null);
          }}
          onOpen={openInDesktop}
          onOpenLocalApp={(view) => {
            void openLocalApp(view);
            setContextMenu(null);
          }}
          onToggleLocalApp={(view) => {
            void controlLocalApp(view.id, view.status.running ? "stop" : "start");
            setContextMenu(null);
          }}
          onEdit={(app) => {
            setEditingApp(app);
            setContextMenu(null);
          }}
          onRemove={removeApp}
        />
      ) : null}

      {packageId === "classic" ? <>
      <Dock
        user={user}
        clock={clock}
        windows={windows}
        t={t}
        onAdd={() => setAddOpen(true)}
        onFocus={focusWindow}
      />
      <div className="apps-rail-region">
        <aside className="apps-rail">
          <header>
            <span className="apps-rail-count">{localApps.filter((a) => a.status.running).length}</span>
            <span>{t.dock.runningApps}</span>
          </header>
          {localApps.length === 0 ? (
            <p className="apps-rail-empty">—</p>
          ) : (
            <ul className="apps-rail-list">
              {[...localApps]
                .sort((a, b) => Number(b.status.running) - Number(a.status.running))
                .map((view) => {
                  const status = localAppStatus(view);
                  return (
                    <li key={view.id} className={`apps-rail-item is-${status}`}>
                      <span className={`apps-rail-dot is-${status}`} aria-hidden="true" />
                      <span className="apps-rail-name">{view.name}</span>
                      <span className="apps-rail-port">:{view.port}</span>
                      <button
                        type="button"
                        className="apps-rail-toggle"
                        onClick={() => void controlLocalApp(view.id, view.status.running ? "stop" : "start")}
                        aria-label={view.status.running ? t.contextMenu.stop : t.contextMenu.start}
                        title={view.status.running ? t.contextMenu.stop : t.contextMenu.start}
                      >
                        {view.status.running ? "■" : "▶"}
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}
        </aside>
        <div className="apps-rail-handle" aria-hidden="true" />
      </div>

      </> : null}

      {onboardingVisible ? (
        packageId === "classic" ? <TourOverlay locale={locale} onDone={dismissOnboarding} /> : <DesktopOnboarding selected={packageId} onSelect={selectPackage} onDone={dismissOnboarding} />
      ) : null}

      {addOpen ? (
        <AddAppDialog
          t={t}
          onClose={() => setAddOpen(false)}
          onSaved={(next, localIcon) => {
            setPayload(next);
            if (localIcon) {
              rememberLocalAsset(`app:${localIcon.appId}:icon`, localIcon.url);
            }
            setAddOpen(false);
          }}
        />
      ) : null}

      {marketRequest ? (
        <MarketInstallDialog
          key={`${marketRequest.repository}@${marketRequest.ref ?? "HEAD"}`}
          repository={marketRequest.repository}
          gitRef={marketRequest.ref}
          t={t}
          onClose={() => setMarketRequest(null)}
          onInstalled={() => void refreshLocalApps()}
          onOpen={(status) => {
            setMarketRequest(null);
            if (status.appId && status.url) openUrlApp({ id: status.appId, url: status.url, title: status.name });
          }}
        />
      ) : null}

      {editingApp ? (
        <EditAppDialog
          app={editingApp}
          t={t}
          onClose={() => setEditingApp(null)}
          onSaved={(next) => {
            setPayload(next);
            setEditingApp(null);
          }}
          onLocalIcon={async (file) => {
            const url = await saveLocalAsset(`app:${editingApp.id}:icon`, file);
            rememberLocalAsset(`app:${editingApp.id}:icon`, url);
          }}
        />
      ) : null}

      {wallpaperOpen ? (
        <WallpaperDialog
          payload={payload}
          t={t}
          onClose={() => setWallpaperOpen(false)}
          onSaved={(next) => setPayload(next)}
          onLocalWallpaper={async (file) => {
            const url = await saveLocalAsset(`desktop:${payload.desktop.id}:wallpaper`, file);
            rememberLocalAsset(`desktop:${payload.desktop.id}:wallpaper`, url);
          }}
          localWallpaper={localAssets[`desktop:${payload.desktop.id}:wallpaper`]}
        />
      ) : null}
      {closeConfirm ? (
        <div className="close-confirm-overlay" onClick={() => setCloseConfirm(null)}>
          <div className="close-confirm-dialog" onClick={(event) => event.stopPropagation()}>
            <strong>{closeConfirm.name}</strong>
            <p>{t.window.closeQuestion}</p>
            <div className="close-confirm-actions">
              <button
                className="ghost"
                onClick={() => setCloseConfirm(null)}
              >
                {t.window.cancel}
              </button>
              <button
                onClick={() => {
                  patchWindow(closeConfirm.windowId, { mode: "minimized" });
                  setCloseConfirm(null);
                }}
              >
                {t.window.minimizeKeepRunning}
              </button>
              <button
                className="danger"
                onClick={() => {
                  void controlLocalApp(closeConfirm.daemonId, "stop");
                  closeWindow(closeConfirm.windowId);
                  setCloseConfirm(null);
                }}
              >
                {t.window.quitApp}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
