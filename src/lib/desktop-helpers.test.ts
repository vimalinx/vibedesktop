import { describe, expect, it, vi } from "vitest";
import {
  desktopCellMetrics,
  desktopGridLayoutForWidth,
  layoutDesktopAppsForViewport,
  autoArrangeDesktopApps,
  cellHeight,
  cellWidth,
  desktopInset,
  directoryIdForApp,
  formatTimer,
  hostnameForUrl,
  iconImageCandidates,
  initialWindowSize,
  initialsForTitle,
  isHttpUrl,
  markThemeChosen,
  markWallpaperChosen,
  normalizeHttpUrlInput,
  normalizeUrlForComparison,
  pointToGridPosition,
  isLocalApp,
  localAppStatus,
  localAppToVirtualDesktopApps,
  wallpaperDrivesBackground,
  weatherCodeLabel,
  weatherConditionFromReading
} from "@/lib/desktop-helpers";
import { messagesForLocale } from "@/lib/i18n";
import type { DesktopApp, LocalAppView } from "@/lib/contracts";

function urlApp(overrides: Partial<DesktopApp> = {}): DesktopApp {
  return {
    id: "a",
    desktopId: "d",
    kind: "url",
    source: "user",
    title: "App",
    url: "https://example.com",
    description: null,
    openingMode: "desktop_window",
    iconKind: "favicon",
    iconUrl: null,
    gridX: 0,
    gridY: 0,
    spanColumns: 1,
    spanRows: 1,
    tileVariant: "icon",
    sortOrder: 0,
    metadata: {},
    createdAt: "ts",
    updatedAt: "ts",
    ...overrides
  };
}

describe("url helpers", () => {
  it("prepends https:// for bare domains and http:// for localhost", () => {
    expect(normalizeHttpUrlInput("example.com")).toBe("https://example.com");
    expect(normalizeHttpUrlInput("localhost:3000")).toBe("http://localhost:3000");
    expect(normalizeHttpUrlInput("127.0.0.1")).toBe("http://127.0.0.1");
    expect(normalizeHttpUrlInput("[::1]:3000")).toBe("http://[::1]:3000");
    expect(normalizeHttpUrlInput("https://already.com/ok")).toBe("https://already.com/ok");
    expect(normalizeHttpUrlInput("  ")).toBe("");
  });

  it("isHttpUrl is true only for http/https", () => {
    expect(isHttpUrl("https://x.com")).toBe(true);
    expect(isHttpUrl("http://x.com")).toBe(true);
    expect(isHttpUrl("ftp://x.com")).toBe(false);
    expect(isHttpUrl("not a url")).toBe(false);
  });

  it("hostnameForUrl strips www. and falls back to the raw input on bad URLs", () => {
    expect(hostnameForUrl("https://www.example.com/path")).toBe("example.com");
    expect(hostnameForUrl("not a url")).toBe("not a url");
  });

  it("normalizeUrlForComparison strips query, hash, root path, and trailing slash", () => {
    expect(normalizeUrlForComparison("https://example.com/a/?x=1#h")).toBe("https://example.com/a");
    expect(normalizeUrlForComparison("https://example.com")).toBe("https://example.com");
  });

  it("directoryIdForApp maps known hosts and returns null for unknown / null urls", () => {
    expect(directoryIdForApp(urlApp({ url: "https://chatgpt.com/" }))).toBe("chatgpt");
    expect(directoryIdForApp(urlApp({ url: "https://claude.ai/chat" }))).toBe("claude");
    expect(directoryIdForApp(urlApp({ url: "https://www.kimi.moonshot.cn/" }))).toBe("kimi");
    expect(directoryIdForApp(urlApp({ url: "https://random.example.com" }))).toBeNull();
    expect(directoryIdForApp(urlApp({ url: null }))).toBeNull();
  });
});

