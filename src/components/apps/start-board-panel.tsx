"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DaemonHealth, LocalAppControlAction, LocalAppView, SystemStatus } from "@/lib/contracts";
import { desktopData } from "@/lib/desktop-data";
import type { I18nMessages } from "@/lib/i18n";

export function StartBoardPanel({
  t,
  localApps,
  onRefreshLocalApps,
  onControlLocalApp,
  onOpenLocalApp
}: {
  t: I18nMessages;
  localApps: LocalAppView[];
  onRefreshLocalApps: () => Promise<void>;
  onControlLocalApp: (id: string, action: LocalAppControlAction) => Promise<void>;
  onOpenLocalApp: (app: LocalAppView) => void;
}) {
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [daemon, setDaemon] = useState<DaemonHealth | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const refreshStatus = useCallback(async (includeApps = false) => {
    setRefreshing(true);
    const source = desktopData();
    const [nextSystem, nextDaemon] = await Promise.all([
      source.systemStatus?.read().catch(() => null) ?? Promise.resolve(null),
      source.localApps?.daemonStatus().catch(() => ({ ok: false })) ?? Promise.resolve({ ok: false }),
      ...(includeApps ? [onRefreshLocalApps()] : [])
    ]);
    setSystem(nextSystem);
    setDaemon(nextDaemon);
    setRefreshing(false);
    setAnnouncement(t.startBoard.statusUpdated);
  }, [onRefreshLocalApps, t.startBoard.statusUpdated]);

  useEffect(() => {
    void refreshStatus();
    const timer = window.setInterval(() => {
      if (!document.hidden) void refreshStatus();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [refreshStatus]);

  const totals = useMemo(() => localApps.reduce(
    (sum, app) => ({
      running: sum.running + Number(app.status.running),
      cpu: sum.cpu + app.status.cpuPercent,
      memory: sum.memory + app.status.memoryBytes,
      processes: sum.processes + app.status.processCount
    }),
    { running: 0, cpu: 0, memory: 0, processes: 0 }
  ), [localApps]);

  const hostMemoryUsed = system ? system.totalMemoryBytes - system.freeMemoryBytes : 0;

  async function control(app: LocalAppView, action: LocalAppControlAction) {
    setBusyId(app.id);
    setAnnouncement("");
    await onControlLocalApp(app.id, action);
    setBusyId(null);
    setAnnouncement(`${app.name}: ${action}`);
  }

  return (
    <div className="builtin-panel system-panel start-board-panel task-manager-panel">
      <header className="system-panel-header task-manager-header">
        <div>
          <h2>{t.startBoard.title}</h2>
          <p>{t.startBoard.description}</p>
        </div>
        <div className="system-panel-actions">
          <span className={`system-status ${daemon?.ok ? "is-live" : ""}`}>
            {t.startBoard.daemon}: {daemon?.ok ? t.startBoard.online : t.startBoard.offline}
          </span>
          <button disabled={refreshing} onClick={() => void refreshStatus(true)}>
            {refreshing ? t.startBoard.refreshing : t.startBoard.refresh}
          </button>
        </div>
      </header>

      <output className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </output>

      <section className="task-manager-summary" aria-label={t.startBoard.systemOverview}>
        <Metric label={t.startBoard.managedApps} value={`${totals.running}/${localApps.length}`} />
        <Metric label={t.startBoard.cpu} value={`${totals.cpu.toFixed(1)}%`} />
        <Metric label={t.startBoard.memory} value={formatBytes(totals.memory)} />
        <Metric label={t.startBoard.hostMemory} value={system ? formatPercent(hostMemoryUsed, system.totalMemoryBytes) : "—"} />
        <Metric label={t.startBoard.load} value={system ? system.loadAverage.toFixed(2) : "—"} />
        <Metric label={t.startBoard.uptime} value={system ? formatDuration(system.uptimeSeconds) : "—"} />
      </section>

      <section className="task-manager-services" aria-labelledby="task-manager-services-title">
        <header>
          <h3 id="task-manager-services-title">{t.startBoard.systemServices}</h3>
          <span>{system ? `${system.hostname} · ${system.platform} ${system.release}` : t.startBoard.unavailable}</span>
        </header>
        <div className="task-service-list">
          <ServiceRow
            name="Vibe Desktop"
            online={Boolean(system)}
            detail={system ? `PID ${system.desktop.pid} · ${formatBytes(system.desktop.rssBytes)} · ${system.desktop.nodeVersion}` : t.startBoard.unavailable}
          />
          <ServiceRow
            name="vibed"
            online={Boolean(daemon?.ok)}
            detail={daemon?.ok ? `${daemon.version ?? "—"} · ${formatDuration(daemon.uptime ?? 0)}` : t.startBoard.daemonUnavailable}
          />
        </div>
      </section>

      <section className="task-manager-processes" aria-labelledby="task-manager-processes-title">
        <header>
          <h3 id="task-manager-processes-title">{t.startBoard.managedProcesses}</h3>
          <span>{totals.processes} {t.startBoard.processes}</span>
        </header>
        {localApps.length === 0 ? (
          <p className="task-manager-empty">{t.startBoard.noProcesses}</p>
        ) : (
          <div className="task-process-table-wrap">
            <table className="task-process-table">
              <thead>
                <tr>
                  <th>{t.startBoard.name}</th>
                  <th>{t.startBoard.status}</th>
                  <th>PID</th>
                  <th>{t.startBoard.cpu}</th>
                  <th>{t.startBoard.memory}</th>
                  <th>{t.startBoard.port}</th>
                  <th>{t.startBoard.controls}</th>
                </tr>
              </thead>
              <tbody>
                {localApps.map((app) => {
                  const running = app.status.running;
                  const busy = busyId === app.id;
                  const status = running
                    ? app.status.healthy ? t.startBoard.healthy : t.startBoard.unhealthy
                    : app.status.lastError ? t.startBoard.error : t.startBoard.stopped;
                  return (
                    <tr key={app.id}>
                      <td>
                        <strong>{app.name}</strong>
                        {app.status.lastError ? <small title={app.status.lastError}>{app.status.lastError}</small> : null}
                      </td>
                      <td><span className={`task-process-state ${running ? app.status.healthy ? "is-live" : "is-warning" : ""}`}>{status}</span></td>
                      <td className="task-mono">{app.status.pid ?? "—"}</td>
                      <td className="task-mono">{app.status.cpuPercent.toFixed(1)}%</td>
                      <td className="task-mono">{formatBytes(app.status.memoryBytes)}</td>
                      <td className="task-mono">:{app.port}</td>
                      <td>
                        <div className="task-process-actions">
                          <button disabled={busy} onClick={() => void control(app, running ? "stop" : "start")}>
                            {running ? t.startBoard.stop : t.startBoard.start}
                          </button>
                          <button disabled={busy || !running} onClick={() => void control(app, "restart")}>{t.startBoard.restart}</button>
                          <button disabled={!running} onClick={() => onOpenLocalApp(app)}>{t.startBoard.open}</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function ServiceRow({ name, online, detail }: { name: string; online: boolean; detail: string }) {
  return (
    <div className="task-service-row">
      <span className={`task-service-dot ${online ? "is-live" : ""}`} aria-hidden="true" />
      <strong>{name}</strong>
      <span>{detail}</span>
    </div>
  );
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  const scaled = value / 1024 ** index;
  return `${scaled >= 100 || index === 0 ? scaled.toFixed(0) : scaled.toFixed(1)} ${units[index]}`;
}

function formatPercent(used: number, total: number): string {
  return total > 0 ? `${((used / total) * 100).toFixed(0)}%` : "—";
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0m";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}
