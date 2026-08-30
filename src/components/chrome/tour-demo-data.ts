import { desktopGridMinColumns, firstOpenGridSpanPosition, markGridSpan } from "@/lib/desktop-grid";
import type { DesktopApp, DesktopPayload, LocalAppView } from "@/lib/contracts";
import { defaultTileFields, occupiedGridCellsForApps } from "@/lib/desktop-helpers";
import type { Locale } from "@/lib/i18n";

const singleCell = { columns: 1, rows: 1 } as const;

/** Build a curated demo payload for the guided tour: keep real themes/wallpaper,
 *  show only builtin apps + a few example URL/local apps in free cells. */
export function makeDemoPayload(real: DesktopPayload, locale: Locale): DesktopPayload {
  const origin = typeof window === "undefined" ? "http://localhost:3000" : window.location.origin;
  const sampleUrl = new URL(`/demo?lang=${locale}`, origin).toString();
  const builtins = real.apps.filter((a) => a.kind === "builtin");

  // The builtins keep their real coordinates, so the demo tiles must be placed
  // around whatever those turn out to be. Fixed coordinates cannot: they used to
  // be 3/4/5 of row 0, which is exactly where App Store, WebUI Import, and Local
  // WebApps sit, so each cell painted two labels on top of each other. Placement
  // assumes the narrowest grid, which stays valid on every wider one.
  const taken = occupiedGridCellsForApps(builtins, "");
  const nextFreeCell = () => {
    const position = firstOpenGridSpanPosition(taken, singleCell, desktopGridMinColumns);
    markGridSpan(taken, position, singleCell);
    return position;
  };

  const demos: Array<Pick<DesktopApp, "id" | "source" | "title" | "url" | "description" | "iconUrl">> = [
    {
      id: "demo-url-1", source: "user",
      title: locale === "zh" ? "Vibe 便签" : "Vibe Memo",
      url: sampleUrl,
      description: locale === "zh" ? "Vibe Desktop 提供的站内示例程序" : "A sample app provided by Vibe Desktop",
      iconUrl: `${origin}/favicon.svg`
    },
    {
      id: "demo-url-2", source: "local",
      title: locale === "zh" ? "本地工具" : "Local Tool",
      url: "http://localhost:3000", description: null, iconUrl: null
    },
    {
      id: "demo-url-3", source: "user",
      title: locale === "zh" ? "网页书签" : "Web Bookmark",
      url: "https://chatgpt.com", description: null, iconUrl: null
    }
  ];

  return {
    ...real,
    apps: [
      ...builtins,
      ...demos.map((demo, index) => ({
        desktopId: real.desktop.id,
        kind: "url" as const,
        openingMode: "desktop_window" as const,
        iconKind: "favicon" as const,
        ...nextFreeCell(),
        ...defaultTileFields,
        sortOrder: 100 + index,
        metadata: {},
        createdAt: "",
        updatedAt: "",
        ...demo
      }))
    ]
  };
}

export function demoLocalApps(locale: Locale): LocalAppView[] {
  return [
    {
      id: "demo-local-1", name: locale === "zh" ? "示例服务" : "Sample Service",
      command: "node", port: 3000,
      args: [], cwd: undefined, env: {}, autoStart: false, restart: "on-crash",
      createdAt: "", updatedAt: "",
      status: { id: "demo-local-1", running: true, pid: 99999, startedAt: "2026-01-01T00:00:00.000Z",
                url: "http://localhost:3000", lastExitCode: null, lastError: null,
                restartCount: 0, healthy: true, cpuPercent: 2.4, memoryBytes: 48 * 1024 * 1024,
                processCount: 1, readBytes: 0, writeBytes: 0, sampledAt: "2026-01-01T00:00:02.000Z" }
    }
  ];
}