describe("format / text helpers", () => {
  it("formatTimer zero-pads minutes and seconds", () => {
    expect(formatTimer(0)).toBe("00:00");
    expect(formatTimer(65)).toBe("01:05");
    expect(formatTimer(1500)).toBe("25:00");
    expect(formatTimer(3661)).toBe("61:01");
  });

  it("initialsForTitle derives initials from the first two words", () => {
    expect(initialsForTitle("Vibe Desktop")).toBe("VD");
    expect(initialsForTitle("single")).toBe("S");
    // Empty title falls back to "App" → "A"; whitespace-only yields no initials → "VD".
    expect(initialsForTitle("")).toBe("A");
    expect(initialsForTitle("   ")).toBe("VD");
  });

  it("iconImageCandidates de-dupes and orders local, favicon, and lookup URLs", () => {
    const candidates = iconImageCandidates(
      urlApp({
        url: "https://example.com",
        iconKind: "favicon",
        iconUrl: "https://example.com/favicon.ico"
      }),
      "data:local"
    );
    expect(candidates[0]).toBe("data:local");
    expect(candidates).toContain("https://example.com/favicon.ico");
    expect(candidates.some((candidate) => candidate.includes("duckduckgo"))).toBe(true);
    expect(candidates.some((candidate) => candidate.includes("google.com/s2/favicons"))).toBe(true);
    expect(new Set(candidates).size).toBe(candidates.length);
  });
});

describe("window sizing + grid", () => {
  it("initialWindowSize reserves a larger frame for the weather widget than a generic builtin", () => {
    const weather = urlApp({ kind: "builtin", title: "Weather", iconUrl: "vd://icon/weather", url: null });
    const genericBuiltin = urlApp({ kind: "builtin", title: "Other", iconUrl: null, url: null });
    expect(initialWindowSize(weather)).toEqual({ width: 820, height: 600 });
    expect(initialWindowSize(weather).width).toBeGreaterThan(initialWindowSize(genericBuiltin).width);
  });

  it("pointToGridPosition rounds to the nearest cell and clamps negatives to 0", () => {
    expect(pointToGridPosition(desktopInset, desktopInset, { columns: 1, rows: 1 }, 8)).toEqual({
      gridX: 0,
      gridY: 0
    });
    expect(pointToGridPosition(-100, -100, { columns: 1, rows: 1 }, 8)).toEqual({ gridX: 0, gridY: 0 });
    // One full cell to the right and down.
    expect(
      pointToGridPosition(desktopInset + cellWidth, desktopInset + cellHeight, { columns: 1, rows: 1 }, 8)
    ).toEqual({ gridX: 1, gridY: 1 });
  });

  it("autoArrangeDesktopApps lays out apps left-to-right without overlap", () => {
    const apps = [
      urlApp({ id: "1", sortOrder: 0 }),
      urlApp({ id: "2", sortOrder: 1 }),
      urlApp({ id: "3", sortOrder: 2 })
    ];
    const positions = autoArrangeDesktopApps(apps, 8);
    expect(positions.get("1")).toEqual({ gridX: 0, gridY: 0 });
    expect(positions.get("2")).toEqual({ gridX: 1, gridY: 0 });
    expect(positions.get("3")).toEqual({ gridX: 2, gridY: 0 });
  });

  it("ephemerally reflows saved positions that exceed the current viewport", () => {
    const apps = [
      urlApp({ id: "left", gridX: 0, gridY: 0, sortOrder: 0 }),
      urlApp({ id: "right", gridX: 12, gridY: 0, sortOrder: 1 })
    ];

    const narrow = layoutDesktopAppsForViewport(apps, 8);
    expect(narrow.get("left")).toEqual({ gridX: 0, gridY: 0 });
    expect(narrow.get("right")).toEqual({ gridX: 7, gridY: 0 });
    expect(apps[1]).toMatchObject({ gridX: 12, gridY: 0 });

    const wide = layoutDesktopAppsForViewport(apps, 13);
    expect(wide.get("right")).toEqual({ gridX: 12, gridY: 0 });
  });

  it("keeps valid cells stable and moves colliding stale positions to the nearest free cell", () => {
    const apps = [
      urlApp({ id: "valid-right", gridX: 7, gridY: 0, sortOrder: 1 }),
      urlApp({ id: "stale-right", gridX: 12, gridY: 0, sortOrder: 0 })
    ];

    const positions = layoutDesktopAppsForViewport(apps, 8);
    expect(positions.get("valid-right")).toEqual({ gridX: 7, gridY: 0 });
    expect(positions.get("stale-right")).toEqual({ gridX: 6, gridY: 0 });
  });

  it("reflows a stale widget without covering valid icons", () => {
    const apps = [
      urlApp({ id: "valid", gridX: 6, gridY: 0, sortOrder: 0 }),
      urlApp({ id: "widget", gridX: 10, gridY: 0, spanColumns: 2, spanRows: 2, sortOrder: 1 })
    ];

    const positions = layoutDesktopAppsForViewport(apps, 8);
    expect(positions.get("valid")).toEqual({ gridX: 6, gridY: 0 });
    expect(positions.get("widget")).toEqual({ gridX: 6, gridY: 1 });
  });
});

