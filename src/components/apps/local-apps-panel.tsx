"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DaemonHealth, LocalAppDiscoveryCandidate, LocalAppView } from "@/lib/contracts";
import { saveLocalAsset } from "@/lib/browser-local-assets";
import { desktopData } from "@/lib/desktop-data";
import styles from "./local-apps-panel.module.css";

interface LocalAppsText {
  title: string;
  eyebrow: string;
  description: string;
  controlDeck: string;
  nodes: string;
  active: string;
  ports: string;
  supervisor: string;
  ready: string;
  editorHint: string;
  basicSettings: string;
  advancedSettings: string;
  advancedHint: string;
  enabled: string;
  disabled: string;
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
  managedApps: string;
  runningCount: (running: number, total: number) => string;
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
    controlDeck: "Local runtime control deck",
    nodes: "Managed nodes",
    active: "Active links",
    ports: "Port map",
    supervisor: "Supervisor",
    ready: "Ready",
    editorHint: "Keep the everyday controls close. The launch recipe stays out of the way until you need it.",
    basicSettings: "Basics",
    advancedSettings: "Advanced launch recipe",
    advancedHint: "Command, arguments, working directory, icon, and restart policy",
    enabled: "Enabled",
    disabled: "Disabled",
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
    managedApps: "Managed WebApps",
    runningCount: (running, total) => `${running}/${total} running`,
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
    controlDeck: "本地运行时控制舱",
    nodes: "受管节点",
    active: "活动链路",
    ports: "端口映射",
    supervisor: "守护进程",
    ready: "就绪",
    editorHint: "日常只改必要项；启动配方需要时再展开。",
    basicSettings: "基础设置",
    advancedSettings: "高级启动配方",
    advancedHint: "命令、参数、工作目录、图标与重启策略",
    enabled: "已启用",
    disabled: "未启用",
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
    managedApps: "受管 WebApp",
    runningCount: (running, total) => `${running}/${total} 运行中`,
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
  const orderedApps = [...apps].sort((left, right) => Number(right.status.running) - Number(left.status.running));
  const mappedPorts = new Set(apps.map((app) => app.port)).size;

