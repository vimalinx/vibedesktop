import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppDirectoryItem } from "@/lib/contracts";
import { catalogFormatVersion } from "@/lib/catalog-contract";
import { createLocalDataSource, type TrialStorage } from "@/lib/desktop-data/local-source";
import { DesktopDataError, reasonFor } from "@/lib/desktop-data/contract";
import { appDirectory } from "@/lib/seed-data";
import { nearestAllowedSpan } from "@/lib/tile-contract";

/** The storage double: one value, in memory. */
function memoryStorage(initial: string | null = null): TrialStorage & { value: string | null } {
  return {
    value: initial,
    read() {
      return this.value;
    },
    write(next: string) {
      this.value = next;
    }
  };
}

function stubCatalogFetch(body: unknown, ok = true): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok,
      json: async () => body
    }))
  );
}

describe("local data source — desktop state", () => {
  it("seeds a full desktop on the first load and persists it", async () => {
    const storage = memoryStorage();
    const source = createLocalDataSource(storage);

    const payload = await source.loadDesktop();

    expect(payload.apps).toHaveLength(11);
    expect(payload.apps.filter((app) => app.kind === "builtin")).toHaveLength(5);
    expect(payload.desktop.wallpaperBuiltinId).toBe("noir-dawn");
    expect(payload.desktop.themeId).toBe("mineral");
    expect(payload.wallpapers.length).toBeGreaterThan(0);
    expect(payload.themes.length).toBeGreaterThan(0);
    expect(storage.value).toBeTruthy();
  });

  it("returns the persisted desktop on a later load instead of reseeding", async () => {
    const storage = memoryStorage();
    const first = await createLocalDataSource(storage).loadDesktop();
    const created = await createLocalDataSource(storage).createUrlApp({
      title: "Kept",
      url: "https://example.com/",
      description: null,
      openingMode: "desktop_window",
      iconKind: "fallback",
      iconUrl: null
    });

    // A fresh source object reads the same storage — this is the reload case.
    const reloaded = await createLocalDataSource(storage).loadDesktop();

    expect(reloaded.desktop.id).toBe(first.desktop.id);
    expect(reloaded.apps).toHaveLength(created.apps.length);
    expect(reloaded.apps.some((app) => app.title === "Kept")).toBe(true);
  });

  it("removes the obsolete WebUI Import builtin while preserving user apps", async () => {
    const storage = memoryStorage();
    const source = createLocalDataSource(storage);
    const initial = await source.loadDesktop();
    const persisted = JSON.parse(storage.value!);
    persisted.desktops[0].seedVersion = 7;
    persisted.apps.push({
      ...persisted.apps[0],
      id: "legacy-webui-import",
      title: "WebUI Import",
      iconUrl: "vd://icon/webui-import",
      sortOrder: persisted.apps.length
    });
    storage.value = JSON.stringify(persisted);

    const migrated = await source.loadDesktop();

    expect(migrated.desktop.seedVersion).toBe(8);
    expect(migrated.apps.some((app) => app.iconUrl === "vd://icon/webui-import")).toBe(false);
    expect(migrated.apps.map((app) => app.id)).toEqual(initial.apps.map((app) => app.id));
  });

  it("round-trips create, update, and delete through the storage double", async () => {
    const storage = memoryStorage();
    const source = createLocalDataSource(storage);
    await source.loadDesktop();

    const afterCreate = await source.createUrlApp({
      title: "Example",
      url: "https://example.com/",
      description: "An example",
      openingMode: "external_tab",
      iconKind: "favicon",
      iconUrl: "https://example.com/favicon.ico"
    });
    const created = afterCreate.apps.find((app) => app.title === "Example");
    expect(created).toBeDefined();
    expect(created?.source).toBe("user");
    expect(created?.tileVariant).toBe("app");

    const afterUpdate = await source.updateApp(created!.id, { title: "Renamed", gridX: 4, gridY: 2 });
    const updated = afterUpdate.apps.find((app) => app.id === created!.id);
    expect(updated?.title).toBe("Renamed");
    expect(updated).toMatchObject({ gridX: 4, gridY: 2 });

    const afterDelete = await source.deleteApp(created!.id);
    expect(afterDelete.apps.some((app) => app.id === created!.id)).toBe(false);

    // And the deletion is what a reload sees.
    const reloaded = await createLocalDataSource(storage).loadDesktop();
    expect(reloaded.apps.some((app) => app.id === created!.id)).toBe(false);
  });

  it("persists desktop settings and rejects unknown ids the same way the server does", async () => {
    const storage = memoryStorage();
    const source = createLocalDataSource(storage);
    await source.loadDesktop();

    const themed = await source.updateDesktop({ themeId: "paper-ink", shellStyle: "compact" });
    expect(themed.desktop.themeId).toBe("paper-ink");
    expect(themed.desktop.shellStyle).toBe("compact");

    // @ts-expect-error — deliberately passing an id the theme list does not have.
    const ignored = await source.updateDesktop({ themeId: "not-a-theme" });
    expect(ignored.desktop.themeId).toBe("paper-ink");

    const startCleared = await source.updateDesktop({ startAppId: "nope" });
    expect(startCleared.desktop.startAppId).toBeNull();
  });

  it("applies the same tile-span rules as the server store, with the route's error shape", async () => {
    const storage = memoryStorage();
    const source = createLocalDataSource(storage);
    const payload = await source.loadDesktop();
    const icon = payload.apps.find((app) => app.tileVariant === "icon");
    expect(icon).toBeDefined();

    // 3×3 is not a whitelisted span for the "icon" variant.
    expect(nearestAllowedSpan("icon", { columns: 3, rows: 3 })).not.toEqual({ columns: 3, rows: 3 });
    await expect(source.updateApp(icon!.id, { spanColumns: 3, spanRows: 3 })).rejects.toMatchObject({
      name: "DesktopDataError",
      code: "unsupported_span",
      status: 400
    });

    // The rejected write must not have been persisted.
    const reloaded = await createLocalDataSource(storage).loadDesktop();
    const unchanged = reloaded.apps.find((app) => app.id === icon!.id);
    expect(unchanged).toMatchObject({ spanColumns: 1, spanRows: 1 });
  });

  it("rejects updating and deleting an app that does not exist, as a 404", async () => {
    const source = createLocalDataSource(memoryStorage());
    await source.loadDesktop();

    await expect(source.updateApp("missing", { title: "x" })).rejects.toMatchObject({
      name: "DesktopDataError",
      code: "app_not_found",
      status: 404
    });
    await expect(source.deleteApp("missing")).rejects.toMatchObject({ code: "app_not_found", status: 404 });
  });

  it("enforces the URL and title rules POST /api/apps enforces", async () => {
    const source = createLocalDataSource(memoryStorage());
    await source.loadDesktop();
    const base = {
      title: "Bad",
      description: null,
      openingMode: "desktop_window" as const,
      iconKind: "fallback" as const,
      iconUrl: null
    };

    await expect(source.createUrlApp({ ...base, url: "not a url" })).rejects.toMatchObject({
      code: "invalid_request",
      status: 400
    });
    await expect(source.createUrlApp({ ...base, url: "javascript:alert(1)" })).rejects.toMatchObject({
      code: "invalid_request"
    });
    await expect(source.createUrlApp({ ...base, url: "  " })).rejects.toMatchObject({
      code: "invalid_request"
    });
    await expect(source.createUrlApp({ ...base, title: "   ", url: "https://example.com" })).rejects.toMatchObject({
      code: "invalid_request"
    });

    // The route accepts a credentialed URL, so the trial must too — being
    // stricter than the product misrepresents it. See requireHttpUrl's comment.
    const credentialed = await source.createUrlApp({
      ...base,
      title: "Credentialed",
      url: "https://user:pw@example.com/"
    });
    expect(credentialed.apps.some((app) => app.title === "Credentialed")).toBe(true);

    // And a good one still lands, normalised the way the route normalises it.
    const ok = await source.createUrlApp({ ...base, title: "  Spaced  ", url: "https://example.com" });
    const created = ok.apps.find((app) => app.title === "Spaced");
    expect(created?.url).toBe("https://example.com/");
  });

  it("enforces the accent-contrast and font rules PATCH /api/desktop enforces", async () => {
    const source = createLocalDataSource(memoryStorage());
    await source.loadDesktop();

    // Near-black on the dark canvas: below the 3:1 bar the real product refuses.
    await expect(source.updateDesktop({ accentOverride: "#141414" })).rejects.toMatchObject({
      code: "invalid_style_override",
      status: 400
    });
    await expect(source.updateDesktop({ accentOverride: "not-a-colour" })).rejects.toMatchObject({
      code: "invalid_style_override"
    });
    await expect(source.updateDesktop({ fontOverride: "comic-sans" })).rejects.toMatchObject({
      code: "invalid_style_override"
    });

    const accepted = await source.updateDesktop({ accentOverride: "#c8ff3d", fontOverride: "mono" });
    expect(accepted.desktop).toMatchObject({ accentOverride: "#c8ff3d", fontOverride: "mono" });
  });

  it("reseeds rather than throwing when the stored value is corrupt", async () => {
    const storage = memoryStorage("this is not json");

    const payload = await createLocalDataSource(storage).loadDesktop();

    expect(payload.apps).toHaveLength(11);
  });

  it("survives storage that refuses to be written", async () => {
    const storage: TrialStorage = {
      read: () => null,
      write: () => {
        throw new Error("QuotaExceededError");
      }
    };

    // A trial with disabled storage is still a usable trial for this visit.
    const payload = await createLocalDataSource(storage).loadDesktop();
    expect(payload.apps).toHaveLength(11);
  });

  it("exposes no server-only capability", async () => {
    const source = createLocalDataSource(memoryStorage());

    expect(source.mode).toBe("local");
    expect(source.urlMetadata).toBeUndefined();
    expect(source.localApps).toBeUndefined();
    expect(source.localProbe).toBeUndefined();
  });
});

