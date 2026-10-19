"use client";
import { useEffect } from "react";
import { activity, useActivities } from "@/lib/desktop-activity";
import { desktopData, DesktopDataError } from "@/lib/desktop-data";
export function CatalogActivity() {
  const tasks = useActivities();
  const ids = tasks
    .filter((t) => t.id.startsWith("catalog:") && t.state === "running")
    .map((t) => t.id.slice(8))
    .sort()
    .join(",");
  useEffect(() => {
    if (!ids) return;
    let pending = false,
      cancelled = false,
      failures = 0,
      retryAt = 0;
    const tick = async () => {
      if (pending || document.hidden || Date.now() < retryAt) return;
      pending = true;
      try {
        const statuses = await desktopData().catalogInstalls.list();
        if (cancelled) return;
        failures = 0;
        retryAt = 0;
        for (const id of ids.split(",")) {
          if (!statuses.some((status) => status.itemId === id))
            activity(
              "安装任务 / Installation",
              "error",
              "任务记录不可用，请打开应用商店核对安装状态。 / Open App Store to check the installation state.",
              `catalog:${id}`,
            );
        }
        for (const status of statuses.filter((s) =>
          ids.split(",").includes(s.itemId),
        )) {
          const state =
            status.state === "installed"
              ? "success"
              : ["failed", "needs_agent", "not_installed"].includes(
                    status.state,
                  )
                ? "error"
                : "running";
          activity(
            status.title,
            state,
            `${status.state} · ${status.message}`,
            `catalog:${status.itemId}`,
          );
        }
      } catch {
        /* A temporary network interruption does not mean an installation failed. */
        failures += 1;
        retryAt = Date.now() + Math.min(2000 * 2 ** failures, 30_000);
        // After about a minute without the local service, stop claiming the task is still running.
        if (!cancelled && failures >= 6) {
          for (const id of ids.split(","))
            activity(
              "安装任务 / Installation",
              "error",
              "暂时连不上本地服务，请稍后打开应用商店核对安装状态。 / The local service is unreachable; check the installation in App Store later.",
              `catalog:${id}`,
            );
        }
      } finally {
        pending = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [ids]);
  const versionPending = tasks.some(
    (task) => task.id === "version-update" && task.state === "running",
  );
  useEffect(() => {
    if (!versionPending) return;
    let pending = false,
      cancelled = false;
    const tick = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const info = await desktopData().version.read();
        if (!cancelled && info.task)
          activity(
            "版本管理 / Version management",
            info.task.state,
            info.task.detail,
            "version-update",
          );
      } catch (error) {
        if (!cancelled && error instanceof DesktopDataError && error.status === 404) {
          activity("版本管理 / Version management", "error", "当前版本不支持进度查询，请刷新桌面确认版本。 / Reload the desktop to check the installed version.", "version-update");
        }
        /* Restarting the service briefly interrupts polling. */
      } finally {
        pending = false;
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [versionPending]);
  return null;
}