describe("weather mapping", () => {
  const t = messagesForLocale("en");

  it("weatherCodeLabel maps known codes to localized labels", () => {
    expect(weatherCodeLabel(0, t)).toBe(t.weather.conditionLabels.clear);
    expect(weatherCodeLabel(61, t)).toBe(t.weather.conditionLabels.rain);
    expect(weatherCodeLabel(71, t)).toBe(t.weather.conditionLabels.snow);
  });

  it("weatherConditionFromReading classifies rain / snow / wind / sunny", () => {
    const base = {
      place: "X",
      country: "Y",
      temperature: 10,
      humidity: 50,
      windSpeed: 5,
      updatedAt: "ts",
      label: "x"
    };
    expect(weatherConditionFromReading({ ...base, code: 0 })).toBe("sunny");
    expect(weatherConditionFromReading({ ...base, code: 61 })).toBe("rain");
    expect(weatherConditionFromReading({ ...base, code: 73 })).toBe("snow");
    expect(weatherConditionFromReading({ ...base, code: 0, windSpeed: 30 })).toBe("wind");
    expect(weatherConditionFromReading(null)).toBe("sunny");
  });
});

function localView(overrides: Partial<LocalAppView> = {}): LocalAppView {
  const status = {
    id: "da-1",
    running: false,
    pid: null,
    startedAt: null,
    url: "http://127.0.0.1:3000",
    lastExitCode: null,
    lastError: null,
    restartCount: 0,
    healthy: false,
    cpuPercent: 0,
    memoryBytes: 0,
    processCount: 0,
    readBytes: 0,
    writeBytes: 0,
    sampledAt: null,
    ...overrides.status
  };
  return {
    id: "da-1",
    name: "My Daemon",
    command: "node",
    port: 3000,
    createdAt: "ts",
    updatedAt: "ts",
    ...overrides,
    status
  };
}