  return (
    <div className={`builtin-panel system-panel local-apps-panel ${styles.fakePanel}`}>
      <header className="system-panel-header local-apps-header">
        <div className="local-apps-identity">
          <span className="local-apps-eyebrow"><i aria-hidden="true" /> {t.controlDeck}</span>
          <div>
            <h2>{t.title}</h2>
            <p>{t.description}</p>
          </div>
        </div>
        <div className="system-panel-actions">
          <span className={`system-status ${daemonOnline ? "is-live" : ""}`}>
            <i aria-hidden="true" />
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

      <section className="local-apps-telemetry" aria-label={t.controlDeck}>
        <article>
          <span>{t.nodes}</span>
          <strong>{String(apps.length).padStart(2, "0")}</strong>
          <small>{t.managedApps}</small>
        </article>
        <article>
          <span>{t.active}</span>
          <strong>{String(runningApps.length).padStart(2, "0")}</strong>
          <small>{t.runningCount(runningApps.length, apps.length)}</small>
        </article>
        <article>
          <span>{t.ports}</span>
          <strong>{String(mappedPorts).padStart(2, "0")}</strong>
          <small>LOOPBACK / TCP</small>
        </article>
        <article className={daemonOnline ? "is-live" : ""}>
          <span>{t.supervisor}</span>
          <strong title={health?.version}>{health?.version?.split("+")[0] ?? "--"}</strong>
          <small>{daemonOnline ? t.ready : t.daemonOffline}</small>
        </article>
      </section>

      <div className="local-apps-scroll-region">
        {!daemonOnline ? (
          <section className="store-empty">
            <h3>{t.daemonOffline}</h3>
            <p>{t.daemonOfflineHint}</p>
          </section>
        ) : null}

        {discovered ? (
          <DiscoveryResults
            candidates={discovered}
            t={t}
            registeringCandidate={registeringCandidate}
            onRegister={registerCandidate}
          />
        ) : null}

        <div className={`local-apps-workspace${showForm ? " has-editor" : ""}`}>
          <div className="local-apps-primary">
            {apps.length === 0 && daemonOnline && !showForm ? (
              <section className="store-empty">
                <h3>{t.noApps}</h3>
                <p>{t.noAppsHint}</p>
              </section>
            ) : null}

            {apps.length > 0 ? (
              <section className="local-apps-inventory" aria-labelledby="local-apps-inventory-title">
                <header>
                  <h3 id="local-apps-inventory-title">{t.managedApps}</h3>
                  <span role="status" aria-live="polite">
                    {t.runningCount(runningApps.length, apps.length)}
                  </span>
                </header>
                <div className="local-apps-list">
                  {orderedApps.map((app, index) => (
                    <LocalAppCard
                      key={app.id}
                      index={index}
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
              </section>
            ) : null}
          </div>

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
        </div>
      </div>

      {status ? <p className="form-status">{status}</p> : null}

      <style>{localAppsStyles}</style>
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
    <section className="local-app-form">
      <header className="local-app-form-header">
        <div>
          <span className="settings-kicker">{editing ? t.edit : t.addWebApp}</span>
          <h3>{editing ? draft.name || t.field.namePlaceholder : t.addWebApp}</h3>
          <p>{t.editorHint}</p>
        </div>
        <button type="button" onClick={onCancel} aria-label={t.cancel} title={t.cancel}>×</button>
      </header>

      <div className="local-app-form-section">
        <span className="local-app-form-section-label">01 / {t.basicSettings}</span>
        <label className="dialog-label">
          {t.field.name}
          <input
            value={draft.name}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            placeholder={t.field.namePlaceholder}
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
        <label className="checkbox-field local-app-autostart">
          <input
            type="checkbox"
            checked={draft.autoStart}
            onChange={(e) => onChange({ ...draft, autoStart: e.target.checked })}
          />
          <span>
            <strong>{t.field.autoStart}</strong>
            <small>{draft.autoStart ? t.enabled : t.disabled}</small>
          </span>
        </label>
      </div>

      <details className="local-app-advanced">
        <summary>
          <span><strong>{t.advancedSettings}</strong><small>{t.advancedHint}</small></span>
          <i aria-hidden="true">+</i>
        </summary>
        <div className="local-app-advanced-fields">
          <label className="dialog-label">
            {t.field.command}
            <input
              value={draft.command}
              onChange={(e) => onChange({ ...draft, command: e.target.value })}
              placeholder={t.field.commandPlaceholder}
            />
          </label>
          <label className="dialog-label">
            {t.field.args}
            <textarea
              value={draft.args}
              onChange={(e) => onChange({ ...draft, args: e.target.value })}
              placeholder={t.field.argsPlaceholder}
              rows={3}
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
          <label className="dialog-label local-app-icon-field">
            {t.field.icon}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => onIconFileChange(e.target.files?.[0] ?? null)}
            />
            {iconPreview ? (
              /* eslint-disable-next-line @next/next/no-img-element -- preview is a local object URL */
              <img src={iconPreview} alt="" />
            ) : null}
          </label>
        </div>
      </details>
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
  index,
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
  index: number;
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
  const recipe = [app.command, ...(app.args ?? [])].join(" ");

  return (
    <article className={`local-app-card${running ? " is-running" : ""}${errored ? " is-error" : ""}`}>
      <div className="local-app-main">
        <header className="local-app-header">
          <div className="local-app-title-row">
            <span className="local-app-index">{String(index + 1).padStart(2, "0")}</span>
            <span className={`local-app-dot ${dotClass}`} aria-hidden="true" />
            <strong>{app.name}</strong>
            <span className="local-app-port">:{app.port}</span>
          </div>
          <span className={`local-app-status-pill ${dotClass}`}>{statusLabel}</span>
        </header>
        <div className="local-app-recipe">
          <code title={recipe}>{recipe}</code>
          {app.cwd ? <span title={app.cwd}>{app.cwd}</span> : null}
        </div>
      </div>

      <div className="local-app-runtime" aria-label={`${app.name} runtime`}>
        <span><small>{t.status.pid}</small><strong>{app.status.pid ?? "--"}</strong></span>
        <span><small>{t.status.cpu}</small><strong>{app.status.cpuPercent.toFixed(1)}%</strong></span>
        <span><small>{t.status.memory}</small><strong>{formatMemory(app.status.memoryBytes)}</strong></span>
        <span><small>{t.status.processes}</small><strong>{app.status.processCount}</strong></span>
      </div>

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

function formatMemory(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const localAppsStyles = `
.local-apps-panel {
  height: 100%;
  min-height: 0;
  overflow: auto;
}
.local-apps-panel button {
  box-shadow: none;
}
.local-apps-header {
  align-items: center;
  gap: var(--space-4);
}
.local-apps-header h2 {
  margin: 0;
}
.local-apps-header .system-panel-actions > button {
  min-height: 44px;
  border: 1px solid var(--border-hairline-ink);
  border-radius: var(--radius-control);
  padding: var(--space-2) var(--space-3);
}
.local-apps-header .secondary-action {
  color: var(--text-primary);
  background: var(--surface-raised-2);
}
.local-apps-header .primary-action,
.local-app-actions .primary-action {
  border-color: var(--text-primary);
  color: var(--surface-raised);
  background: var(--text-primary);
}
.local-apps-header .secondary-action:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.discovery-results {
  margin: 0;
  border-bottom: 1px solid var(--border-hairline-ink);
  background: var(--surface-raised);
}
.discovery-results > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  border-bottom: 1px solid var(--border-hairline-ink);
  padding: var(--space-3) var(--space-4);
}
.discovery-results h3 { margin: 0; font-size: 0.9rem; }
.discovery-results header p { margin: var(--space-1) 0 0; color: var(--text-secondary); font-size: 0.74rem; line-height: 1.4; }
.discovery-results header > strong { font-family: var(--type-mono); color: var(--text-primary); }
.discovery-list { display: grid; max-height: 280px; overflow: auto; }
.discovery-row {
  display: grid;
  grid-template-columns: minmax(150px, 0.75fr) minmax(200px, 1.5fr) auto;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
}
.discovery-row + .discovery-row { border-top: 1px solid var(--border-hairline-ink); }
.discovery-main { display: flex; align-items: baseline; gap: var(--space-2); min-width: 0; }
.discovery-main strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.discovery-main span { color: var(--text-secondary); font-family: var(--type-mono); font-size: 0.72rem; }
.discovery-main small { color: var(--text-secondary); font-size: 0.68rem; }
.discovery-row code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font-size: 0.7rem; }
.discovery-row button { min-height: 44px; padding: var(--space-2) var(--space-3); }
.discovery-row button:disabled { opacity: 0.45; cursor: not-allowed; }
.local-apps-inventory {
  margin: 0;
}
.local-apps-inventory > header {
  display: flex;
  min-height: 42px;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  border-bottom: 1px solid var(--border-hairline-ink);
  padding: var(--space-2) var(--space-4);
  background: var(--surface-raised-2);
}
.local-apps-inventory > header h3 {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 650;
}
.local-apps-inventory > header span {
  color: var(--text-secondary);
  font-family: var(--type-mono);
  font-size: 0.68rem;
}
.local-app-form {
  display: grid;
  min-width: 0;
  gap: var(--space-3);
  margin: 0;
  border-bottom: 1px solid var(--border-hairline-ink);
  padding: var(--space-3) var(--space-4);
  background: var(--surface-raised-2);
  box-shadow: none;
}
.local-app-form > * {
  min-width: 0;
}
.local-app-form .dialog-label input,
.local-app-form .dialog-label textarea,
.local-app-form .dialog-label select {
  width: 100%;
  min-width: 0;
}
.local-apps-list { display: grid; }
.local-app-card {
  display: grid;
  min-width: 0;
  gap: var(--space-2);
  border-bottom: 1px solid var(--border-hairline-ink);
  padding: var(--space-3) var(--space-4);
  background: var(--surface-raised);
}
.local-app-main { min-width: 0; }
.local-app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}
.local-app-title-row { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.local-app-title-row strong { font-weight: 600; }
.local-app-port {
  border-radius: var(--radius-control);
  padding: var(--space-1) var(--space-2);
  color: var(--text-secondary);
  font-family: var(--type-mono);
  font-size: 0.72rem;
  background: var(--surface-sunken);
}
.local-app-dot {
  width: 8px; height: 8px; border-radius: var(--radius-pill); flex: 0 0 auto;
}
.local-app-dot.local-app-dot-running { background: var(--state-running); }
.local-app-dot.local-app-dot-stopped { background: var(--state-stopped); }
.local-app-dot.local-app-dot-error { background: var(--state-failed); }
.local-app-dot.local-app-dot-booting { background: var(--state-starting); }
.local-app-status-pill {
  border: 1px solid var(--border-hairline-ink);
  border-radius: var(--radius-control);
  padding: var(--space-1) var(--space-2);
  color: var(--text-secondary);
  font-family: var(--type-mono);
  font-size: 0.68rem;
  white-space: nowrap;
}
.local-app-status-pill.local-app-dot-running {
  border-color: var(--state-running);
  color: var(--text-primary);
}
.local-app-status-pill.local-app-dot-error {
  border-color: var(--state-failed);
  color: var(--state-failed);
}
.local-app-status-pill.local-app-dot-booting {
  border-color: var(--state-starting);
  color: var(--text-primary);
}
.local-app-recipe {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--space-3);
}
.local-app-recipe code,
.local-app-recipe span {
  overflow: hidden;
  color: var(--text-secondary);
  font-family: var(--type-mono);
  font-size: 0.68rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.local-app-recipe code { flex: 1 1 auto; }
.local-app-recipe span {
  flex: 0 1 38%;
  border-inline-start: 1px solid var(--border-hairline-ink);
  padding-inline-start: var(--space-3);
}
.local-app-error {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  color: var(--state-failed);
  font-family: var(--type-mono);
  font-size: 0.72rem;
  background: var(--surface-sunken);
}
.local-app-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}
.local-app-actions button, .local-app-actions a {
  min-height: 44px;
  border: 1px solid var(--border-hairline-ink);
  border-radius: var(--radius-control);
  padding: var(--space-2) var(--space-3);
  color: var(--text-primary);
  font-size: 0.78rem;
  text-decoration: none;
  background: var(--surface-raised-2);
}
.local-app-actions button:disabled { opacity: 0.4; cursor: not-allowed; }
.local-app-actions .local-app-open {
  border-color: var(--text-primary);
  color: var(--surface-raised);
  background: var(--text-primary);
}
.local-app-actions .local-app-danger { color: var(--state-failed); margin-inline-start: auto; }
.local-app-logs {
  max-height: 220px;
  margin: 0;
  overflow: auto;
  border-radius: var(--radius-control);
  padding: var(--space-3);
  color: var(--surface-raised);
  font-family: var(--type-mono);
  font-size: 0.72rem;
  line-height: 1.5;
  background: var(--text-primary);
}
.dialog-label {
  display: grid; gap: var(--space-2); color: var(--text-secondary);
  font-size: 0.8rem; font-weight: 500;
}
.dialog-label input, .dialog-label textarea, .dialog-label select {
  border: 1px solid var(--border-hairline-ink); border-radius: var(--radius-control);
  padding: var(--space-2) var(--space-3); color: var(--text-primary); background: var(--surface-raised);
}
.dialog-label input:focus-visible, .dialog-label textarea:focus-visible, .dialog-label select:focus-visible {
  outline: 2px solid var(--focus-ring); outline-offset: 1px; border-color: transparent;
}
@media (max-width: 900px) {
  .discovery-row { grid-template-columns: 1fr auto; }
  .discovery-row code { grid-column: 1 / -1; grid-row: 2; }
}
@media (max-width: 720px) {
  .local-apps-header { align-items: flex-start; }
  .local-apps-header .system-panel-actions { align-items: stretch; }
  .local-app-recipe span { display: none; }
}
`;
