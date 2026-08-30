import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * store.ts reads VIBE_DATA_FILE at module load into a frozen absolute path,
 * so each test points the env var at a fresh temp file and re-imports the
 * module to get an isolated store instance.
 */
type StoreModule = typeof import("@/lib/store");
let store: StoreModule;
let tmpDir: string;

const identity = {
  identityIssuer: "development:vibe-desktop",
  identitySubject: "dev:alice",
  email: "alice@example.com",
  emailVerified: false,
  displayName: "Alice",
  avatarUrl: null
};

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), "vibe-store-"));
  process.env.VIBE_DATA_FILE = path.join(tmpDir, "store.json");
  vi.resetModules();
  store = await import("@/lib/store");
});

afterEach(async () => {
  delete process.env.VIBE_DATA_FILE;
  await rm(tmpDir, { recursive: true, force: true });
  vi.resetModules();
});

describe("store — user identity", () => {
  it("creates a user on first login and reuses it on subsequent logins", async () => {
    const user1 = await store.getOrCreateUser(identity);
    expect(user1.identitySubject).toBe("dev:alice");

    const user2 = await store.getOrCreateUser({
      ...identity,
      email: "alice2@example.com",
      displayName: "Alice R"
    });
    expect(user2.id).toBe(user1.id);
    expect(user2.email).toBe("alice2@example.com");
    expect(user2.displayName).toBe("Alice R");
  });
});

describe("store — desktop payload", () => {
  it("seeds the built-in apps on first access", async () => {
    const user = await store.getOrCreateUser(identity);
    const payload = await store.getDesktopPayload(user);

    expect(payload.desktop.userId).toBe(user.id);
    const titles = payload.apps.map((app) => app.title);
    expect(titles).toEqual(
      expect.arrayContaining(["Start Board", "Weather", "App Store", "Local WebApps", "Settings"])
    );
    expect(titles).not.toContain("WebUI Import");
    // Every seeded app has a sane grid position and unique id.
    const ids = payload.apps.map((app) => app.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const app of payload.apps) {
      expect(app.gridX).toBeGreaterThanOrEqual(0);
      expect(app.gridY).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("store — app CRUD", () => {
  async function seed() {
    const user = await store.getOrCreateUser(identity);
    await store.getDesktopPayload(user);
    return user;
  }

  it("appends a user app at the next free grid cell", async () => {
    const user = await seed();
    const payload = await store.createDesktopApp(user, {
      kind: "url",
      source: "user",
      title: "My App",
      url: "https://example.com",
      description: null,
      openingMode: "desktop_window",
      iconKind: "favicon",
      iconUrl: null
    });
    const created = payload.apps.find((app) => app.title === "My App");
    expect(created).toBeDefined();
    expect(created?.source).toBe("user");
    expect(created?.sortOrder).toBeGreaterThan(0);
  });

  it("honours an explicit grid position when supplied", async () => {
    const user = await seed();
    const payload = await store.createDesktopApp(user, {
      kind: "url",
      source: "user",
      title: "Pinned",
      url: "https://example.com",
      description: null,
      openingMode: "desktop_window",
      iconKind: "favicon",
      iconUrl: null,
      gridX: 12,
      gridY: 7
    });
    const created = payload.apps.find((app) => app.title === "Pinned");
    expect(created?.gridX).toBe(12);
    expect(created?.gridY).toBe(7);
  });

  it("updates editable fields and rejects unknown ids", async () => {
    const user = await seed();
    const created = await store.createDesktopApp(user, {
      kind: "url",
      source: "user",
      title: "Rename Me",
      url: "https://example.com",
      description: null,
      openingMode: "desktop_window",
      iconKind: "favicon",
      iconUrl: null
    });
    const app = created.apps.find((candidate) => candidate.title === "Rename Me");
    if (!app) throw new Error("seed app missing");

    const updated = await store.updateDesktopApp(user, app.id, {
      title: "Renamed",
      openingMode: "external_tab"
    });
    expect(updated.apps.find((candidate) => candidate.id === app.id)?.title).toBe("Renamed");
    expect(updated.apps.find((candidate) => candidate.id === app.id)?.openingMode).toBe("external_tab");

    await expect(store.updateDesktopApp(user, "no-such-id", { title: "X" })).rejects.toBeInstanceOf(
      store.StoreNotFoundError
    );
  });

  it("deletes an app and clears startAppId when the deleted app was the start app", async () => {
    const user = await seed();
    const created = await store.createDesktopApp(user, {
      kind: "url",
      source: "user",
      title: "Start",
      url: "https://example.com",
      description: null,
      openingMode: "desktop_window",
      iconKind: "favicon",
      iconUrl: null,
      setAsStart: true
    });
    const app = created.apps.find((candidate) => candidate.title === "Start");
    if (!app) throw new Error("seed app missing");
    expect(created.desktop.startAppId).toBe(app.id);

    const after = await store.deleteDesktopApp(user, app.id);
    expect(after.apps.find((candidate) => candidate.id === app.id)).toBeUndefined();
    expect(after.desktop.startAppId).toBeNull();

    await expect(store.deleteDesktopApp(user, app.id)).rejects.toBeInstanceOf(store.StoreNotFoundError);
  });
});

describe("store — desktop settings", () => {
  it("applies valid theme/shell and ignores unknown ids", async () => {
    const user = await store.getOrCreateUser(identity);
    await store.getDesktopPayload(user);

    const themed = await store.updateDesktop(user, { themeId: "terminal-lime", shellStyle: "compact" });
    expect(themed.desktop.themeId).toBe("terminal-lime");
    expect(themed.desktop.shellStyle).toBe("compact");

    const ignored = await store.updateDesktop(user, {
      themeId: "not-a-theme" as never,
      shellStyle: "not-a-style" as never
    });
    expect(ignored.desktop.themeId).toBe("terminal-lime");
    expect(ignored.desktop.shellStyle).toBe("compact");
  });

  it("only accepts a startAppId that belongs to this desktop", async () => {
    const user = await store.getOrCreateUser(identity);
    const created = await store.createDesktopApp(user, {
      kind: "url",
      source: "user",
      title: "Pinnable",
      url: "https://example.com",
      description: null,
      openingMode: "desktop_window",
      iconKind: "favicon",
      iconUrl: null
    });
    const app = created.apps.find((candidate) => candidate.title === "Pinnable");
    if (!app) throw new Error("seed app missing");

    const pinned = await store.updateDesktop(user, { startAppId: app.id });
    expect(pinned.desktop.startAppId).toBe(app.id);

    const cleared = await store.updateDesktop(user, { startAppId: null });
    expect(cleared.desktop.startAppId).toBeNull();

    const rejected = await store.updateDesktop(user, { startAppId: "foreign-id" });
    expect(rejected.desktop.startAppId).toBeNull();
  });
});
