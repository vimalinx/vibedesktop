import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * persistence.ts delegates to the JSON file store, which reads VIBE_DATA_FILE
 * at module load — so each test points the env var at a fresh temp file and
 * re-imports both modules for an isolated store instance.
 */
type PersistenceModule = typeof import("@/lib/persistence");
let persistence: PersistenceModule;
let tmpDir: string;

const identity = {
  identityIssuer: "local:vibe-desktop",
  identitySubject: "local:owner",
  email: "owner@localhost",
  emailVerified: false,
  displayName: "Owner",
  avatarUrl: null
};

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), "vibe-persistence-"));
  process.env.VIBE_DATA_FILE = path.join(tmpDir, "store.json");
  vi.resetModules();
  persistence = await import("@/lib/persistence");
});

afterEach(async () => {
  delete process.env.VIBE_DATA_FILE;
  await rm(tmpDir, { recursive: true, force: true });
  vi.resetModules();
});

describe("persistence facade", () => {
  it("auto-provisions a user and desktop in the local JSON store", async () => {
    const user = await persistence.getOrCreateUser(identity);
    const again = await persistence.getOrCreateUser(identity);
    expect(again.id).toBe(user.id);

    const payload = await persistence.getDesktopPayload(user);
    expect(payload.desktop.userId).toBe(user.id);
    expect(payload.apps.length).toBeGreaterThan(0);
  });
});
