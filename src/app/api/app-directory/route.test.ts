import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/app-directory/route";
import { POST } from "@/app/api/app-directory/[id]/add/route";
import { __setCatalogConfigForTests, __setCatalogFetchForTests } from "@/lib/catalog-source";
import { catalogFormatVersion } from "@/lib/catalog-contract";
import { appDirectory } from "@/lib/seed-data";
import type { AppDirectoryItem, DesktopPayload } from "@/lib/contracts";

const catalogUrl = "https://catalog.example/catalog.json";
const pngIcon = "data:image/png;base64,iVBORw0KGgo=";

let workDir: string;

const addDirectoryApp = vi.hoisted(() => vi.fn());
const getOrCreateUser = vi.hoisted(() => vi.fn());

// The route's job is resolving an id against the merged directory and mapping
// errors; persistence is exercised by its own tests. `getOrCreateUser` is
// mocked too because `requireCurrentUser` reaches through the same module and
// would otherwise touch the real JSON store on disk.
vi.mock("@/lib/persistence", () => ({
  addDirectoryApp,
  getOrCreateUser
}));

function catalogBody(entries: unknown[]): string {
  return JSON.stringify({
    formatVersion: catalogFormatVersion,
    generatedAt: "2026-08-11T00:00:00.000Z",
    entries
  });
}

function serving(body: string): void {
  __setCatalogFetchForTests(
    vi.fn(async () =>
      new Response(body, { status: 200, headers: { "content-type": "application/json" } })
    ) as unknown as typeof fetch
  );
}

function addRequest(): Request {
  // The route's CSRF guard requires a same-origin Origin (or Referer) header;
  // in tests the expected origin is derived from the request URL itself.
  return new Request("http://localhost:3000/api/app-directory/x/add", {
    method: "POST",
    headers: { origin: "http://localhost:3000" }
  });
}

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "vd-directory-route-"));
  __setCatalogConfigForTests({
    catalogUrl: null,
    cacheFile: path.join(workDir, "cache.json"),
    localFile: path.join(workDir, "local.json"),
    maxAgeMs: 60_000
  });
  addDirectoryApp.mockReset();
  addDirectoryApp.mockImplementation(async () => ({ apps: [] }) as unknown as DesktopPayload);
  getOrCreateUser.mockReset();
  getOrCreateUser.mockImplementation(async () => ({ id: "local-user" }));
});

afterEach(async () => {
  __setCatalogConfigForTests(null);
  __setCatalogFetchForTests(null);
  vi.restoreAllMocks();
  await rm(workDir, { recursive: true, force: true });
});

describe("GET /api/app-directory", () => {
  it("keeps its response shape and degrades to the built-in seed", async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const body = (await response.json()) as { items: AppDirectoryItem[] };
    expect(body.items.map((item) => item.id)).toEqual(appDirectory.map((item) => item.id));
  });

  it("includes catalog entries when a catalog is configured", async () => {
    __setCatalogConfigForTests({
      catalogUrl,
      cacheFile: path.join(workDir, "cache.json"),
      localFile: path.join(workDir, "local.json"),
      maxAgeMs: 60_000
    });
    serving(catalogBody([{ id: "extra", title: "Extra", url: "https://extra.example", icon: pngIcon }]));

    const body = (await (await GET()).json()) as { items: AppDirectoryItem[] };
    expect(body.items).toHaveLength(appDirectory.length + 1);
    expect(body.items.at(-1)).toMatchObject({ id: "extra", openingMode: "external_tab", iconUrl: pngIcon });
  });

  it("serves a local entry that overrides a built-in seed id", async () => {
    const seededId = appDirectory[0]!.id;
    await writeFile(
      path.join(workDir, "local.json"),
      JSON.stringify([{ id: seededId, title: "Mine", url: "https://mine.example" }]),
      "utf8"
    );

    const body = (await (await GET()).json()) as { items: AppDirectoryItem[] };
    expect(body.items[0]).toMatchObject({ id: seededId, title: "Mine" });
  });
});

describe("POST /api/app-directory/[id]/add", () => {
  it("adds a built-in seed entry", async () => {
    const seeded = appDirectory[0]!;

    const response = await POST(addRequest(), routeContext(seeded.id));
    expect(response.status).toBe(201);
    expect(addDirectoryApp).toHaveBeenCalledOnce();
    expect(addDirectoryApp.mock.calls[0]![1]).toMatchObject({ id: seeded.id, url: seeded.url });
  });

  it("adds an entry that came from the public catalog, not just the compiled-in seed", async () => {
    __setCatalogConfigForTests({
      catalogUrl,
      cacheFile: path.join(workDir, "cache.json"),
      localFile: path.join(workDir, "local.json"),
      maxAgeMs: 60_000
    });
    serving(
      catalogBody([
        { id: "extra", title: "Extra", url: "https://extra.example", icon: pngIcon, category: "self-hosted" }
      ])
    );

    const response = await POST(addRequest(), routeContext("extra"));
    expect(response.status).toBe(201);
    expect(addDirectoryApp.mock.calls[0]![1]).toMatchObject({
      id: "extra",
      openingMode: "external_tab",
      iconUrl: pngIcon
    });
  });

  it("adds an entry that came from the local collection file", async () => {
    await writeFile(
      path.join(workDir, "local.json"),
      JSON.stringify([{ id: "mine", title: "Mine", url: "https://mine.example" }]),
      "utf8"
    );

    const response = await POST(addRequest(), routeContext("mine"));
    expect(response.status).toBe(201);
    expect(addDirectoryApp.mock.calls[0]![1]).toMatchObject({ id: "mine", url: "https://mine.example/" });
  });

  it("still 404s an unknown id", async () => {
    const response = await POST(addRequest(), routeContext("no-such-entry"));
    expect(response.status).toBe(404);
    expect(addDirectoryApp).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin mutation before resolving anything", async () => {
    const request = new Request("http://localhost:3000/api/app-directory/x/add", {
      method: "POST",
      headers: { origin: "https://evil.example" }
    });

    const response = await POST(request, routeContext(appDirectory[0]!.id));
    expect(response.status).toBe(403);
    expect(addDirectoryApp).not.toHaveBeenCalled();
  });
});