describe("local webapp bridge", () => {
  it("isLocalApp detects source:local", () => {
    expect(isLocalApp(urlApp({ source: "local" }))).toBe(true);
    expect(isLocalApp(urlApp({ source: "user" }))).toBe(false);
    expect(isLocalApp(urlApp({ source: "directory" }))).toBe(false);
  });

  it("localAppStatus classifies running / booting / error / stopped", () => {
    const stopped = localView().status;
    expect(localAppStatus(localView({ status: { ...stopped, running: true, healthy: true, pid: 123 } }))).toBe("running");
    expect(localAppStatus(localView({ status: { ...stopped, running: true } }))).toBe("booting");
    expect(localAppStatus(localView({ status: { ...stopped, lastError: "boom" } }))).toBe("error");
    expect(localAppStatus(localView({ status: { ...stopped, lastExitCode: 1 } }))).toBe("error");
    expect(localAppStatus(localView())).toBe("stopped");
  });

  it("localAppToVirtualDesktopApps places virtual icons after real apps with stable ids", () => {
    const realApps = [
      urlApp({ id: "r1", desktopId: "d1", gridX: 0, gridY: 0 }),
      urlApp({ id: "r2", desktopId: "d1", gridX: 1, gridY: 0 })
    ];
    const views = [
      localView({ id: "a", name: "A", status: { ...localView().status, url: "http://127.0.0.1:3001" } }),
      localView({ id: "b", name: "B", status: { ...localView().status, url: "http://127.0.0.1:3002" } })
    ];

    const virtual = localAppToVirtualDesktopApps(realApps, views);

    expect(virtual).toHaveLength(2);
    expect(virtual[0]).toMatchObject({
      id: "local-app:a",
      source: "local",
      kind: "url",
      title: "A",
      url: "http://127.0.0.1:3001",
      desktopId: "d1"
    });
    // Cols 0 and 1 are taken by real apps -> first virtual lands on col 2.
    expect(virtual[0].gridX).toBe(2);
    expect(virtual[0].gridY).toBe(0);
    expect(virtual[1].gridX).toBe(3);
    for (const app of virtual) {
      expect(isLocalApp(app)).toBe(true);
    }
  });

  it("localAppToVirtualDesktopApps is empty when the daemon has no apps", () => {
    expect(localAppToVirtualDesktopApps([urlApp()], [])).toEqual([]);
  });

  it("localAppToVirtualDesktopApps honours a persisted drag layout", () => {
    const realApps = [urlApp({ id: "r1", desktopId: "d1", gridX: 0, gridY: 0 })];
    const views = [localView({ id: "a", name: "A" })];
    const layout = { "local-app:a": { gridX: 5, gridY: 3 } };

    const [virtual] = localAppToVirtualDesktopApps(realApps, views, layout);

    expect(virtual.gridX).toBe(5);
    expect(virtual.gridY).toBe(3);
  });

  it("localAppToVirtualDesktopApps falls back to first-open when the layout cell is taken", () => {
    // layout wants (0,0) but a real app already sits there -> next open cell
    const realApps = [urlApp({ id: "r1", desktopId: "d1", gridX: 0, gridY: 0 })];
    const views = [localView({ id: "a", name: "A" })];
    const layout = { "local-app:a": { gridX: 0, gridY: 0 } };

    const [virtual] = localAppToVirtualDesktopApps(realApps, views, layout);

    expect(virtual.gridX).toBe(1);
    expect(virtual.gridY).toBe(0);
  });

  it("localAppToVirtualDesktopApps projects the daemon icon fields onto the virtual app", () => {
    const [virtual] = localAppToVirtualDesktopApps([urlApp()], [
      localView({ id: "ollama", name: "Ollama", iconKind: "favicon", iconUrl: "/icons/local-apps/ollama.svg" })
    ]);
    expect(virtual.iconKind).toBe("favicon");
    expect(virtual.iconUrl).toBe("/icons/local-apps/ollama.svg");
  });

  it("localAppToVirtualDesktopApps defaults to fallback / null when the daemon has no icon", () => {
    const [virtual] = localAppToVirtualDesktopApps([urlApp()], [localView({ id: "bare" })]);
    expect(virtual.iconKind).toBe("fallback");
    expect(virtual.iconUrl).toBeNull();
  });

  it("iconImageCandidates prefers the service favicon and skips hostname lookups for local apps", () => {
    const localApp = urlApp({
      source: "local",
      url: "http://127.0.0.1:11434",
      iconKind: "fallback",
      iconUrl: null
    });
    const candidates = iconImageCandidates(localApp);
    expect(candidates).toContain("http://127.0.0.1:11434/favicon.ico");
    // DuckDuckGo / Google key off hostname and resolve nothing for localhost.
    expect(candidates.some((c) => c.includes("duckduckgo"))).toBe(false);
    expect(candidates.some((c) => c.includes("google.com/s2/favicons"))).toBe(false);
  });

  it("iconImageCandidates leads with the catalog/uploaded icon for a local app that has one", () => {
    const localApp = urlApp({
      source: "local",
      url: "http://127.0.0.1:11434",
      iconKind: "favicon",
      iconUrl: "/icons/local-apps/ollama.svg"
    });
    const candidates = iconImageCandidates(localApp, "data:upload");
    expect(candidates[0]).toBe("data:upload");
    expect(candidates[1]).toBe("/icons/local-apps/ollama.svg");
    expect(candidates[2]).toBe("http://127.0.0.1:11434/favicon.ico");
  });
});

