"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { DesktopApp, DesktopPayload, LocalAppView, VibeUser } from "@/lib/contracts";
import { loadLocalAsset, saveLocalAsset } from "@/lib/browser-local-assets";
import { desktopData, reasonFor } from "@/lib/desktop-data";
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
  isLocalApp,
  isRunningStandalone,
  isWeatherApp,
  layoutDesktopAppsForViewport,
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

import { BootScreen } from "@/components/chrome/boot-screen";
import { ContextMenu, type ContextMenuState } from "@/components/chrome/context-menu";
import { TourOverlay } from "@/components/chrome/tour-overlay";
import { demoLocalApps, makeDemoPayload } from "@/components/chrome/tour-demo-data";
import { DesktopCanvas, type DesktopDragTarget } from "@/components/desktop/desktop-canvas";
import { Dock } from "@/components/dock/dock";
import { DesktopWindow, type AppWindowState } from "@/components/window/desktop-window";
import { WindowContent } from "@/components/window/window-content";
import { AddAppDialog } from "@/components/dialogs/add-app-dialog";
import { EditAppDialog } from "@/components/dialogs/edit-app-dialog";
import { WallpaperDialog } from "@/components/dialogs/wallpaper-dialog";

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
  const autoOpenedStartRef = useRef<string | null>(null);
  const dragRef = useRef<DesktopDragState | null>(null);
  const dragTargetRef = useRef<DesktopDragTarget | null>(null);
  // Click-vs-double-click disambiguation: single click opens embedded (after a
  // short delay so a following double-click can cancel it and open external instead).
  const clickTimerRef = useRef<number | null>(null);
  // A just-completed drag would otherwise emit a click and open the app — suppress it.
  const suppressClickRef = useRef(false);

  const [user, setUser] = useState<VibeUser | null>(null);
  const [payload, setPayload] = useState<DesktopPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [windows, setWindows] = useState<AppWindowState[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<DesktopApp | null>(null);
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const [closeConfirm, setCloseConfirm] = useState<{
    windowId: string;
    daemonId: string;
    name: string;
  } | null>(null);
  const [onboardingVisible, setOnboardingVisible] = useState(false);
  const [activeDragAppId, setActiveDragAppId] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<DesktopDragTarget | null>(null);
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
  const [localAppLayout, setLocalAppLayout] = useState<
    Record<string, { gridX: number; gridY: number; spanColumns?: number; spanRows?: number }>
  >(() => readLocalJson("vd:local-app-layout", {}));
  const [tileNotice, setTileNotice] = useState("");

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

  const refreshLocalApps = useCallback(async () => {
    const localAppsSource = desktopData().localApps;
    // Absent in the online trial: there is no machine to manage, so there are no
    // local-app icons either.
    if (!localAppsSource) {
      setLocalApps([]);
      return;
    }
    try {
      setLocalApps(await localAppsSource.list());
    } catch {
      // Daemon down / unreachable — clear the icons rather than show stale state.
      setLocalApps([]);
    }
  }, []);

  useEffect(() => {
    if (onboardingVisible) {
      setLocalApps(demoLocalApps(locale));
      return;
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
  }, [refreshLocalApps, onboardingVisible, locale]);

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
    if (!localAppsSource) return;
    let cancelled = false;
    async function resolveLocalAppIcons() {
      if (!localAppsSource) return;
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
    if (onboardingVisible && payload && !realPayloadRef.current) {
      realPayloadRef.current = payload;
      setPayload(makeDemoPayload(payload, locale));
    }
    if (!onboardingVisible && realPayloadRef.current) {
      void refreshDesktop();
      realPayloadRef.current = null;
    }
  }, [onboardingVisible, payload, locale]);

  /* ----- boot ----- */
  useEffect(() => {
    void boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setActiveDragAppId(null);
      setDragTarget(null);
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
  useEffect(() => {
    if (!payload) return;
    void hydrateLocalAssetsFromPayload(payload, localAppIconKeys);
  }, [payload, localAppIconKeys]);

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
    if (!payload?.desktop.startAppId) return;
    const startApp = payload.apps.find((app) => app.id === payload.desktop.startAppId);
    if (!startApp) return;
    const autoOpenKey = `${payload.desktop.id}:${startApp.id}`;
    if (autoOpenedStartRef.current === autoOpenKey) return;
    autoOpenedStartRef.current = autoOpenKey;
    openApp(startApp);
  }, [payload]); // openApp intentionally omitted — guarded by autoOpenedStartRef

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
    // Auto-filling a missing icon means reading the site, which is a server-side
    // fetch. Without it (the online trial) the fallback initials stand.
    if (!urlMetadata) return;

    async function resolveIcons() {
      if (!urlMetadata) return;
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
    try {
      const currentUser = await desktopData().getUser();
      if (currentUser) {
        setUser(currentUser);
        await refreshDesktop();
      } else {
        setUser(null);
        setPayload(null);
      }
    } catch {
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
      setPayload(null);
    }
  }

  // Tracks the object URLs minted by the previous hydrate so we can revoke ones
  // that are no longer in use. loadLocalAsset never revokes, so without this each
  // hydrate would leak blob URLs.
  const hydratedAssetsRef = useRef<Record<string, string>>({});
  async function hydrateLocalAssetsFromPayload(nextPayload: DesktopPayload, localAppIconKeys: string[]) {
    const assets: Record<string, string> = {};
    if (nextPayload.desktop.wallpaperKind === "custom_local") {
      const wallpaper = await loadLocalAsset(`desktop:${nextPayload.desktop.id}:wallpaper`);
      if (wallpaper) assets[`desktop:${nextPayload.desktop.id}:wallpaper`] = wallpaper;
    }
    for (const app of nextPayload.apps) {
      if (app.iconKind !== "custom_local") continue;
      const icon = await loadLocalAsset(`app:${app.id}:icon`);
      if (icon) assets[`app:${app.id}:icon`] = icon;
    }
    // Uploaded icons for daemon-managed local apps. The IndexedDB key mirrors the
    // virtual desktop-app id (`local-app:<daemonId>`) so desktop-canvas's existing
    // `localAssets[`app:${app.id}:icon`]` lookup finds them with no change.
    for (const key of localAppIconKeys) {
      const icon = await loadLocalAsset(key);
      if (icon) assets[key] = icon;
    }
    const kept = new Set(Object.values(assets));
    Object.values(hydratedAssetsRef.current).forEach((url) => {
      if (!kept.has(url)) URL.revokeObjectURL(url);
    });
    hydratedAssetsRef.current = assets;
    setLocalAssets(assets);
  }

  /* ----- window manager ----- */
  function openApp(app: DesktopApp) {
    setContextMenu(null);
    startTransition(() => {
      setWindows((current) => {
        const existing = current.find((windowState) => windowState.app.id === app.id);
        const topZ = current.reduce((highest, item) => Math.max(highest, item.z), 10);
        if (existing) {
          return current.map((item) =>
            item.id === existing.id ? { ...item, z: topZ + 1, mode: "open" } : item
          );
        }
        const size = initialWindowSize(app);
        return [
          ...current,
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

  async function controlLocalApp(id: string, action: "start" | "stop" | "restart") {
    try {
      await desktopData().localApps?.control(id, action);
    } catch {
      // daemon unreachable — the status poll will catch up
    }
    await refreshLocalApps();
  }

  async function openLocalApp(view: LocalAppView) {
    if (!view.status.running) {
      await controlLocalApp(view.id, "start");
    }
    openUrlApp({ id: view.id, url: view.status.url, title: view.name });
  }

  // Desktop gesture contract: a single click always opens inside Vibe Desktop.
  // A double click is the explicit browser-tab shortcut, regardless of the
  // legacy openingMode value stored on older app records.
  function openInDesktop(app: DesktopApp) {
    const view = localAppViewById.get(app.id);
    if (view) void openLocalApp(view);
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
    setDragTarget(nextTarget);
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
    return <BootScreen message={t.app.loading} />;
  }

  const desktopStyle = resolveDesktopStyle(payload, localAssets[`desktop:${payload.desktop.id}:wallpaper`]);

  return (
    <main
      className={`${desktopStyle.className} ${activeDragAppId ? "is-dragging-desktop" : ""}`}
      style={desktopStyle.style}
      {...desktopStyle.dataAttributes}
      onClick={() => setContextMenu(null)}
      onContextMenu={(event) => {
        event.preventDefault();
        setContextMenu({ kind: "desktop", x: event.clientX, y: event.clientY });
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
      <div className="desktop-brand">
        <span>Vibe Desktop</span>
        <strong>{t.app.personalWebDesktop}</strong>
      </div>

      <DesktopCanvas
        apps={displayApps}
        localAssets={localAssets}
        activeDragAppId={activeDragAppId}
        dragTarget={dragTarget}
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
          state={windowState}
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
            localApps={localApps}
            onRefreshLocalApps={refreshLocalApps}
            onControlLocalApp={controlLocalApp}
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
        </DesktopWindow>
      ))}

      {tileNotice ? (
        <output className="tile-notice" role="status">
          {tileNotice}
        </output>
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

      {onboardingVisible ? (
        <TourOverlay locale={locale} onDone={dismissOnboarding} />
      ) : null}

      {addOpen ? (
        <AddAppDialog
          t={t}
          onClose={() => setAddOpen(false)}
          onSaved={(next, localIcon) => {
            setPayload(next);
            if (localIcon) {
              setLocalAssets((current) => ({ ...current, [`app:${localIcon.appId}:icon`]: localIcon.url }));
            }
            setAddOpen(false);
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
            setLocalAssets((current) => ({ ...current, [`app:${editingApp.id}:icon`]: url }));
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
            setLocalAssets((current) => ({ ...current, [`desktop:${payload.desktop.id}:wallpaper`]: url }));
          }}
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
