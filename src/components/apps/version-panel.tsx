"use client";
import { useEffect, useState } from "react";
import { useWindowVisible } from "@/components/window/window-visibility";
import { activity } from "@/lib/desktop-activity";
import { desktopData } from "@/lib/desktop-data";
import type { DesktopVersionInfo as VersionInfo } from "@/protocol/v1/types";
export function VersionPanel({ zh }: { zh: boolean }) {
  const [info, setInfo] = useState<VersionInfo | null>(null),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState<"update" | "rollback" | null>(null);
  const visible = useWindowVisible();
  async function load(check = false) {
    const data = await desktopData().version.read(check);
    setInfo((current) =>
      current && current.version === data.version && !data.latest
        ? { ...data, latest: current.latest }
        : data,
    );
    if (data.task)
      activity(
        zh ? "版本管理" : "Version management",
        data.task.state,
        data.task.detail,
        "version-update",
      );
  }
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let pending = false;
    const tick = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const data = await desktopData().version.read();
        if (!cancelled) {
          setInfo((current) =>
            current && current.version === data.version && !data.latest
              ? { ...data, latest: current.latest }
              : data,
          );
          setError("");
          if (data.task)
            activity(
              zh ? "版本管理" : "Version management",
              data.task.state,
              data.task.detail,
              "version-update",
            );
        }
      } catch {
        if (!cancelled)
          setError(
            zh
              ? "正在等待服务连接，更新时可能短暂中断。"
              : "Waiting for service; updates may briefly interrupt the connection.",
          );
      } finally {
        pending = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [visible, zh]);
  async function submit() {
    if (!confirm) return;
    setBusy(true);
    setError("");
    try {
      await desktopData().version.change(confirm, true);
      activity(
        zh ? "版本管理" : "Version management",
        "running",
        "",
        "version-update",
      );
      setConfirm(null);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-group">
      <h3>{zh ? "已安装版本" : "Installed version"}</h3>
      {info ? (
        <>
          <p>
            <strong>{info.version}</strong> ·{" "}
            {info.local
              ? zh
                ? "本地构建"
                : "Local build"
              : zh
                ? "正式版本"
                : "Release"}
          </p>
          <p>
            {zh ? "可回退版本" : "Previous version"}：{info.previous || "—"}
          </p>
          {info.local && (
            <p>
              {zh
                ? "本地修复版通过本地构建更新，避免被远程旧版本覆盖。"
                : "Local builds are updated from local builds to prevent overwriting fixes with an older release."}
            </p>
          )}
          <div className="productivity-actions">
            <button
              disabled={busy || !info.canUpdate}
              onClick={() => {
                setBusy(true);
                void load(true)
                  .catch((e) => setError(String(e)))
                  .finally(() => setBusy(false));
              }}
            >
              {zh ? "检查更新" : "Check for updates"}
            </button>
            <button
              disabled={
                busy || !info.canUpdate || info.task?.state === "running"
              }
              onClick={() => setConfirm("update")}
            >
              {zh ? "安装更新" : "Install update"}
            </button>
            <button
              disabled={
                busy || !info.canRollback || info.task?.state === "running"
              }
              onClick={() => setConfirm("rollback")}
            >
              {zh ? "回退旧版" : "Roll back"}
            </button>
          </div>
          {info.latest && (
            <p>
              {zh ? "最新发布" : "Latest release"}：{info.latest}
            </p>
          )}
          {info.task && (
            <div role="status">
              <strong>
                {info.task.state === "running"
                  ? zh
                    ? "更新进行中"
                    : "Update in progress"
                  : info.task.state === "success"
                    ? zh
                      ? "操作完成，请刷新桌面"
                      : "Completed; reload the desktop"
                    : zh
                      ? "更新需要处理"
                      : "Update needs attention"}
              </strong>
              <p>{info.task.detail}</p>
              {info.task.state === "success" && (
                <button onClick={() => window.location.reload()}>
                  {zh ? "刷新桌面" : "Reload desktop"}
                </button>
              )}
            </div>
          )}
          <details>
            <summary>
              {zh ? "当前版本更新说明" : "Current release notes"}
            </summary>
            <pre className="version-notes">
              {info.notes ||
                (zh ? "此构建未附带更新说明。" : "No release notes bundled.")}
            </pre>
          </details>
        </>
      ) : (
        <p>{zh ? "正在读取版本…" : "Reading version…"}</p>
      )}
      {error && <p role="alert">{error}</p>}
      {confirm && (
        <div role="alert">
          <p>
            {zh
              ? "操作会短暂重启桌面服务。请先保存应用中的工作；升级前会备份桌面数据。"
              : "This briefly restarts the desktop. Save your work first; desktop data will be backed up."}
          </p>
          <button disabled={busy} onClick={() => void submit()}>
            {zh ? "确认继续" : "Confirm and continue"}
          </button>
          <button disabled={busy} onClick={() => setConfirm(null)}>
            {zh ? "取消" : "Cancel"}
          </button>
        </div>
      )}
    </section>
  );
}
