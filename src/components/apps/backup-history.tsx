"use client";
import { useEffect, useState } from "react";
import {
  backupSchedule,
  backupScheduleKey,
  takeHistoryBackup,
} from "@/lib/automatic-backup";
import {
  loadBackupHistory,
  deleteBackupHistory,
  type BackupHistoryEntry,
} from "@/lib/browser-local-assets";
import { downloadDesktopBackup } from "@/lib/desktop-backup";
import type { DesktopBackup } from "@/lib/desktop-backup-contract";
import { writeLocalJson } from "@/lib/desktop-helpers";
export function BackupHistory({
  zh,
  onPreview,
}: {
  zh: boolean;
  onPreview: (backup: DesktopBackup) => void;
}) {
  const [schedule, setSchedule] = useState({ hours: 0, retain: 7 });
  const [rows, setRows] = useState<BackupHistoryEntry[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const refresh = () => loadBackupHistory().then(setRows);
  useEffect(() => {
    setSchedule(backupSchedule());
    void refresh().catch((e) => setError(e instanceof Error && e.message ? e.message : (zh ? "备份操作失败，请稍后重试。" : "The backup action failed. Try again.")));
  }, [zh]);
  function change(next: typeof schedule) {
    setSchedule(next);
    writeLocalJson(backupScheduleKey, next);
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await takeHistoryBackup(schedule.retain);
      await refresh();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : (zh ? "备份操作失败，请稍后重试。" : "The backup action failed. Try again."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-group">
      <h3>{zh ? "自动备份与历史" : "Automatic backups & history"}</h3>
      <p>
        {zh
          ? "桌面打开期间定期保存到此浏览器；关闭期间不运行，下次打开后补做。浏览器数据被清理时历史也会丢失，请另行导出重要备份。"
          : "Snapshots run while this desktop is open and catch up on the next visit. Clearing browser data removes history; export important backups."}
      </p>
      <div className="productivity-actions">
        <label>
          {zh ? "备份频率" : "Frequency"}
          <select
            aria-label={zh ? "备份频率" : "Frequency"}
            value={schedule.hours}
            onChange={(e) =>
              change({ ...schedule, hours: Number(e.target.value) })
            }
          >
            <option value={0}>{zh ? "关闭" : "Off"}</option>
            <option value={1}>{zh ? "每小时" : "Hourly"}</option>
            <option value={24}>{zh ? "每天" : "Daily"}</option>
            <option value={168}>{zh ? "每周" : "Weekly"}</option>
          </select>
        </label>
        <label>
          {zh ? "保留份数" : "Keep snapshots"}
          <select
            aria-label={zh ? "保留份数" : "Keep snapshots"}
            value={schedule.retain}
            onChange={(e) =>
              change({ ...schedule, retain: Number(e.target.value) })
            }
          >
            {[3, 7, 14].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <button disabled={busy} onClick={() => void save()}>
          {zh ? "立即保存快照" : "Save snapshot now"}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {!rows.length && <p>{zh ? "尚无历史快照。" : "No snapshots yet."}</p>}
      {rows.map((row) => (
        <div className="productivity-row" key={row.id}>
          <span>
            {new Date(row.backup.createdAt).toLocaleString()} ·{" "}
            {row.backup.snapshot.apps.length} {zh ? "个应用" : "apps"}
          </span>
          <button disabled={busy} onClick={() => onPreview(row.backup)}>
            {zh ? "预览恢复" : "Preview restore"}
          </button>
          <button
            onClick={() => {
              try {
                downloadDesktopBackup(row.backup);
              } catch (e) {
                setError(e instanceof Error && e.message ? e.message : (zh ? "备份操作失败，请稍后重试。" : "The backup action failed. Try again."));
              }
            }}
          >
            {zh ? "导出" : "Export"}
          </button>
          <button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void deleteBackupHistory(row.id)
                .then(refresh)
                .catch((e) => setError(e instanceof Error && e.message ? e.message : (zh ? "备份操作失败，请稍后重试。" : "The backup action failed. Try again.")))
                .finally(() => setBusy(false));
            }}
          >
            {zh ? "删除快照" : "Delete snapshot"}
          </button>
        </div>
      ))}
    </section>
  );
}
