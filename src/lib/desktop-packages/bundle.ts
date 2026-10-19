import type { DesktopPackageBundle } from "@/protocol/shell/package";
import { validatePackageManifest } from "@/protocol/v1/package";

export const maxPackageBytes = 16 * 1024 * 1024;
export const shellVersion = { major: 1, minor: 1 } as const;
export const builtInPackages = [
  { id: "org.vibedesktop.windows", name: "Windows 11", caption: "居中任务栏 · 云母玻璃 · 分屏吸附", url: "/desktop-packages/windows.vibepack.json", style: "windows" },
  { id: "org.vibedesktop.macos", name: "macOS", caption: "全局菜单 · 灵动 Dock · 空间层次", url: "/desktop-packages/macos.vibepack.json", style: "macos" },
] as const;
export const defaultPackageId = builtInPackages[0].id;
export const selectionKey = "vd:desktop-package:v1";
const safePath = (v: unknown): v is string => typeof v === "string" && v.length <= 180 && /^[a-zA-Z0-9_-][a-zA-Z0-9_./-]*$/.test(v) && !v.split("/").some(p => !p || p === "." || p === "..");
export function validateBundle(value: unknown): DesktopPackageBundle {
  if (!value || typeof value !== "object") throw new Error("Invalid desktop package.");
  const b = value as DesktopPackageBundle;
  validatePackageManifest(b.manifest);
  if (b.format !== "vibedesktop-bundle" || b.bundleVersion !== 1 || b.shell?.major !== 1 || !Number.isSafeInteger(b.shell.minMinor) || b.shell.minMinor < 0 || b.shell.minMinor > shellVersion.minor) throw new Error("Unsupported desktop shell version.");
  if (!b.files || typeof b.files !== "object" || Array.isArray(b.files) || Object.keys(b.files).length > 256) throw new Error("Invalid package files.");
  if (!b.entry || ![b.entry.html, b.entry.css, b.entry.module].every(safePath)) throw new Error("Invalid package entry.");
  for (const [name, file] of Object.entries(b.files)) {
    if (!safePath(name) || !file || typeof file !== "object" || typeof file.mediaType !== "string" || !/^[\w.+-]+\/[\w.+-]+$/.test(file.mediaType)) throw new Error("Invalid package asset.");
    if ((typeof file.text === "string") === (typeof file.base64 === "string")) throw new Error("An asset needs exactly one text or base64 value.");
    if (file.base64 !== undefined && (typeof file.base64 !== "string" || file.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64))) throw new Error("Invalid base64 asset.");
  }
  for (const [entry, type] of [[b.entry.html, "text/html"], [b.entry.css, "text/css"], [b.entry.module, "text/javascript"]]) {
    if (typeof b.files[entry]?.text !== "string" || b.files[entry].mediaType !== type) throw new Error(`Missing ${type} entry.`);
  }
  if (new TextEncoder().encode(JSON.stringify(b)).length > maxPackageBytes) throw new Error("Desktop packages must be at most 16 MiB.");
  return b;
}