describe("local data source — catalog", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("merges the bundled artifact over the built-in seed", async () => {
    stubCatalogFetch({
      formatVersion: catalogFormatVersion,
      generatedAt: "2026-08-11T00:00:00.000Z",
      entries: [
        {
          id: "excalidraw",
          title: "Excalidraw",
          url: "https://excalidraw.com/",
          description: "Whiteboard",
          icon: "data:image/png;base64,iVBORw0KGgo=",
          category: "tools"
        }
      ]
    });

    const items = await createLocalDataSource(memoryStorage()).listCatalog();

    expect(items.length).toBe(appDirectory.length + 1);
    expect(items.find((item) => item.id === "excalidraw")).toMatchObject({
      title: "Excalidraw",
      category: "tools"
    });
    // Seed entries keep their positions and their content.
    expect(items[0]?.id).toBe(appDirectory[0]?.id);
  });

  it("falls back to the built-in seed when the artifact is missing", async () => {
    stubCatalogFetch(null, false);

    const items = await createLocalDataSource(memoryStorage()).listCatalog();

    expect(items.map((item) => item.id)).toEqual(appDirectory.map((item) => item.id));
  });

  it("falls back to the built-in seed when the artifact is garbage", async () => {
    stubCatalogFetch({ formatVersion: 999, entries: [{ nope: true }] });

    const items = await createLocalDataSource(memoryStorage()).listCatalog();

    expect(items.map((item) => item.id)).toEqual(appDirectory.map((item) => item.id));
  });

  it("falls back to the built-in seed when the fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      })
    );

    const items = await createLocalDataSource(memoryStorage()).listCatalog();

    expect(items.map((item) => item.id)).toEqual(appDirectory.map((item) => item.id));
  });

  it("still applies the whitelist projection to bundled entries", async () => {
    stubCatalogFetch({
      formatVersion: catalogFormatVersion,
      generatedAt: "2026-08-11T00:00:00.000Z",
      entries: [
        {
          id: "sneaky",
          title: "Sneaky",
          url: "https://sneaky.example/",
          command: "rm",
          args: ["-rf", "/"],
          cwd: "/",
          port: 7878,
          openingMode: "desktop_window"
        }
      ]
    });

    const items = await createLocalDataSource(memoryStorage()).listCatalog();
    const sneaky = items.find((item) => item.id === "sneaky") as (AppDirectoryItem & Record<string, unknown>) | undefined;

    expect(sneaky).toBeDefined();
    expect(sneaky).not.toHaveProperty("command");
    expect(sneaky).not.toHaveProperty("args");
    expect(sneaky).not.toHaveProperty("cwd");
    expect(sneaky).not.toHaveProperty("port");
    // openingMode is never read from input.
    expect(sneaky?.openingMode).toBe("external_tab");
  });

  it("adds a catalog entry to the desktop and persists it", async () => {
    stubCatalogFetch({
      formatVersion: catalogFormatVersion,
      generatedAt: "2026-08-11T00:00:00.000Z",
      entries: [
        {
          id: "excalidraw",
          title: "Excalidraw",
          url: "https://excalidraw.com/",
          description: "Whiteboard",
          icon: "data:image/png;base64,iVBORw0KGgo=",
          category: "tools"
        }
      ]
    });
    const storage = memoryStorage();
    const source = createLocalDataSource(storage);
    const before = await source.loadDesktop();

    const after = await source.addCatalogApp("excalidraw");
    const added = after.apps.find((app) => app.title === "Excalidraw");

    expect(after.apps).toHaveLength(before.apps.length + 1);
    expect(added).toMatchObject({ source: "directory", openingMode: "external_tab", iconKind: "favicon" });
    expect(added?.iconUrl?.startsWith("data:image/")).toBe(true);

    const reloaded = await createLocalDataSource(storage).loadDesktop();
    expect(reloaded.apps.some((app) => app.title === "Excalidraw")).toBe(true);
  });

  it("rejects an unknown catalog id, listable == addable", async () => {
    stubCatalogFetch(null, false);
    const source = createLocalDataSource(memoryStorage());

    await expect(source.addCatalogApp("not-in-the-catalog")).rejects.toBeInstanceOf(DesktopDataError);
  });
});

describe("local data source — error reasons", () => {
  it("carries an authored reason only where one exists", async () => {
    const source = createLocalDataSource(memoryStorage());
    const payload = await source.loadDesktop();
    const icon = payload.apps.find((app) => app.tileVariant === "icon")!;

    // A rule violation has a reason worth showing the user.
    const tileError = await source.updateApp(icon.id, { spanColumns: 3, spanRows: 3 }).catch((e) => e);
    expect(reasonFor(tileError)).toBe(tileError.message);
    expect(reasonFor(tileError)).toMatch(/not a supported size/);

    const styleError = await source.updateDesktop({ accentOverride: "#141414" }).catch((e) => e);
    expect(reasonFor(styleError)).toMatch(/contrast/);

    // A plain failure has none, so callers fall back to their own copy.
    expect(reasonFor(new DesktopDataError("Request failed with status 500."))).toBeNull();
    expect(reasonFor(new Error("boom"))).toBeNull();
  });
});
