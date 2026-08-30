import { describe, expect, it } from "vitest";
import { makeDemoPayload, demoLocalApps } from "@/components/chrome/tour-demo-data";
import { occupiedGridCellsForApps, desktopGridSpanForApp } from "@/lib/desktop-helpers";
import { gridSpanIsFree } from "@/lib/desktop-grid";
import type { DesktopApp, DesktopPayload } from "@/lib/contracts";

function app(overrides: Partial<DesktopApp> = {}): DesktopApp {
  return {
    id: "a", desktopId: "d", kind: "builtin", source: "seed", title: "App",
    url: "https://example.com", description: null, openingMode: "desktop_window",
    iconKind: "favicon", iconUrl: null, gridX: 0, gridY: 0, spanColumns: 1, spanRows: 1,
    tileVariant: "icon", sortOrder: 0, metadata: {}, createdAt: "ts", updatedAt: "ts",
    ...overrides
  };
}

/** The seeded first row: the layout the tour actually runs against. */
function payload(apps: DesktopApp[]): DesktopPayload {
  return {
    user: { id: "u" } as DesktopPayload["user"],
    desktop: { id: "d" } as DesktopPayload["desktop"],
    apps,
    wallpapers: [],
    themes: [],
    shellStyles: []
  };
}

const seededRow = [
  app({ id: "start", title: "Start Board", gridX: 0, gridY: 0 }),
  app({ id: "weather", title: "Weather", gridX: 1, gridY: 0, spanColumns: 2, spanRows: 3, tileVariant: "weather" }),
  app({ id: "store", title: "App Store", gridX: 3, gridY: 0 }),
  app({ id: "import", title: "WebUI Import", gridX: 4, gridY: 0 }),
  app({ id: "local", title: "Local WebApps", gridX: 5, gridY: 0 }),
  app({ id: "settings", title: "Settings", gridX: 6, gridY: 0 }),
  app({ id: "chatgpt", kind: "url", title: "ChatGPT", gridX: 7, gridY: 0 })
];

function collisions(apps: DesktopApp[]): string[] {
  const taken = new Set<string>();
  const found: string[] = [];
  for (const item of apps) {
    const span = desktopGridSpanForApp(item);
    if (!gridSpanIsFree(taken, item.gridX, item.gridY, span)) {
      found.push(`${item.title} @ ${item.gridX},${item.gridY}`);
    }
    for (let y = item.gridY; y < item.gridY + span.rows; y += 1) {
      for (let x = item.gridX; x < item.gridX + span.columns; x += 1) taken.add(`${x}:${y}`);
    }
  }
  return found;
}

describe("makeDemoPayload", () => {
  it("never places a demo tile on a cell a retained builtin already occupies", () => {
    const demo = makeDemoPayload(payload(seededRow), "en");

    expect(collisions(demo.apps)).toEqual([]);
  });

  it("keeps every builtin at its real position and drops the seeded url apps", () => {
    const demo = makeDemoPayload(payload(seededRow), "en");

    expect(demo.apps.filter((a) => a.kind === "builtin").map((a) => [a.title, a.gridX, a.gridY])).toEqual([
      ["Start Board", 0, 0],
      ["Weather", 1, 0],
      ["App Store", 3, 0],
      ["WebUI Import", 4, 0],
      ["Local WebApps", 5, 0],
      ["Settings", 6, 0]
    ]);
    expect(demo.apps.some((a) => a.title === "ChatGPT")).toBe(false);
  });

  it("adds exactly the three demo tiles, each in a free cell", () => {
    const demo = makeDemoPayload(payload(seededRow), "en");
    const demos = demo.apps.filter((a) => a.id.startsWith("demo-url-"));

    expect(demos).toHaveLength(3);
    const takenByBuiltins = occupiedGridCellsForApps(
      seededRow.filter((a) => a.kind === "builtin"),
      ""
    );
    for (const tile of demos) {
      expect(takenByBuiltins.has(`${tile.gridX}:${tile.gridY}`)).toBe(false);
    }
  });

  it("stays collision-free when the builtins are arranged differently", () => {
    const shuffled = [
      app({ id: "start", title: "Start Board", gridX: 4, gridY: 1 }),
      app({ id: "store", title: "App Store", gridX: 0, gridY: 0 }),
      app({ id: "settings", title: "Settings", gridX: 1, gridY: 0 })
    ];

    expect(collisions(makeDemoPayload(payload(shuffled), "en").apps)).toEqual([]);
  });

  it("localizes every demo label instead of hard-coding one language", () => {
    const en = makeDemoPayload(payload(seededRow), "en");
    const zh = makeDemoPayload(payload(seededRow), "zh");
    const titles = (p: DesktopPayload) => p.apps.filter((a) => a.id.startsWith("demo-url-")).map((a) => a.title);

    expect(titles(en)).toEqual(["Vibe Memo", "Local Tool", "Web Bookmark"]);
    expect(titles(zh)).toEqual(["Vibe 便签", "本地工具", "网页书签"]);
    expect(demoLocalApps("en")[0].name).toBe("Sample Service");
    expect(demoLocalApps("zh")[0].name).toBe("示例服务");
  });
});
