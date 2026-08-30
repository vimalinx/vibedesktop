"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DaemonHealth, LocalAppDiscoveryCandidate, LocalAppView } from "@/lib/contracts";
import { saveLocalAsset } from "@/lib/browser-local-assets";
import { desktopData } from "@/lib/desktop-data";

interface LocalAppsText {
  title: string;
  eyebrow: string;
  description: string;
  daemonOnline: string;
  daemonOffline: string;
  daemonOfflineHint: string;
  addWebApp: string;
  scan: string;
  scanning: string;
  discoveryTitle: string;
  discoveryHint: string;
  hideDiscovery: string;
  register: string;
  registered: string;
  externalRunning: string;
  bookmarkOnly: string;
  externalConfirm: string;
  noApps: string;
  noAppsHint: string;
  start: string;
  stop: string;
  restart: string;
  open: string;
  edit: string;
  save: string;
  cancel: string;
  delete: string;
  deleteConfirm: string;
  logs: string;
  noLogs: string;
  field: {
    name: string;
    namePlaceholder: string;
    icon: string;
    command: string;
    commandPlaceholder: string;
    args: string;
    argsPlaceholder: string;
    cwd: string;
    cwdPlaceholder: string;
    port: string;
    portPlaceholder: string;
    autoStart: string;
    restart: string;
    restartNo: string;
    restartOnCrash: string;
    restartAlways: string;
  };
  status: {
    running: string;
    stopped: string;
    error: string;
    booting: string;
    pid: string;
    startedAt: string;
    port: string;
    cpu: string;
    memory: string;
    processes: string;
    io: string;
  };
  toast: {
    created: string;
    started: string;
    stopped: string;
    deleted: string;
    saved: string;
    registered: string;
    failed: string;
  };
}

const TEXT: Record<"en" | "zh", LocalAppsText> = {
  en: {
    title: "Local WebApps",
    eyebrow: "Managed by vibe-daemon",
    description: "Start, monitor, and supervise local WebUIs as daemon-owned tasks.",
    daemonOnline: "Daemon online",
    daemonOffline: "Daemon offline",
    daemonOfflineHint: "Install and start vibed (`npm run daemon` from a checkout, or the vibed installer), then this panel comes alive.",
    addWebApp: "Add WebApp",
    scan: "Scan this computer",
    scanning: "Scanning…",
    discoveryTitle: "Discovered WebUIs",
    discoveryHint: "Launchable services can be registered as managed tasks. External processes keep running until you stop them outside Vibe Desktop.",
    hideDiscovery: "Hide results",
    register: "Register",
    registered: "Managed",
    externalRunning: "External running",
    bookmarkOnly: "Bookmark only",
    externalConfirm: "This WebUI is already running outside Vibe Desktop. Register its launch recipe now? Stop the external instance before starting the managed copy.",
    noApps: "No local WebApps registered yet",
    noAppsHint: "Add your first app — a command, a port, and you're ready.",
    start: "Start",
    stop: "Stop",
    restart: "Restart",
    open: "Open in window",
    edit: "Edit",
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    deleteConfirm: "Delete this WebApp? The running process will be stopped.",
    logs: "Logs",
    noLogs: "No log output yet.",
    field: {
      name: "Name",
      namePlaceholder: "My WebApp",
      icon: "Icon",
      command: "Command",
      commandPlaceholder: "node",
      args: "Arguments (one per line)",
      argsPlaceholder: "examples/hello-webapp/server.mjs\n--port 7878",
      cwd: "Working directory (optional)",
      cwdPlaceholder: ".",
      port: "Port",
      portPlaceholder: "7878",
      autoStart: "Auto-start when daemon boots",
      restart: "Restart policy",
      restartNo: "Don't restart",
      restartOnCrash: "On crash (auto-restart)",
      restartAlways: "Always (keep alive)",
    },
    status: {
      running: "Running",
      stopped: "Stopped",
      error: "Error",
      booting: "Starting",
      pid: "PID",
      startedAt: "Started",
      port: "Port",
      cpu: "CPU",
      memory: "Memory",
      processes: "Processes",
      io: "Disk I/O",
    },
    toast: {
      created: "WebApp added.",
      started: "Started.",
      stopped: "Stopped.",
      deleted: "Deleted.",
      saved: "Saved.",
      registered: "WebUI registered as a managed task.",
      failed: "Action failed.",
    },
  },
  zh: {
    title: "本地 WebApp",
    eyebrow: "由 vibe-daemon 管理",
    description: "启动、监控并管理由 vibe-daemon 托管的本地 WebUI 任务。",
    daemonOnline: "守护进程在线",
    daemonOffline: "守护进程离线",
    daemonOfflineHint: "安装并启动 vibed（从源码目录运行 `npm run daemon`，或使用 vibed 安装脚本），此面板即可使用。",
    addWebApp: "添加 WebApp",
    scan: "扫描本机",
    scanning: "正在扫描…",
    discoveryTitle: "发现的 WebUI",
    discoveryHint: "可启动的服务可以注册为受管任务。外部进程仍会继续运行，启动受管副本前需要先停止外部实例。",
    hideDiscovery: "收起结果",
    register: "注册管理",
    registered: "已管理",
    externalRunning: "外部运行中",
    bookmarkOnly: "仅可做书签",
    externalConfirm: "这个 WebUI 已在 Vibe Desktop 之外运行。现在注册它的启动配方吗？启动受管副本前，需要先停止外部实例。",
    noApps: "还没有注册的本地 WebApp",
    noAppsHint: "添加你的第一个应用 —— 一条命令、一个端口，即可开始。",
    start: "启动",
    stop: "停止",
    restart: "重启",
    open: "在窗口打开",
    edit: "编辑",
    save: "保存",
    cancel: "取消",
    delete: "删除",
    deleteConfirm: "删除这个 WebApp？正在运行的进程会被停止。",
    logs: "日志",
    noLogs: "暂无日志输出。",
    field: {
      name: "名称",
      namePlaceholder: "我的 WebApp",
      icon: "图标",
      command: "命令",
      commandPlaceholder: "node",
      args: "参数（每行一个）",
      argsPlaceholder: "examples/hello-webapp/server.mjs\n--port 7878",
      cwd: "工作目录（可选）",
      cwdPlaceholder: ".",
      port: "端口",
      portPlaceholder: "7878",
      autoStart: "daemon 启动时自动拉起",
      restart: "重启策略",
      restartNo: "不重启",
      restartOnCrash: "崩溃时（自动重启）",
      restartAlways: "始终（保活）",
    },
    status: {
      running: "运行中",
      stopped: "已停止",
      error: "错误",
      booting: "启动中",
      pid: "PID",
      startedAt: "启动时间",
      port: "端口",
      cpu: "CPU",
      memory: "内存",
      processes: "进程数",
      io: "磁盘 I/O",
    },
    toast: {
      created: "WebApp 已添加。",
      started: "已启动。",
      stopped: "已停止。",
      deleted: "已删除。",
      saved: "已保存。",
      registered: "WebUI 已注册为受管任务。",
      failed: "操作失败。",
    },
  },
};

