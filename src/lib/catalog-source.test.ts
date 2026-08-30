import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __setCatalogConfigForTests,
  __setCatalogFetchForTests,
  loadLocalCatalog,
  loadMergedDirectory,
  loadPublicCatalog
} from "@/lib/catalog-source";
import { catalogFormatVersion } from "@/lib/catalog-contract";
import { appDirectory } from "@/lib/seed-data";

const catalogUrl = "https://catalog.example/catalog.json";
const pngIcon = "data:image/png;base64,iVBORw0KGgo=";

let workDir: string;
let cacheFile: string;
let localFile: string;

function entry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "from-catalog",
    title: "From Catalog",
    url: "https://from-catalog.example",
    description: "A catalog entry.",
    icon: pngIcon,
    category: "community",
    ...overrides
  };
}

function artifact(entries: unknown[]): string {
  return JSON.stringify({
    formatVersion: catalogFormatVersion,
    generatedAt: "2026-08-11T00:00:00.000Z",
    entries
  });
}

function textResponse(
  body: string,
  init: { status?: number; contentType?: string; headers?: Record<string, string> } = {}
): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { "content-type": init.contentType ?? "application/json", ...(init.headers ?? {}) }
  });
}

function stubFetch(impl: (url: URL | RequestInfo, init?: RequestInit) => Promise<Response>) {
  const mock = vi.fn(impl);
  __setCatalogFetchForTests(mock as unknown as typeof fetch);
  return mock;
}

/** Serves `body` for the catalog URL. */
function serving(body: string, init?: Parameters<typeof textResponse>[1]) {
  return stubFetch(async () => textResponse(body, init));
}

async function writeCacheFile(entries: unknown[], overrides: Record<string, unknown> = {}): Promise<void> {
  await writeFile(
    cacheFile,
    JSON.stringify({
      fetchedAt: new Date().toISOString(),
      sourceUrl: catalogUrl,
      entries,
      ...overrides
    }),
    "utf8"
  );
}

beforeEach(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "vd-catalog-"));
  cacheFile = path.join(workDir, "catalog-cache.json");
  localFile = path.join(workDir, "local-catalog.json");

  __setCatalogConfigForTests({
    catalogUrl,
    cacheFile,
    localFile,
    maxAgeMs: 60_000
  });
});

afterEach(async () => {
  __setCatalogConfigForTests(null);
  __setCatalogFetchForTests(null);
  vi.restoreAllMocks();
  await rm(workDir, { recursive: true, force: true });
});

describe("loadPublicCatalog — opt-in", () => {
  it("makes no request and returns nothing when no catalog URL is configured", async () => {
    __setCatalogConfigForTests({ catalogUrl: null, cacheFile, localFile, maxAgeMs: 60_000 });
    const mock = serving(artifact([entry()]));

    await expect(loadPublicCatalog()).resolves.toEqual([]);
    expect(mock).not.toHaveBeenCalled();
  });

  it("refuses a plaintext http catalog on a remote host", async () => {
    __setCatalogConfigForTests({
      catalogUrl: "http://catalog.example/catalog.json",
      cacheFile,
      localFile,
      maxAgeMs: 60_000
    });
    const mock = serving(artifact([entry()]));

    await expect(loadPublicCatalog()).resolves.toEqual([]);
    expect(mock).not.toHaveBeenCalled();
  });

  it("allows plaintext http on loopback, so a local artifact can be tested", async () => {
    __setCatalogConfigForTests({
      catalogUrl: "http://127.0.0.1:8123/catalog.json",
      cacheFile,
      localFile,
      maxAgeMs: 60_000
    });
    serving(artifact([entry()]));

    const items = await loadPublicCatalog();
    expect(items.map((item) => item.id)).toEqual(["from-catalog"]);
  });
});

