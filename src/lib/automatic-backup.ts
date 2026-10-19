import {
  appendBackupHistory,
  loadBackupHistory,
} from "@/lib/browser-local-assets";
import { createDesktopBackup } from "@/lib/desktop-backup";
import { readLocalJson } from "@/lib/desktop-helpers";
import { runActivity } from "@/lib/desktop-activity";
import { maxBackupBytes } from "@/lib/desktop-backup-contract";
export const backupScheduleKey = "vd:backup-schedule";
export function backupSchedule() {
  const raw = readLocalJson<{ hours?: number; retain?: number } | null>(
    backupScheduleKey,
    null,
  );
  return {
    hours: raw && [1, 24, 168].includes(raw.hours || 0) ? raw.hours! : 0,
    retain: raw && [3, 7, 14].includes(raw.retain || 0) ? raw.retain! : 7,
  };
}
let pending = false;
let retryAfter = 0;
export async function takeHistoryBackup(retain = 7) {
  return runActivity("桌面快照 / Desktop snapshot", async () => {
    const backup = await createDesktopBackup();
    if (new Blob([JSON.stringify(backup)]).size > maxBackupBytes)
      throw Error("Snapshot exceeds 48 MB / 快照超过 48 MB");
    await appendBackupHistory(backup, retain);
  });
}
export async function automaticBackupTick() {
  if (pending || document.hidden || Date.now() < retryAfter) return;
  const { hours, retain } = backupSchedule();
  if (!hours) return;
  pending = true;
  const saveIfDue = async () => {
    const history = await loadBackupHistory();
    if (
      history[0] &&
      Date.now() - new Date(history[0].backup.createdAt).getTime() <
        hours * 3600000
    )
      return;
    await takeHistoryBackup(retain);
  };
  try {
    if (typeof navigator !== "undefined" && navigator.locks) {
      await navigator.locks.request(
        "vibedesktop-automatic-backup",
        { ifAvailable: true },
        async (lock) => {
          if (lock) await saveIfDue();
        },
      );
    } else await saveIfDue();
  } catch (error) {
    retryAfter = Date.now() + 5 * 60_000;
    throw error;
  } finally {
    pending = false;
  }
}