interface AppDraft {
  name: string;
  command: string;
  args: string;
  cwd: string;
  port: string;
  autoStart: boolean;
  restart: "no" | "on-crash" | "always";
}

const emptyDraft: AppDraft = {
  name: "",
  command: "node",
  args: "",
  cwd: "",
  port: "7878",
  autoStart: false,
  restart: "no"
};

export function LocalAppsPanel({
  locale,
  apps,
  onRefresh,
  onOpenUrlApp
}: {
  locale: "en" | "zh";
  /** The desktop's single local-app poll owns this list; the panel only reads it. */
  apps: LocalAppView[];
  onRefresh: () => Promise<void>;
  onOpenUrlApp: (input: { id: string; url: string; title: string }) => void;
}) {
  const t = TEXT[locale] ?? TEXT.en;
  const localApps = desktopData().localApps;
  const [health, setHealth] = useState<DaemonHealth | null>(null);
  const [status, setStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<AppDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [logsFor, setLogsFor] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const logsRequestRef = useRef(0);
  const [customIconFile, setCustomIconFile] = useState<File | null>(null);
  const [discovered, setDiscovered] = useState<LocalAppDiscoveryCandidate[] | null>(null);
  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  const [registeringCandidate, setRegisteringCandidate] = useState<string | null>(null);

  // Two separate concerns, deliberately not merged: the *list* is polled once by
  // the desktop (this panel receives it as a prop), while the daemon *health*
  // badge is this panel's own and has to keep reflecting reality while it is
  // open — a daemon that dies must not leave a stale "online" badge.
  const refreshHealth = useCallback(async () => {
    setHealth(await localApps.daemonStatus());
  }, [localApps]);

  /** After a mutation: re-read health and ask the desktop to re-poll the list. */
  const refresh = useCallback(async () => {
    await Promise.all([refreshHealth(), onRefresh()]);
  }, [refreshHealth, onRefresh]);

  useEffect(() => {
    void refreshHealth();
    const timer = window.setInterval(() => {
      if (!document.hidden) void refreshHealth();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [refreshHealth]);

  useEffect(() => {
    if (!logsFor) return;
    const appId = logsFor;
    let cancelled = false;

    const refreshOpenLogs = async () => {
      const request = ++logsRequestRef.current;
      try {
        const nextLogs = await localApps.logs(appId);
        if (!cancelled && request === logsRequestRef.current) setLogs(nextLogs);
      } catch {
        if (!cancelled && request === logsRequestRef.current) setLogs([]);
      }
    };

    void refreshOpenLogs();
    const timer = window.setInterval(() => {
      if (!document.hidden) void refreshOpenLogs();
    }, 2000);
    return () => {
      cancelled = true;
      logsRequestRef.current += 1;
      window.clearInterval(timer);
    };
  }, [localApps, logsFor]);

  async function submitDraft() {
    const args = draft.args
      .split(/\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const port = Number(draft.port);
    if (!draft.name.trim() || !draft.command.trim() || !Number.isFinite(port)) {
      setStatus(t.toast.failed);
      return;
    }

    const input = {
      name: draft.name.trim(),
      command: draft.command.trim(),
      args,
      cwd: draft.cwd.trim() || undefined,
      port,
      autoStart: draft.autoStart,
      restart: draft.restart,
      ...(customIconFile ? { iconKind: "custom_local" as const } : {})
    };

    try {
      // The daemon assigns the id on create, so the uploaded bytes are keyed off
      // the saved record either way.
      const saved = editingId ? await localApps.update(editingId, input) : await localApps.create(input);

      if (customIconFile) {
        try {
          await saveLocalAsset(`app:local-app:${saved.id}:icon`, customIconFile);
        } catch {
          // IndexedDB may be unavailable; the record still saves without the icon.
        }
      }
      setStatus(editingId ? t.toast.saved : t.toast.created);
      setShowForm(false);
      setEditingId(null);
      setCustomIconFile(null);
      setDraft(emptyDraft);
      void refresh();
    } catch {
      setStatus(t.toast.failed);
    }
  }

  async function control(id: string, action: "start" | "stop" | "restart") {
    setBusyId(id);
    try {
      await localApps.control(id, action);
      setStatus(action === "start" ? t.toast.started : action === "stop" ? t.toast.stopped : "");
      void refresh();
    } catch {
      setStatus(t.toast.failed);
    } finally {
      setBusyId(null);
    }
  }

  async function openInWindow(app: LocalAppView) {
    // Ensure the process is up first. The daemon spawns quickly but the webapp
    // may need a beat to bind its port; the embedded frame's load-timeout and
    // fallback cover the rare slow boot.
    if (!app.status.running) {
      await control(app.id, "start");
    }
    onOpenUrlApp({ id: app.id, url: app.status.url, title: app.name });
  }

  async function remove(id: string) {
    if (!window.confirm(t.deleteConfirm)) return;
    setBusyId(id);
    try {
      await localApps.remove(id);
      setStatus(t.toast.deleted);
      void refresh();
    } catch {
      setStatus(t.toast.failed);
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(app: LocalAppView) {
    setEditingId(app.id);
    setDraft({
      name: app.name,
      command: app.command,
      args: (app.args ?? []).join("\n"),
      cwd: app.cwd ?? "",
      port: String(app.port),
      autoStart: app.autoStart === true,
      restart: app.restart ?? "no"
    });
    setCustomIconFile(null);
    setShowForm(true);
  }

  function loadLogs(id: string) {
    if (logsFor === id) {
      logsRequestRef.current += 1;
      setLogsFor(null);
      setLogs([]);
      return;
    }
    logsRequestRef.current += 1;
    setLogs([]);
    setLogsFor(id);
  }

  async function scanLocalWebUis() {
    if (discovered) {
      setDiscovered(null);
      return;
    }
    setDiscoveryBusy(true);
    try {
      setDiscovered(await localApps.discover());
    } catch {
      setStatus(t.toast.failed);
    } finally {
      setDiscoveryBusy(false);
    }
  }

  async function registerCandidate(candidate: LocalAppDiscoveryCandidate) {
    if (!candidate.command || !candidate.registerable || candidate.alreadyRegistered) return;
    if (candidate.running && !window.confirm(t.externalConfirm)) return;
    const key = discoveryKey(candidate);
    setRegisteringCandidate(key);
    try {
      await localApps.create({
        name: candidate.name,
        command: candidate.command,
        args: candidate.args,
        cwd: candidate.cwd ?? undefined,
        port: candidate.port,
        autoStart: false,
        restart: "on-crash"
      });
      setDiscovered((current) => current?.map((item) => (
        discoveryKey(item) === key ? { ...item, alreadyRegistered: true } : item
      )) ?? null);
      setStatus(t.toast.registered);
      await refresh();
    } catch {
      setStatus(t.toast.failed);
    } finally {
      setRegisteringCandidate(null);
    }
  }

  const daemonOnline = health?.ok === true;
  const runningApps = apps.filter((app) => app.status.running);
  const totalCpu = runningApps.reduce((sum, app) => sum + app.status.cpuPercent, 0);
  const totalMemory = runningApps.reduce((sum, app) => sum + app.status.memoryBytes, 0);
  const totalProcesses = runningApps.reduce((sum, app) => sum + app.status.processCount, 0);
  const orderedApps = [...apps].sort((left, right) => Number(right.status.running) - Number(left.status.running));

  return (
    <div className="builtin-panel system-panel local-apps-panel">
      <header className="system-panel-header local-apps-header">
        <div>
          <h2>{t.title}</h2>
        </div>
        <div className="system-panel-actions">
          <span className={`system-status ${daemonOnline ? "is-live" : ""}`}>
            {daemonOnline ? t.daemonOnline : t.daemonOffline}
          </span>
          <button className="secondary-action" onClick={scanLocalWebUis} disabled={!daemonOnline || discoveryBusy}>
            {discoveryBusy ? t.scanning : discovered ? t.hideDiscovery : t.scan}
          </button>
          <button
            className="primary-action"
            onClick={() => {
              setEditingId(null);
              setDraft(emptyDraft);
              setCustomIconFile(null);
              setShowForm(true);
            }}
            disabled={!daemonOnline}
          >
            + {t.addWebApp}
          </button>
        </div>
      </header>

      {!daemonOnline ? (
        <section className="store-empty">
          <h3>{t.daemonOffline}</h3>
          <p>{t.daemonOfflineHint}</p>
        </section>
      ) : null}

      <section className="task-summary" role="status" aria-atomic="true">
        <TaskSummaryItem label={t.status.running} value={`${runningApps.length}/${apps.length}`} />
        <TaskSummaryItem label={t.status.cpu} value={`${totalCpu.toFixed(1)}%`} />
        <TaskSummaryItem label={t.status.memory} value={formatBytes(totalMemory)} />
        <TaskSummaryItem label={t.status.processes} value={String(totalProcesses)} />
      </section>

      {discovered ? (
        <DiscoveryResults
          candidates={discovered}
          t={t}
          registeringCandidate={registeringCandidate}
          onRegister={registerCandidate}
        />
      ) : null}

      {showForm ? (
        <LocalAppForm
          t={t}
          draft={draft}
          onChange={setDraft}
          onSubmit={submitDraft}
          onCancel={() => {
            setShowForm(false);
            setEditingId(null);
            setCustomIconFile(null);
          }}
          editing={Boolean(editingId)}
          iconFile={customIconFile}
          onIconFileChange={setCustomIconFile}
        />
      ) : null}

      {status ? <p className="form-status">{status}</p> : null}

      {apps.length === 0 && daemonOnline && !showForm ? (
        <section className="store-empty">
          <h3>{t.noApps}</h3>
          <p>{t.noAppsHint}</p>
        </section>
      ) : null}

      <div className="local-apps-list">
        {orderedApps.map((app) => (
          <LocalAppCard
            key={app.id}
            app={app}
            t={t}
            busy={busyId === app.id}
            logsOpen={logsFor === app.id}
            logs={logsFor === app.id ? logs : []}
            onControl={(action) => control(app.id, action)}
            onOpen={() => openInWindow(app)}
            onEdit={() => startEdit(app)}
            onDelete={() => remove(app.id)}
            onToggleLogs={() => loadLogs(app.id)}
          />
        ))}
      </div>

      <style>{localAppsStyles}</style>
    </div>
  );
}

function TaskSummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DiscoveryResults({
  candidates,
  t,
  registeringCandidate,
  onRegister
}: {
  candidates: LocalAppDiscoveryCandidate[];
  t: LocalAppsText;
  registeringCandidate: string | null;
  onRegister: (candidate: LocalAppDiscoveryCandidate) => void;
}) {
  const ordered = [...candidates].sort((left, right) => (
    Number(right.registerable) - Number(left.registerable) || Number(right.running) - Number(left.running)
  ));
  return (
    <section className="discovery-results" aria-labelledby="local-discovery-title">
      <header>
        <div>
          <h3 id="local-discovery-title">{t.discoveryTitle}</h3>
          <p>{t.discoveryHint}</p>
        </div>
        <strong>{candidates.length}</strong>
      </header>
      <div className="discovery-list">
        {ordered.map((candidate) => {
          const key = discoveryKey(candidate);
          const state = candidate.alreadyRegistered
            ? t.registered
            : candidate.running
              ? t.externalRunning
              : candidate.registerable
                ? candidate.note
                : t.bookmarkOnly;
          return (
            <article className="discovery-row" key={key}>
              <div className="discovery-main">
                <strong title={candidate.name}>{candidate.name}</strong>
                <span>:{candidate.port}</span>
                <small>{state}</small>
              </div>
              <code title={candidate.command ? [candidate.command, ...candidate.args].join(" ") : candidate.source}>
                {candidate.command ? [candidate.command, ...candidate.args].join(" ") : candidate.source}
              </code>
              <button
                disabled={!candidate.registerable || candidate.alreadyRegistered || registeringCandidate === key}
                onClick={() => onRegister(candidate)}
              >
                {candidate.alreadyRegistered ? t.registered : candidate.registerable ? t.register : t.bookmarkOnly}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function LocalAppForm({
  t,
  draft,
  onChange,
  onSubmit,
  onCancel,
  editing,
  iconFile,
  onIconFileChange
}: {
  t: LocalAppsText;
  draft: AppDraft;
  onChange: (next: AppDraft) => void;
  onSubmit: () => void;
  onCancel: () => void;
  editing: boolean;
  iconFile: File | null;
  onIconFileChange: (file: File | null) => void;
}) {
  const [iconPreview, setIconPreview] = useState("");

  useEffect(() => {
    if (!iconFile) {
      setIconPreview("");
      return;
    }
    const url = URL.createObjectURL(iconFile);
    setIconPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [iconFile]);

  return (
    <section className="settings-section" style={{ background: "var(--color-surface-2)" }}>
      <span className="settings-kicker">{editing ? t.edit : t.addWebApp}</span>
      <label className="dialog-label">
        {t.field.name}
        <input
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          placeholder={t.field.namePlaceholder}
        />
      </label>
      <label className="dialog-label">
        {t.field.icon}
        <input
          type="file"
          accept="image/*"
          onChange={(e) => onIconFileChange(e.target.files?.[0] ?? null)}
        />
        {iconPreview ? (
          /* eslint-disable-next-line @next/next/no-img-element -- preview is a local object URL */
          <img
            src={iconPreview}
            alt=""
            style={{
              width: 40,
              height: 40,
              borderRadius: 9,
              objectFit: "contain",
              background: "#f2ebde",
              outline: "1px solid rgba(0,0,0,0.08)",
              marginTop: 6
            }}
          />
        ) : null}
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 10 }}>
        <label className="dialog-label">
          {t.field.command}
          <input
            value={draft.command}
            onChange={(e) => onChange({ ...draft, command: e.target.value })}
            placeholder={t.field.commandPlaceholder}
          />
        </label>
        <label className="dialog-label">
          {t.field.port}
          <input
            value={draft.port}
            onChange={(e) => onChange({ ...draft, port: e.target.value })}
            placeholder={t.field.portPlaceholder}
            inputMode="numeric"
          />
        </label>
      </div>
      <label className="dialog-label">
        {t.field.args}
        <textarea
          value={draft.args}
          onChange={(e) => onChange({ ...draft, args: e.target.value })}
          placeholder={t.field.argsPlaceholder}
          rows={3}
          style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem" }}
        />
      </label>
      <label className="dialog-label">
        {t.field.cwd}
        <input
          value={draft.cwd}
          onChange={(e) => onChange({ ...draft, cwd: e.target.value })}
          placeholder={t.field.cwdPlaceholder}
        />
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={draft.autoStart}
          onChange={(e) => onChange({ ...draft, autoStart: e.target.checked })}
        />
        <span>{t.field.autoStart}</span>
      </label>
      <label className="dialog-label">
        {t.field.restart}
        <select
          value={draft.restart}
          onChange={(e) => onChange({ ...draft, restart: e.target.value as AppDraft["restart"] })}
        >
          <option value="no">{t.field.restartNo}</option>
          <option value="on-crash">{t.field.restartOnCrash}</option>
          <option value="always">{t.field.restartAlways}</option>
        </select>
      </label>
      <div className="dialog-actions">
        <button onClick={onCancel}>{t.cancel}</button>
        <button className="primary-action" onClick={onSubmit}>
          {editing ? t.save : t.addWebApp}
        </button>
      </div>
    </section>
  );
}

function LocalAppCard({
  app,
  t,
  busy,
  logsOpen,
  logs,
  onControl,
  onOpen,
  onEdit,
  onDelete,
  onToggleLogs
}: {
  app: LocalAppView;
  t: LocalAppsText;
  busy: boolean;
  logsOpen: boolean;
  logs: string[];
  onControl: (action: "start" | "stop" | "restart") => void;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleLogs: () => void;
}) {
  const running = app.status.running;
  const errored = Boolean(app.status.lastError) || app.status.lastExitCode !== null;
  const booting = running && !app.status.healthy;
  const dotClass = !running
    ? errored ? "local-app-dot-error" : "local-app-dot-stopped"
    : booting ? "local-app-dot-booting" : "local-app-dot-running";
  const statusLabel = !running
    ? errored ? t.status.error : t.status.stopped
    : booting ? t.status.booting : t.status.running;

  return (
    <article className="local-app-card">
      <header className="local-app-header">
        <div className="local-app-title-row">
          <span className={`local-app-dot ${dotClass}`} aria-hidden="true" />
          <strong>{app.name}</strong>
          <span className="local-app-port">:{app.port}</span>
        </div>
        <span className={`local-app-status-pill ${dotClass}`}>{statusLabel}</span>
      </header>

      <dl className="local-app-meta">
        <div>
          <dt>{t.status.pid}</dt>
          <dd>{app.status.pid ?? "—"}</dd>
        </div>
        <div>
          <dt>{t.status.cpu}</dt>
          <dd>{app.status.cpuPercent.toFixed(1)}%</dd>
        </div>
        <div>
          <dt>{t.status.memory}</dt>
          <dd>{formatBytes(app.status.memoryBytes)}</dd>
        </div>
        <div>
          <dt>{t.status.processes}</dt>
          <dd>{app.status.processCount}</dd>
        </div>
      </dl>

      {app.status.lastError ? <p className="local-app-error">{app.status.lastError}</p> : null}

      <div className="local-app-actions">
        {running ? (
          <button disabled={busy} onClick={() => onControl("stop")}>
            {t.stop}
          </button>
        ) : (
          <button className="primary-action" disabled={busy} onClick={() => onControl("start")}>
            {t.start}
          </button>
        )}
        <button className={running ? "local-app-open" : undefined} disabled={busy} onClick={onOpen}>
          {t.open}
        </button>
        <button disabled={busy || !running} onClick={() => onControl("restart")}>{t.restart}</button>
        <button onClick={onToggleLogs}>{t.logs}</button>
        <button onClick={onEdit}>{t.edit}</button>
        <button className="local-app-danger" disabled={busy} onClick={onDelete}>
          {t.delete}
        </button>
      </div>

      {logsOpen ? (
        <pre className="local-app-logs">
          {logs.length === 0 ? t.noLogs : logs.join("\n")}
        </pre>
      ) : null}
    </article>
  );
}

function discoveryKey(candidate: LocalAppDiscoveryCandidate): string {
  return `${candidate.source}:${candidate.port}:${candidate.cwd ?? ""}`;
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  const scaled = value / 1024 ** index;
  return `${scaled >= 100 || index === 0 ? scaled.toFixed(0) : scaled.toFixed(1)} ${units[index]}`;
}

const localAppsStyles = `
.local-apps-header {
  align-items: center; gap: 18px; margin-bottom: 10px; padding-bottom: 10px;
}
.local-apps-header h2 { margin-bottom: 3px; }
.local-apps-header p { max-width: 620px; line-height: 1.4; }
.local-apps-header .utility-status.is-live {
  color: var(--color-ink); border-color: color-mix(in srgb, var(--state-running) 52%, var(--color-hairline-ink));
  background: color-mix(in srgb, var(--state-running) 18%, var(--color-surface));
}
.local-apps-toolbar { display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.secondary-action {
  min-height: 44px; border: 1px solid var(--color-hairline-ink); border-radius: var(--radius-md);
  padding: 8px 14px; color: var(--color-ink); background: var(--color-surface);
}
.secondary-action:disabled { opacity: 0.45; cursor: not-allowed; }
.task-summary {
  display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 0 0 12px; border-block: 1px solid var(--color-hairline-ink);
  background: var(--color-surface); min-width: 0;
}
.task-summary > div { display: grid; gap: 2px; padding: 10px 12px; min-width: 0; }
.task-summary > div + div { border-inline-start: 1px solid var(--color-hairline-ink); }
.task-summary span {
  color: var(--color-ink-muted); font-family: var(--font-mono); font-size: 0.62rem;
  letter-spacing: 0.12em; text-transform: uppercase;
}
.task-summary strong { font-family: var(--font-mono); font-size: 1rem; font-weight: 600; }
.discovery-results {
  margin: 0 0 14px; border: 1px solid var(--color-hairline-ink);
  border-radius: var(--radius-md); background: var(--color-surface);
}
.discovery-results > header {
  display: flex; justify-content: space-between; gap: 16px; align-items: flex-start;
  padding: 12px; border-bottom: 1px solid var(--color-hairline-ink);
}
.discovery-results h3 { margin: 0; font-size: 0.95rem; }
.discovery-results header p { margin: 3px 0 0; color: var(--color-ink-muted); font-size: 0.78rem; line-height: 1.45; }
.discovery-results header > strong { font-family: var(--font-mono); color: var(--color-ink); }
.discovery-list { display: grid; max-height: 320px; overflow: auto; }
.discovery-row {
  display: grid; grid-template-columns: minmax(160px, 0.75fr) minmax(220px, 1.5fr) auto;
  gap: 12px; align-items: center; padding: 8px 12px;
}
.discovery-row + .discovery-row { border-top: 1px solid var(--color-hairline-ink); }
.discovery-main { display: flex; align-items: baseline; gap: 7px; min-width: 0; }
.discovery-main strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.discovery-main span { color: var(--color-ink-muted); font-family: var(--font-mono); font-size: 0.75rem; }
.discovery-main small { color: var(--color-ink-muted); font-size: 0.7rem; }
.discovery-row code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-ink-muted); font-size: 0.72rem; }
.discovery-row button { min-height: 44px; padding: 7px 12px; }
.discovery-row button:disabled { opacity: 0.45; cursor: not-allowed; }
.local-apps-list { display: grid; gap: 8px; margin-top: 8px; }
.local-app-card {
  border: 1px solid var(--color-hairline-ink);
  border-radius: var(--radius-md);
  padding: 12px;
  background: var(--color-surface-2);
}
.local-app-header {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  margin-bottom: 10px;
}
.local-app-title-row { display: flex; align-items: center; gap: 10px; min-width: 0; }
.local-app-title-row strong { font-weight: 600; }
.local-app-port {
  font-family: var(--font-mono); font-size: 0.78rem; color: var(--color-ink);
  padding: 2px 8px; border-radius: var(--radius-pill); background: var(--surface-sunken);
}
.local-app-dot {
  width: 8px; height: 8px; border-radius: 999px; flex: 0 0 auto;
}
.local-app-dot-running { background: var(--color-signal); box-shadow: 0 0 8px var(--color-signal); }
.local-app-dot-stopped { background: var(--color-ink-faint); }
.local-app-dot-error { background: var(--color-ember); box-shadow: 0 0 8px var(--color-ember); }
.local-app-dot-booting { background: var(--state-starting); box-shadow: 0 0 8px var(--state-starting); }
.local-app-status-pill {
  font-family: var(--font-mono); font-size: 0.68rem; letter-spacing: 0.1em;
  text-transform: uppercase; padding: 4px 10px; border-radius: 999px;
  border: 1px solid var(--color-hairline-ink);
}
.local-app-status-pill.local-app-dot-running {
  color: var(--color-ink); border-color: color-mix(in srgb, var(--state-running) 52%, var(--color-hairline-ink));
  background: color-mix(in srgb, var(--state-running) 18%, var(--color-surface)); box-shadow: none;
}
.local-app-status-pill.local-app-dot-error {
  color: var(--color-ember); border-color: rgba(232,99,58,0.4); background: rgba(232,99,58,0.1);
}
.local-app-status-pill.local-app-dot-booting {
  color: var(--color-ink); border-color: color-mix(in srgb, var(--state-starting) 55%, var(--color-hairline-ink));
  background: color-mix(in srgb, var(--state-starting) 16%, var(--color-surface)); box-shadow: none;
}
.local-app-meta {
  display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px;
  margin: 0 0 8px;
}
.local-app-meta dt {
  font-family: var(--font-mono); font-size: 0.68rem; letter-spacing: 0.09em;
  text-transform: uppercase; color: var(--color-ink-muted); margin-bottom: 2px;
}
.local-app-meta dd { margin: 0; font-family: var(--font-mono); font-size: 0.78rem; overflow: hidden; text-overflow: ellipsis; }
.local-app-meta .local-app-io { white-space: nowrap; }
.local-app-cmd {
  margin: 0 0 8px; padding: 6px 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  border-inline-start: 2px solid var(--color-hairline-ink); color: var(--color-ink);
  font-family: var(--font-mono); font-size: 0.72rem;
}
.local-app-error {
  margin: 0 0 10px; padding: 8px 12px; border-radius: var(--radius-sm);
  background: rgba(232,99,58,0.1); color: var(--color-ember);
  font-family: var(--font-mono); font-size: 0.78rem;
}
.local-app-actions {
  display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
}
.local-app-actions button, .local-app-actions a {
  border: 1px solid var(--color-hairline-ink); border-radius: var(--radius-control);
  min-height: 44px; padding: 7px 12px; font-size: 0.82rem; color: var(--color-ink);
  background: var(--color-surface); text-decoration: none;
  transition: transform 150ms cubic-bezier(0.2,0,0,1), background 150ms ease;
}
.local-app-actions button:hover, .local-app-actions a:hover { background: var(--color-surface-2); }
.local-app-actions button:active { transform: scale(0.96); }
.local-app-actions button:disabled { opacity: 0.4; cursor: not-allowed; }
.local-app-actions .local-app-open {
  color: var(--color-surface); background: var(--color-ink); border-color: var(--color-ink);
}
.local-app-actions .local-app-open:hover { color: var(--color-surface); background: var(--color-ink-muted); }
.local-app-actions .local-app-danger { color: var(--color-ember); margin-inline-start: auto; }
.local-app-actions .local-app-danger:hover { background: rgba(232,99,58,0.1); }
.local-app-logs {
  margin: 12px 0 0; padding: 12px; max-height: 240px; overflow: auto;
  background: #13110f; color: #d4c9b3; border-radius: var(--radius-md);
  font-family: var(--font-mono); font-size: 0.74rem; line-height: 1.5;
}
.dialog-label {
  display: grid; gap: 6px; color: var(--color-ink-muted);
  font-size: 0.8rem; font-weight: 500;
}
.dialog-label input, .dialog-label textarea, .dialog-label select {
  border: 1px solid var(--color-hairline-ink); border-radius: var(--radius-md);
  padding: 10px 12px; color: var(--color-ink); background: var(--color-surface);
}
.dialog-label input:focus-visible, .dialog-label textarea:focus-visible, .dialog-label select:focus-visible {
  outline: 2px solid var(--color-signal); outline-offset: 1px; border-color: transparent;
}
@media (max-width: 900px) {
  .task-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .task-summary > div:nth-child(3) { border-inline-start: 0; border-top: 1px solid var(--color-hairline-ink); }
  .task-summary > div:nth-child(4) { border-top: 1px solid var(--color-hairline-ink); }
  .discovery-row { grid-template-columns: 1fr auto; }
  .discovery-row code { grid-column: 1 / -1; grid-row: 2; }
  .local-app-meta { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
.local-apps-header {
  margin: 0;
  padding: var(--space-3) var(--space-4);
}
.local-apps-header h2 { margin: 0; }
.local-apps-header .secondary-action,
.local-apps-header .primary-action {
  min-height: 44px;
  border-radius: var(--radius-control);
}
.task-summary {
  margin: 0;
  border-top: 0;
  background: var(--surface-raised-2);
}
.task-summary > div { padding: var(--space-2) var(--space-4); }
.local-apps-list { gap: 0; margin: 0; }
.local-app-card {
  border: 0;
  border-bottom: 1px solid var(--border-hairline-ink);
  border-radius: 0;
  padding: var(--space-3) var(--space-4);
  background: var(--surface-raised);
}
.local-app-header { margin-bottom: var(--space-2); }
.local-app-status-pill { border-radius: var(--radius-control); }
.local-app-meta {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-bottom: var(--space-2);
}
.local-app-actions { gap: var(--space-1); }
.local-app-actions button,
.local-app-actions a {
  border-radius: var(--radius-control);
  min-height: 44px;
  padding: var(--space-2) var(--space-3);
}
.local-app-actions .local-app-danger { margin-inline-start: auto; }
.local-app-logs {
  border-radius: var(--radius-control);
  margin-top: var(--space-2);
}
@media (max-width: 720px) {
  .local-apps-header .system-panel-actions { align-items: stretch; }
  .local-app-meta { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
`;