describe("loadPublicCatalog — success", () => {
  it("returns parsed entries and writes a cache", async () => {
    serving(artifact([entry()]));

    const items = await loadPublicCatalog();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: "from-catalog", openingMode: "external_tab", iconUrl: pngIcon });

    const cached = JSON.parse(await readFile(cacheFile, "utf8"));
    expect(cached.sourceUrl).toBe(catalogUrl);
    expect(cached.entries).toHaveLength(1);
  });

  it("runs fetched entries through the whitelist, so executable fields never reach the cache", async () => {
    serving(artifact([entry({ command: "docker", args: ["up"], port: 8080, openingMode: "desktop_window" })]));

    const items = await loadPublicCatalog();
    expect(items[0]).not.toHaveProperty("command");
    expect(items[0]!.openingMode).toBe("external_tab");

    const cached = JSON.parse(await readFile(cacheFile, "utf8"));
    expect(cached.entries[0]).not.toHaveProperty("command");
  });

  it("serves a fresh cache without touching the network", async () => {
    await writeCacheFile([
      { id: "cached", title: "Cached", url: "https://cached.example", icon: pngIcon, category: "community" }
    ]);
    const mock = serving(artifact([entry()]));

    const items = await loadPublicCatalog();
    expect(items.map((item) => item.id)).toEqual(["cached"]);
    expect(mock).not.toHaveBeenCalled();
  });

  it("refetches when the cache came from a different catalog URL", async () => {
    await writeCacheFile(
      [{ id: "cached", title: "Cached", url: "https://cached.example", icon: pngIcon }],
      { sourceUrl: "https://other.example/catalog.json" }
    );
    const mock = serving(artifact([entry()]));

    const items = await loadPublicCatalog();
    expect(items.map((item) => item.id)).toEqual(["from-catalog"]);
    expect(mock).toHaveBeenCalled();
  });

  it("follows a redirect, which is how a GitHub Release download resolves", async () => {
    const mock = stubFetch(async (url) => {
      if (String(url) === catalogUrl) {
        return new Response(null, { status: 302, headers: { location: "https://cdn.example/artifact.json" } });
      }
      return textResponse(artifact([entry()]));
    });

    const items = await loadPublicCatalog();
    expect(items).toHaveLength(1);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("refuses a redirect that leaves https", async () => {
    stubFetch(async () =>
      new Response(null, { status: 302, headers: { location: "http://cdn.example/artifact.json" } })
    );

    await expect(loadPublicCatalog()).resolves.toEqual([]);
  });
});

describe("loadPublicCatalog — degradation", () => {
  const cachedEntries = [
    { id: "cached", title: "Cached", url: "https://cached.example", icon: pngIcon, category: "community" }
  ];

  async function expectServedFromCache(mock: ReturnType<typeof stubFetch>): Promise<void> {
    const items = await loadPublicCatalog();
    expect(items.map((item) => item.id)).toEqual(["cached"]);
    expect(mock).toHaveBeenCalled();

    // A failed fetch must never overwrite good entries with nothing.
    const cached = JSON.parse(await readFile(cacheFile, "utf8"));
    expect(cached.entries).toHaveLength(1);
    expect(cached.entries[0].id).toBe("cached");
  }

  beforeEach(async () => {
    // Stale, so every case below actually attempts a fetch.
    await writeCacheFile(cachedEntries, { fetchedAt: new Date(Date.now() - 10 * 60_000).toISOString() });
  });

  it("serves a stale cache when the network rejects", async () => {
    const mock = stubFetch(async () => {
      throw new Error("ECONNREFUSED");
    });

    await expectServedFromCache(mock);
  });

  it("serves a stale cache on HTTP 500", async () => {
    const mock = serving("upstream exploded", { status: 500 });

    await expectServedFromCache(mock);
  });

  it("serves a stale cache when the response is an HTML error page", async () => {
    const mock = serving("<!doctype html><title>404</title>", { contentType: "text/html" });

    await expectServedFromCache(mock);
  });

  it("serves a stale cache when the body is not JSON", async () => {
    const mock = serving("this is not json {{{");

    await expectServedFromCache(mock);
  });

  it("serves a stale cache when the body exceeds the size cap", async () => {
    const oversized = artifact([entry({ description: "x".repeat(600_000) })]);
    const mock = serving(oversized);

    await expectServedFromCache(mock);
  });

  it("accepts a JSON body served as octet-stream, as static hosts often do", async () => {
    serving(artifact([entry()]), { contentType: "application/octet-stream" });

    const items = await loadPublicCatalog();
    expect(items.map((item) => item.id)).toEqual(["from-catalog"]);
  });

  it("returns nothing when the fetch fails and there is no cache", async () => {
    await rm(cacheFile, { force: true });
    stubFetch(async () => {
      throw new Error("offline");
    });

    await expect(loadPublicCatalog()).resolves.toEqual([]);
  });

  it("ignores a corrupt cache file rather than throwing", async () => {
    await writeFile(cacheFile, "{ not json", "utf8");
    stubFetch(async () => {
      throw new Error("offline");
    });

    await expect(loadPublicCatalog()).resolves.toEqual([]);
  });

  it("re-parses cached entries through the whitelist", async () => {
    await writeCacheFile([{ id: "tampered", title: "Tampered", url: "https://t.example", command: "rm -rf /" }]);

    const items = await loadPublicCatalog();
    expect(items[0]).not.toHaveProperty("command");
  });

  it("coalesces concurrent loads into a single fetch", async () => {
    await rm(cacheFile, { force: true });
    const mock = serving(artifact([entry()]));

    const [a, b, c] = await Promise.all([loadPublicCatalog(), loadPublicCatalog(), loadPublicCatalog()]);

    expect(mock).toHaveBeenCalledOnce();
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });
});

