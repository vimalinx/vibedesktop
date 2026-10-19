import type { DesktopPackageBundle } from "@/protocol/shell/package";
import { builtInPackages, validateBundle } from "@/lib/desktop-packages/bundle";
import { validateStoredPreferences } from "@/protocol/v1/package";
import { validateStyleOverrides } from "@/lib/style-packs";
import { desktopThemes, shellStyleOptions } from "@/lib/theme-data";
import { builtinWallpapers } from "@/lib/seed-data";

export type { DesktopSnapshot } from "@/protocol/v1/types";
import type { DesktopSnapshot } from "@/protocol/v1/types";
export interface AssetBackup { key: string; type: string; name: string; base64: string }
export interface DesktopBackup {
  format: "vibedesktop-backup";
  version: 1;
  createdAt: string;
  snapshot: DesktopSnapshot;
  preferences: Record<string, string>;
  assets: AssetBackup[];
  packages?: DesktopPackageBundle[];
}
export const maxBackupBytes = 48 * 1024 * 1024;
const id = (v: unknown): v is string => typeof v === "string" && /^[\w:-]{1,160}$/.test(v);
const text = (v: unknown, max = 4096): v is string => typeof v === "string" && v.length <= max;
const number = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100_000;
const oneOf = (v: unknown, values: unknown[]) => values.includes(v);
const http = (v: unknown) => {
  try { const u = new URL(String(v)); return ["https:", "http:"].includes(u.protocol) && !u.username && !u.password; } catch { return false; }
};
function check(condition: unknown): asserts condition {
  if (!condition) throw new Error("Invalid or unsupported desktop backup / 桌面备份无效或版本不受支持");
}

export function validateSnapshot(value: unknown): DesktopSnapshot {
  check(value && typeof value === "object" && JSON.stringify(value).length <= 8 * 1024 * 1024);
  const { desktop: d, apps } = value as DesktopSnapshot;
  check(d && id(d.id) && Array.isArray(apps) && apps.length <= 2000);
  check(oneOf(d.wallpaperKind, ["builtin", "custom_local"]) && oneOf(d.wallpaperFit, ["cover", "contain", "stretch", "center"]));
  check(builtinWallpapers.some(w => w.id === d.wallpaperBuiltinId) && desktopThemes.some(t => t.id === d.themeId) && shellStyleOptions.some(s => s.id === d.shellStyle));
  validateStyleOverrides(d);
  if (d.packagePreferences !== undefined) validateStoredPreferences(d.packagePreferences);
  check(d.accentOverride === null || typeof d.accentOverride === "string");
  check(d.fontOverride === null || typeof d.fontOverride === "string");
  check(number(d.seedVersion) && text(d.createdAt) && text(d.updatedAt));
  const ids = new Set<string>();
  for (const a of apps) {
    check(a && id(a.id) && !ids.has(a.id) && a.desktopId === d.id);
    ids.add(a.id);
    check(oneOf(a.kind, ["builtin", "url"]) && oneOf(a.source, ["seed", "directory", "user", "local"]));
    check(text(a.title) && (a.description === null || text(a.description)));
    check((a.kind === "builtin" && a.url === null) || http(a.url));
    check(oneOf(a.openingMode, ["desktop_window", "external_tab"]) && oneOf(a.iconKind, ["builtin", "favicon", "custom_local", "fallback"]));
    check(a.iconUrl === null || (text(a.iconUrl, 1024 * 1024) && (http(a.iconUrl) || /^\/[^/]/.test(a.iconUrl) || /^vd:\/\/icon\/[\w-]+$/.test(a.iconUrl) || /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(a.iconUrl))));
    check([a.gridX, a.gridY, a.sortOrder].every(number));
    check([a.spanColumns, a.spanRows].every(v => Number.isInteger(v) && v >= 1 && v <= 12));
    check(text(a.tileVariant, 80) && a.metadata && typeof a.metadata === "object" && !Array.isArray(a.metadata));
    check(text(a.createdAt) && text(a.updatedAt));
  }
  check(d.startAppId === null || ids.has(d.startAppId));
  return { desktop: d, apps };
}

export function validateBackup(value: unknown): DesktopBackup {
  check(value && typeof value === "object");
  const b = value as DesktopBackup;
  check(b.format === "vibedesktop-backup" && b.version === 1 && text(b.createdAt));
  validateSnapshot(b.snapshot);
  if (b.packages !== undefined) {
    check(Array.isArray(b.packages) && b.packages.length <= 16);
    const seen = new Set<string>();
    for (const bundle of b.packages) {
      validateBundle(bundle);
      check(!seen.has(bundle.manifest.id) && !builtInPackages.some(p => p.id === bundle.manifest.id));
      seen.add(bundle.manifest.id);
    }
  }
  check(b.preferences && typeof b.preferences === "object" && !Array.isArray(b.preferences));
  check(Object.entries(b.preferences).length <= 5000);
  for (const [key, value] of Object.entries(b.preferences)) check(/^vd:[\w:-]+$/.test(key) && text(value, 2 * 1024 * 1024));
  check(Array.isArray(b.assets) && b.assets.length <= 4000);
  const keys = new Set<string>();
  for (const asset of b.assets) {
    check(asset && /^(desktop:[\w:-]+:wallpaper|app:[\w:-]+:icon)$/.test(asset.key) && !keys.has(asset.key));
    keys.add(asset.key);
    check(text(asset.name, 1024) && /^image\/(png|jpeg|webp|gif|svg\+xml|avif|x-icon|vnd.microsoft.icon)$/.test(asset.type));
    check(text(asset.base64, 32 * 1024 * 1024) && asset.base64.length > 0 && asset.base64.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(asset.base64));
  }
  check(b.snapshot.desktop.wallpaperKind !== "custom_local" || keys.has(`desktop:${b.snapshot.desktop.id}:wallpaper`));
  for (const app of b.snapshot.apps) check(app.iconKind !== "custom_local" || keys.has(`app:${app.id}:icon`));
  return b;
}
