import { readFileSync } from "node:fs";
import type { DesktopPackageBundle } from "@/protocol/shell/package";
import { describe, it, expect } from "vitest";
import { validateBackup, type DesktopBackup } from "./desktop-backup-contract";
import * as core from "./desktop-core";
function backup(): DesktopBackup {
  const store = core.createEmptyStore();
  const user = core.getOrCreateUser(store, { identityIssuer: "test", identitySubject: "test", email: "t@local", displayName: "T", emailVerified: false, avatarUrl: null });
  const { desktop, apps } = core.getDesktopPayload(store, user);
  return { format: "vibedesktop-backup", version: 1, createdAt: new Date().toISOString(), snapshot: { desktop, apps }, preferences: { "vd:locale:v1": "zh" }, assets: [] };
}
describe("backup validation", () => {
  it("validates portable code before restoring and refuses built-in replacement or duplicate IDs", () => {
    const b = backup();
    const bundle: DesktopPackageBundle = JSON.parse(readFileSync("public/desktop-packages/windows.vibepack.json", "utf8"));
    b.packages = [bundle];
    expect(() => validateBackup(b)).toThrow();
    bundle.manifest.id = "org.example.backup";
    expect(validateBackup(b)).toBe(b);
    b.packages.push(bundle); expect(() => validateBackup(b)).toThrow(); b.packages.pop();
    delete bundle.files[bundle.entry.module]; expect(() => validateBackup(b)).toThrow();
  });
  it("round-trips a seeded desktop", () => { const b = backup(); expect(validateBackup(JSON.parse(JSON.stringify(b)))).toEqual(b); });
  it("refuses active URLs, duplicate IDs and unrelated storage keys", () => {
    const b = backup(); b.snapshot.apps.find(a => a.kind === "url")!.url = "javascript:alert(1)";
    expect(() => validateBackup(b)).toThrow();
    const c = backup(); c.snapshot.apps.push(c.snapshot.apps[0]); expect(() => validateBackup(c)).toThrow();
    const d = backup(); d.preferences["unrelated-token"] = "private"; expect(() => validateBackup(d)).toThrow();
  });
  it("accepts multi-megabyte wallpaper data without exhausting the regex stack", () => {
    const b = backup();
    b.assets.push({ key: `desktop:${b.snapshot.desktop.id}:wallpaper`, type: "image/png", name: "large.png", base64: "a".repeat(8 * 1024 * 1024) });
    expect(validateBackup(b)).toBe(b);
  });
  it("requires the image bytes for custom wallpaper and validates base64 before any mutation", () => {
    const b = backup(); b.snapshot.desktop.wallpaperKind = "custom_local";
    expect(() => validateBackup(b)).toThrow();
    b.assets.push({ key: `desktop:${b.snapshot.desktop.id}:wallpaper`, type: "image/png", name: "wall.png", base64: "aGk=" });
    expect(validateBackup(b)).toBe(b);
    b.assets[0].base64 = "bad!"; expect(() => validateBackup(b)).toThrow();
  });
});