describe("loadLocalCatalog", () => {
  it("is silent when the file does not exist", async () => {
    await expect(loadLocalCatalog()).resolves.toEqual([]);
  });

  it("reads a bare array, so a hand-written file needs no envelope", async () => {
    await writeFile(
      localFile,
      JSON.stringify([{ id: "mine", title: "Mine", url: "https://mine.example" }]),
      "utf8"
    );

    const items = await loadLocalCatalog();
    expect(items.map((item) => item.id)).toEqual(["mine"]);
  });

  it("returns nothing for a corrupt file rather than throwing", async () => {
    await writeFile(localFile, "{{{", "utf8");

    await expect(loadLocalCatalog()).resolves.toEqual([]);
  });

  it("applies the same whitelist as the public catalog", async () => {
    await writeFile(
      localFile,
      JSON.stringify([
        { id: "mine", title: "Mine", url: "https://mine.example", command: "docker", openingMode: "desktop_window" }
      ]),
      "utf8"
    );

    const [item] = await loadLocalCatalog();
    expect(item).not.toHaveProperty("command");
    expect(item!.openingMode).toBe("external_tab");
  });
});

describe("loadMergedDirectory", () => {
  it("returns exactly the built-in seed with no catalog and no local file", async () => {
    __setCatalogConfigForTests({ catalogUrl: null, cacheFile, localFile, maxAgeMs: 60_000 });

    const items = await loadMergedDirectory();
    expect(items.map((item) => item.id)).toEqual(appDirectory.map((item) => item.id));
  });

  it("appends catalog entries after the seed", async () => {
    serving(artifact([entry()]));

    const items = await loadMergedDirectory();
    expect(items).toHaveLength(appDirectory.length + 1);
    expect(items.at(-1)!.id).toBe("from-catalog");
  });

  it("lets a local entry override a public catalog entry with the same id", async () => {
    serving(artifact([entry({ title: "From Catalog" })]));
    await writeFile(
      localFile,
      JSON.stringify([
        { id: "from-catalog", title: "My Override", url: "https://mine.example", category: "mine" }
      ]),
      "utf8"
    );

    const items = await loadMergedDirectory();
    const overridden = items.find((item) => item.id === "from-catalog");
    expect(overridden).toMatchObject({ title: "My Override", url: "https://mine.example/", category: "mine" });
  });

  it("lets a local entry override a built-in seed entry with the same id", async () => {
    __setCatalogConfigForTests({ catalogUrl: null, cacheFile, localFile, maxAgeMs: 60_000 });
    const seededId = appDirectory[0]!.id;
    await writeFile(
      localFile,
      JSON.stringify([{ id: seededId, title: "Replaced", url: "https://replaced.example" }]),
      "utf8"
    );

    const items = await loadMergedDirectory();
    expect(items).toHaveLength(appDirectory.length);
    expect(items[0]).toMatchObject({ id: seededId, title: "Replaced" });
  });

  it("still returns the seed when the catalog host is unreachable and no cache exists", async () => {
    stubFetch(async () => {
      throw new Error("offline");
    });

    const items = await loadMergedDirectory();
    expect(items.map((item) => item.id)).toEqual(appDirectory.map((item) => item.id));
  });
});
