import { installedPackages, replacePackages } from "@/lib/desktop-packages/storage";
import { desktopData } from "@/lib/desktop-data";
import { exportLocalAssets, replaceLocalAssets } from "@/lib/browser-local-assets";
import { maxBackupBytes, validateBackup, type DesktopBackup } from "@/lib/desktop-backup-contract";

function preferences(): Record<string, string> {
  const entries: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith("vd:")) entries[key] = localStorage.getItem(key)!;
  }
  return entries;
}
function replacePreferences(values: Record<string, string>) {
  for (const key of Object.keys(preferences())) localStorage.removeItem(key);
  for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
}

export async function createDesktopBackup(): Promise<DesktopBackup> {
  const [payload, assets, packages] = await Promise.all([desktopData().loadDesktop(), exportLocalAssets(), installedPackages()]);
  return { format: "vibedesktop-backup", version: 1, createdAt: new Date().toISOString(),
    snapshot: { desktop: payload.desktop, apps: payload.apps }, assets, packages, preferences: preferences() };
}

export function downloadDesktopBackup(backup: DesktopBackup, prefix = "vibedesktop") {
  const json = JSON.stringify(backup);
  if (new Blob([json]).size > maxBackupBytes) throw new Error("Desktop backup exceeds 48 MB / 桌面备份超过 48 MB");
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Browser changes are transactional in IndexedDB; roll them back if the server rejects the restore. */
export async function restoreDesktopBackup(value: unknown, previous: DesktopBackup): Promise<void> {
  const next = validateBackup(value);
  try {
    await replacePackages(next.packages ?? []);
    await replaceLocalAssets(next.assets);
    replacePreferences(next.preferences);
    await desktopData().restoreDesktop(next.snapshot);
  } catch (error) {
    try {
      await replacePackages(previous.packages ?? []);
      await replaceLocalAssets(previous.assets);
      replacePreferences(previous.preferences);
    } catch {
      throw new Error("Restore failed and browser storage could not be rolled back. Import the recovery backup / 恢复失败且浏览器存储无法回滚，请导入恢复前的备份。");
    }
    throw error;
  }
}