describe("wallpaperDrivesBackground", () => {
  it("keeps legacy mineral-morning desktops theme-driven when no recency is marked", () => {
    expect(wallpaperDrivesBackground({ wallpaperKind: "builtin", wallpaperBuiltinId: "mineral-morning" })).toBe(false);
  });

  it("lets any non-legacy builtin wallpaper drive the background", () => {
    expect(wallpaperDrivesBackground({ wallpaperKind: "builtin", wallpaperBuiltinId: "noir-dawn" })).toBe(true);
  });

  it("lets custom local uploads drive the background", () => {
    expect(wallpaperDrivesBackground({ wallpaperKind: "custom_local", wallpaperBuiltinId: "mineral-morning" })).toBe(true);
  });

  it("honors the most recent picker mark for legacy desktops", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value)
      }
    });
    try {
      markThemeChosen();
      expect(wallpaperDrivesBackground({ wallpaperKind: "builtin", wallpaperBuiltinId: "mineral-morning" })).toBe(false);
      store.clear();
      markWallpaperChosen();
      expect(wallpaperDrivesBackground({ wallpaperKind: "builtin", wallpaperBuiltinId: "mineral-morning" })).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("desktopCellMetrics", () => {
  it("returns the constant geometry when no stylesheet is applied", () => {
    // jsdom/node: getComputedStyle yields empty custom properties, so the
    // fallback constants must come back unchanged.
    expect(desktopCellMetrics()).toEqual({ cellWidth, cellHeight, desktopInset });
  });

  it("uses all residual width to expose every safely spaced desktop column", () => {
    const layout = desktopGridLayoutForWidth(1920, { cellWidth: 112, cellHeight: 118, desktopInset: 28 }, 92);

    expect(layout.columns).toBe(18);
    expect(layout.fitted).toBe(true);
    expect(layout.metrics.cellWidth).toBeGreaterThanOrEqual(100);
    expect(28 + 17 * layout.metrics.cellWidth + 92).toBeCloseTo(1920 - 28);
  });

  it("keeps the base pitch when an extra column would violate icon spacing", () => {
    const layout = desktopGridLayoutForWidth(800, { cellWidth: 84, cellHeight: 92, desktopInset: 16 }, 76);

    expect(layout).toEqual({
      columns: 9,
      metrics: { cellWidth: 84, cellHeight: 92, desktopInset: 16 },
      fitted: false
    });
  });

  it("maps the same plane point to different cells under compact metrics", () => {
    const compact = { cellWidth: 84, cellHeight: 92, desktopInset: 16 };
    const point = { x: 300, y: 250 };
    const regular = pointToGridPosition(point.x, point.y, { columns: 1, rows: 1 }, 8);
    const dense = pointToGridPosition(point.x, point.y, { columns: 1, rows: 1 }, 8, compact);
    expect(regular).toEqual({ gridX: 2, gridY: 2 });
    expect(dense).toEqual({ gridX: 3, gridY: 3 });
  });
});
