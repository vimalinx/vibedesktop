// @ts-check
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { chmod, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ConfigStore } from "./config-store.mjs";

/**
 * LocalAppConfig icon field persistence + normalization. The icon fields are
 * additive — old records on disk (no iconKind/iconUrl) must still load and
 * project to a safe fallback without a schema migration.
 */

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "vd-config-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("ConfigStore — icon field", () => {
  it("persists iconKind + iconUrl through create → load", async () => {
    const store = new ConfigStore(dir);
    const cfg = await store.create({
      name: "Ollama",
      command: "ollama",
      args: ["serve"],
      port: 11434,
      iconKind: "favicon",
      iconUrl: "/icons/local-apps/ollama.svg"
    });

    expect(cfg.iconKind).toBe("favicon");
    expect(cfg.iconUrl).toBe("/icons/local-apps/ollama.svg");

    const [loaded] = await store.load();
    expect(loaded.iconKind).toBe("favicon");
    expect(loaded.iconUrl).toBe("/icons/local-apps/ollama.svg");
  });

  it("defaults to fallback / null when no icon is supplied", async () => {
    const store = new ConfigStore(dir);
    const cfg = await store.create({ name: "Bare", command: "node", port: 3000 });

    expect(cfg.iconKind).toBe("fallback");
    expect(cfg.iconUrl).toBeNull();

    const [loaded] = await store.load();
    expect(loaded.iconKind).toBe("fallback");
    expect(loaded.iconUrl).toBeNull();
  });

  it("normalizes unknown iconKind and blank iconUrl", async () => {
    const store = new ConfigStore(dir);
    const cfg = await store.create({
      name: "Weird",
      command: "node",
      port: 3000,
      iconKind: "bogus",
      iconUrl: "   "
    });

    expect(cfg.iconKind).toBe("fallback");
    expect(cfg.iconUrl).toBeNull();
  });

  it("updates iconKind + iconUrl and leaves unspecified fields untouched", async () => {
    const store = new ConfigStore(dir);
    const created = await store.create({
      name: "Ollama",
      command: "ollama",
      port: 11434,
      iconKind: "favicon",
      iconUrl: "/icons/local-apps/ollama.svg"
    });

    const updated = await store.update(created.id, { iconKind: "custom_local", iconUrl: null });
    expect(updated.iconKind).toBe("custom_local");
    expect(updated.iconUrl).toBeNull();
    // Unspecified fields are preserved.
    expect(updated.name).toBe("Ollama");
    expect(updated.command).toBe("ollama");
    expect(updated.port).toBe(11434);

    const [loaded] = await store.load();
    expect(loaded.iconKind).toBe("custom_local");
  });

  it("loads pre-existing records that have no icon fields (no migration)", async () => {
    // Simulate an old daemon-config.json written before the icon field existed.
    const legacy = {
      version: 1,
      apps: [
        {
          id: "legacy-1",
          name: "Legacy",
          command: "node",
          port: 4000,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        }
      ]
    };
    await writeFile(path.join(dir, "daemon-config.json"), JSON.stringify(legacy), "utf8");

    const store = new ConfigStore(dir);
    const [loaded] = await store.load();
    expect(loaded.id).toBe("legacy-1");
    // No icon fields → consumers treat as fallback/initials (today's behavior).
    expect(loaded.iconKind).toBeUndefined();
    expect(loaded.iconUrl).toBeUndefined();
  });
});

describe("ConfigStore — serialized mutations", () => {
  it("keeps launch recipes and environment overrides owner-readable only", async () => {
    if (process.platform === "win32") return;

    await chmod(dir, 0o755);
    const store = new ConfigStore(dir);
    const created = await store.create({
      name: "Private",
      command: "node",
      port: 3000,
      env: { LOCAL_ONLY_VALUE: "private" }
    });
    const filePath = path.join(dir, "daemon-config.json");
    expect((await stat(dir)).mode & 0o777).toBe(0o700);
    expect((await stat(filePath)).mode & 0o777).toBe(0o600);

    // Older versions could leave this file at 0644. Any later mutation must
    // repair the mode instead of preserving that exposure through rename.
    await chmod(filePath, 0o644);
    await store.update(created.id, { name: "Still private" });
    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
  });

  it("keeps every concurrent create instead of losing read-modify-write updates", async () => {
    const store = new ConfigStore(dir);
    const created = await Promise.all(
      Array.from({ length: 16 }, (_, index) =>
        store.create({ name: `App ${index}`, command: "node", port: 3000 + index })
      )
    );

    const loaded = await store.load();
    expect(loaded).toHaveLength(16);
    expect(new Set(loaded.map((app) => app.id))).toEqual(new Set(created.map((app) => app.id)));
  });

  it("continues processing later mutations after one validation failure", async () => {
    const store = new ConfigStore(dir);

    const rejected = store.create({ name: "Bad", command: "node", port: 0 });
    const valid = store.create({ name: "Good", command: "node", port: 3000 });

    await expect(rejected).rejects.toMatchObject({ code: "invalid_request" });
    await expect(valid).resolves.toMatchObject({ name: "Good", port: 3000 });
    await expect(store.load()).resolves.toHaveLength(1);
  });
});
