"use client";

import { runActivity } from "@/lib/desktop-activity";
import { useWindowVisible } from "@/components/window/window-visibility";
import { useSystemTools } from "@/components/packages/system-tools-context";
import { AppWindow, CirclePause, CirclePlay, FileCode2, FolderOpen, LayoutGrid, Monitor, Pencil, Play, Radar, RotateCw, ScrollText, Search, Server, Square, Trash2 } from "lucide-react";

/* eslint-disable @next/next/no-img-element -- Discovery icons are bounded loopback captures stored as local data URLs. */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DaemonHealth,
  LocalAppBundle,
  LocalAppBundleService,
  LocalAppDiscoveryCandidate,
  LocalAppImportResult,
  LocalAppImportPlan,
  LocalAppView
} from "@/lib/contracts";
import { saveLocalAsset } from "@/lib/browser-local-assets";
import { desktopData, reasonFor } from "@/lib/desktop-data";
import { initialsForTitle } from "@/lib/desktop-helpers";
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
  welcomeSteps: string[];
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
  allServices: string;
  importProject: string;
  hideImport: string;
  importTitle: string;
  importHint: string;
  importPath: string;
  importPathPlaceholder: string;
  importName: string;
  importNamePlaceholder: string;
  preview: string;
  previewing: string;
  planSummary: (services: number) => string;
  primaryService: string;
  dependencyService: string;
  bundleLocation: string;
  registerOnly: string;
  registerAndStart: string;
  importing: string;
  startingImport: string;
  importRegistered: (name: string) => string;
  importStarted: (name: string, url: string) => string;
  script: string;
  scriptLoading: string;
  notImported: string;
  scriptPath: string;
  manifestPath: string;
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
    noApps: "Bring your local projects onto the desktop",
    noAppsHint: "Import a project folder and its frontend and backend run, stop, and restart together as one app.",
    welcomeSteps: ["Choose a project folder", "Review the detected services", "Start it and open it in a window"],
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
    allServices: "All services",
    importProject: "Import project",
    hideImport: "Close import",
    importTitle: "Import a project directory",
    importHint: "Detects the frontend and backend services, generates one auditable run.sh, and manages them as a single desktop app. Your source tree is not modified.",
    importPath: "Project directory",
    importPathPlaceholder: "~/Projects/my-app",
    importName: "Name (optional)",
    importNamePlaceholder: "Defaults to the directory name",
    preview: "Preview",
    previewing: "Detecting…",
    planSummary: (services) => `${services} service${services === 1 ? "" : "s"} will start together and stop together.`,
    primaryService: "Primary · desktop URL",
    dependencyService: "Dependency",
    bundleLocation: "Generated bundle",
    registerOnly: "Register only",
    registerAndStart: "Register and start",
    importing: "Registering…",
    startingImport: "Starting and checking health…",
    importRegistered: (name) => `${name} was registered. Start it from its card or desktop icon.`,
    importStarted: (name, url) => `${name} is running and healthy at ${url}.`,
    script: "Launch script",
    scriptLoading: "Loading the generated bundle…",
    notImported: "This app was not imported from a project directory, so it has no generated launch script.",
    scriptPath: "Script",
    manifestPath: "Manifest",
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
    noApps: "把本机项目放到桌面上",
    noAppsHint: "导入一个项目文件夹，它的前端和后端就会作为一个应用一起启动、停止和重启。",
    welcomeSteps: ["选择项目文件夹", "确认识别到的服务", "启动并在窗口中打开"],
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
    allServices: "全部服务",
    importProject: "导入项目",
    hideImport: "收起导入",
    importTitle: "导入项目目录",
    importHint: "自动识别前端与后端服务，生成一份可审阅的 run.sh，并作为一个桌面应用统一管理。不会修改你的源码。",
    importPath: "项目目录",
    importPathPlaceholder: "~/Projects/my-app",
    importName: "名称（可选）",
    importNamePlaceholder: "默认使用目录名",
    preview: "预览",
    previewing: "正在识别…",
    planSummary: (services) => `${services} 个服务将一起启动、一起停止。`,
    primaryService: "主服务 · 桌面入口",
    dependencyService: "依赖服务",
    bundleLocation: "生成位置",
    registerOnly: "仅注册",
    registerAndStart: "注册并启动",
    importing: "正在注册…",
    startingImport: "正在启动并检查健康状态…",
    importRegistered: (name) => `${name} 已注册，可在卡片或桌面图标上启动。`,
    importStarted: (name, url) => `${name} 已启动，健康检查通过：${url}`,
    script: "启动脚本",
    scriptLoading: "正在读取生成的启动包…",
    notImported: "这个应用不是从项目目录导入的，没有生成的启动脚本。",
    scriptPath: "脚本",
    manifestPath: "清单",
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
  const tools = useSystemTools();
  const native = tools && ["windows", "macos"].includes(tools.presentation.appearance);
  const [nativeFilter, setNativeFilter] = useState("all");
  const [nativeSearch, setNativeSearch] = useState("");
  const localApps = desktopData().localApps;
  const panelVisible = useWindowVisible();
  const [health, setHealth] = useState<DaemonHealth | null>(null);
  const [status, setStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<AppDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const nativeScroll = useRef<HTMLDivElement>(null);
  useEffect(() => { if (native && showForm) nativeScroll.current?.scrollTo({ top: 0 }); }, [native, showForm, editingId]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [logsFor, setLogsFor] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const logsRequestRef = useRef(0);
  const [customIconFile, setCustomIconFile] = useState<File | null>(null);
  const [discovered, setDiscovered] = useState<LocalAppDiscoveryCandidate[] | null>(null);
  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  const [registeringCandidate, setRegisteringCandidate] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  // undefined: not loaded yet; null: the app has no generated bundle.
  const [bundles, setBundles] = useState<Record<string, LocalAppBundle | null>>({});
  const [scriptFor, setScriptFor] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState<string | null>(null);
  const requestedBundles = useRef(new Set<string>());

  // Service chips on each card come from the generated bundle; read them once per app.
  useEffect(() => {
    for (const app of apps) void loadBundle(app);
    // loadBundle only reads the ref and stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apps]);

  // Two separate concerns, deliberately not merged: the *list* is polled once by
  // the desktop (this panel receives it as a prop), while the daemon *health*
  // badge is this panel's own and has to keep reflecting reality while it is
  // open — a daemon that dies must not leave a stale "online" badge.
  const refreshHealth = useCallback(async () => {
    setHealth(await localApps.daemonStatus().catch(() => ({ ok: false })));
  }, [localApps]);

  /** After a mutation: re-read health and ask the desktop to re-poll the list. */
  const refresh = useCallback(async () => {
    await Promise.all([refreshHealth(), onRefresh()]);
  }, [refreshHealth, onRefresh]);

  useEffect(() => {
    void refreshHealth();
    const timer = window.setInterval(() => {
      if (panelVisible && !document.hidden) void refreshHealth();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [refreshHealth, panelVisible]);

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
      if (panelVisible && !document.hidden) void refreshOpenLogs();
    }, 2000);
    return () => {
      cancelled = true;
      logsRequestRef.current += 1;
      window.clearInterval(timer);
    };
  }, [localApps, logsFor, panelVisible]);

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

  async function control(id: string, action: "start" | "stop" | "restart"): Promise<boolean> {
    setBusyId(id);
    try {
      await runActivity(`${apps.find(app => app.id === id)?.name || id} · ${action}`, async () => { await localApps.control(id, action); await refresh(); }, true);
      setStatus(action === "start" ? t.toast.started : action === "stop" ? t.toast.stopped : "");
      void refresh();
      return true;
    } catch (failure) {
      setStatus(failureMessage(failure, t.toast.failed));
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function openInWindow(app: LocalAppView) {
    // Ensure the process is up first. The daemon spawns quickly but the webapp
    // may need a beat to bind its port; the embedded frame's load-timeout and
    // fallback cover the rare slow boot.
    // A window for a program that failed to start would only sit on a loading screen.
    if (!app.status.running && !(await control(app.id, "start"))) return;
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

  function openManualForm() {
    setEditingId(null);
    setDraft(emptyDraft);
    setCustomIconFile(null);
    setShowForm(true);
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

  function loadLogs(app: LocalAppView) {
    if (logsFor === app.id) {
      logsRequestRef.current += 1;
      setLogsFor(null);
      setLogs([]);
      return;
    }
    logsRequestRef.current += 1;
    setLogs([]);
    setLogFilter(null);
    setLogsFor(app.id);
    void loadBundle(app);
  }

  async function loadBundle(app: LocalAppView) {
    if (!hasGeneratedScript(app) || requestedBundles.current.has(app.id)) return;
    requestedBundles.current.add(app.id);
    let bundle: LocalAppBundle | null = null;
    try {
      bundle = await localApps.bundle(app.id);
    } catch {
      // Treated like a non-imported app; the card still offers logs and controls.
    }
    setBundles((current) => ({ ...current, [app.id]: bundle }));
  }

  function toggleScript(app: LocalAppView) {
    if (scriptFor === app.id) {
      setScriptFor(null);
      return;
    }
    setScriptFor(app.id);
    void loadBundle(app);
  }

  async function finishImport(result: LocalAppImportResult) {
    setShowImport(false);
    setStatus(result.status === "started" && result.url
      ? t.importStarted(result.plan.name, result.url)
      : t.importRegistered(result.plan.name));
    await refresh();
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
        restart: "on-crash",
        ...(candidate.iconKind === "favicon" && candidate.iconUrl
          ? { iconKind: candidate.iconKind, iconUrl: candidate.iconUrl }
          : {})
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
  const orderedApps = apps.filter(app => !native || ((nativeFilter === "all" || (nativeFilter === "running") === app.status.running) && `${app.name} ${app.port}`.toLocaleLowerCase().includes(nativeSearch.toLocaleLowerCase()))).sort((left, right) => Number(right.status.running) - Number(left.status.running));
  const mappedPorts = new Set(apps.map((app) => app.port)).size;

  return (
    <div className={`builtin-panel system-panel local-apps-panel ${native ? "" : styles.fakePanel}`} data-system-tool="local-apps" data-native-layout={native ? tools.presentation.appearance : "classic"}>
      {native ? <nav className="native-library-navigation" aria-label={locale === "zh" ? "应用分类" : "Application views"}>
        <strong>{locale === "zh" ? "应用" : "Applications"}</strong>
        {[
          { id: "all", label: locale === "zh" ? "全部应用" : "All applications", icon: LayoutGrid },
          { id: "running", label: locale === "zh" ? "正在运行" : "Running", icon: CirclePlay },
          { id: "stopped", label: locale === "zh" ? "已停止" : "Stopped", icon: CirclePause },
        ].map(({ id, label, icon: Icon }) => <button key={id} aria-pressed={nativeFilter === id} onClick={() => setNativeFilter(id)}><Icon size={17} aria-hidden="true" /><span>{label}</span></button>)}
      </nav> : null}
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
            <Radar size={14} aria-hidden="true" />
            {discoveryBusy ? t.scanning : discovered ? t.hideDiscovery : t.scan}
          </button>
          <button className="secondary-action" onClick={openManualForm} disabled={!daemonOnline}>
            + {t.addWebApp}
          </button>
          <button
            className="primary-action"
            aria-expanded={showImport}
            onClick={() => setShowImport((open) => !open)}
            disabled={!daemonOnline}
          >
            <FolderOpen size={14} aria-hidden="true" />
            {showImport ? t.hideImport : t.importProject}
          </button>
        </div>
      </header>
      {native ? <label className="native-library-search"><Search size={15} aria-hidden="true" /><input aria-label={locale === "zh" ? "搜索本地应用" : "Search local applications"} placeholder={locale === "zh" ? "搜索本地应用" : "Search local applications"} value={nativeSearch} onChange={event => setNativeSearch(event.target.value)} /></label> : null}

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

      <div className="local-apps-scroll-region" ref={nativeScroll}>
        {!daemonOnline ? (
          <section className="store-empty">
            <h3>{t.daemonOffline}</h3>
            <p>{t.daemonOfflineHint}</p>
          </section>
        ) : null}

        {showImport && daemonOnline ? (
          <ProjectImport t={t} onImported={finishImport} onCancel={() => setShowImport(false)} />
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
            {apps.length === 0 && daemonOnline && !showForm && !showImport ? (
              <section className="local-apps-welcome" aria-labelledby="local-apps-welcome-title">
                <span className="local-apps-welcome-icon" aria-hidden="true"><FolderOpen size={26} /></span>
                <h3 id="local-apps-welcome-title">{t.noApps}</h3>
                <p>{t.noAppsHint}</p>
                <ol className="local-apps-steps">
                  {t.welcomeSteps.map((step, index) => (
                    <li key={step}><span>{index + 1}</span>{step}</li>
                  ))}
                </ol>
                <div className="local-apps-welcome-actions">
                  <button className="primary-action" onClick={() => setShowImport(true)}>
                    <FolderOpen size={14} aria-hidden="true" />{t.importProject}
                  </button>
                  <button onClick={scanLocalWebUis} disabled={discoveryBusy}>
                    <Radar size={14} aria-hidden="true" />{discoveryBusy ? t.scanning : t.scan}
                  </button>
                  <button onClick={openManualForm}>+ {t.addWebApp}</button>
                </div>
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
                  {native && orderedApps.length === 0 ? <p className="native-library-empty">{locale === "zh" ? "此视图中没有应用" : "No applications in this view"}</p> : null}
                  {orderedApps.map((app) => (
                    <LocalAppCard
                      key={app.id}
                      app={app}
                      t={t}
                      busy={busyId === app.id}
                      logsOpen={logsFor === app.id}
                      logs={logsFor === app.id ? logs : []}
                      logFilter={logFilter}
                      scriptOpen={scriptFor === app.id}
                      bundle={bundles[app.id]}
                      onControl={(action) => control(app.id, action)}
                      onOpen={() => openInWindow(app)}
                      onEdit={() => startEdit(app)}
                      onDelete={() => remove(app.id)}
                      onToggleLogs={() => loadLogs(app)}
                      onLogFilter={setLogFilter}
                      onToggleScript={() => toggleScript(app)}
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

function ProjectImport({
  t,
  onImported,
  onCancel
}: {
  t: LocalAppsText;
  onImported: (result: LocalAppImportResult) => Promise<void>;
  onCancel: () => void;
}) {
  const localApps = desktopData().localApps;
  const [projectPath, setProjectPath] = useState("");
  const [name, setName] = useState("");
  const [plan, setPlan] = useState<LocalAppImportPlan | null>(null);
  const [busy, setBusy] = useState<"plan" | "register" | "start" | null>(null);
  const [error, setError] = useState("");
  const input = { path: projectPath.trim(), ...(name.trim() ? { name: name.trim() } : {}) };

  async function preview() {
    if (!input.path) return;
    setBusy("plan");
    setError("");
    setPlan(null);
    try {
      setPlan(await localApps.planImport(input));
    } catch (failure) {
      setError(failureMessage(failure, t.toast.failed));
    } finally {
      setBusy(null);
    }
  }

  async function register(start: boolean) {
    setBusy(start ? "start" : "register");
    setError("");
    try {
      const result = await runActivity(`${plan?.name ?? input.path} · import`, () => localApps.importProject({ ...input, start }));
      await onImported(result);
    } catch (failure) {
      setError(failureMessage(failure, t.toast.failed));
    } finally {
      setBusy(null);
    }
  }

  // A plan describes exactly these inputs; editing them invalidates it.
  function edit(update: () => void) {
    update();
    setPlan(null);
    setError("");
  }

  return (
    <section className="project-import" aria-labelledby="project-import-title">
      <header>
        <div>
          <h3 id="project-import-title">{t.importTitle}</h3>
          <p>{t.importHint}</p>
        </div>
        <button type="button" onClick={onCancel} aria-label={t.cancel} title={t.cancel}>×</button>
      </header>
      <ol className="project-import-steps" aria-label={t.importTitle}>
        {t.welcomeSteps.map((step, index) => {
          const current = busy === "start" ? 2 : plan ? 1 : 0;
          return (
            <li key={step} aria-current={index === current ? "step" : undefined} data-done={index < current || undefined}>
              <span>{index + 1}</span>{step}
            </li>
          );
        })}
      </ol>
      <form
        className="project-import-form"
        onSubmit={(event) => {
          event.preventDefault();
          void preview();
        }}
      >
        <label className="dialog-label">
          {t.importPath}
          <input
            value={projectPath}
            onChange={(event) => edit(() => setProjectPath(event.target.value))}
            placeholder={t.importPathPlaceholder}
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <label className="dialog-label">
          {t.importName}
          <input
            value={name}
            onChange={(event) => edit(() => setName(event.target.value))}
            placeholder={t.importNamePlaceholder}
          />
        </label>
        <button type="submit" disabled={!input.path || busy !== null}>
          {busy === "plan" ? t.previewing : t.preview}
        </button>
      </form>

      {error ? <p className="local-app-error" role="alert">{error}</p> : null}

      {plan ? (
        <div className="project-import-plan">
          <p className="project-import-summary">
            <strong>{plan.name}</strong> · {t.planSummary(plan.services.length)}
          </p>
          <ServiceList services={plan.services} t={t} />
          {plan.notes.length > 0 ? (
            <ul className="project-import-notes">
              {plan.notes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          ) : null}
          <p className="project-import-location">
            <span>{t.bundleLocation}</span>
            <code title={plan.bundleDir}>{plan.bundleDir}</code>
          </p>
          <div className="dialog-actions">
            <button type="button" disabled={busy !== null} onClick={() => register(false)}>
              {busy === "register" ? t.importing : t.registerOnly}
            </button>
            <button type="button" className="primary-action" disabled={busy !== null} onClick={() => register(true)}>
              {busy === "start" ? t.startingImport : t.registerAndStart}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ServiceList({ services, t }: { services: LocalAppBundleService[]; t: LocalAppsText }) {
  return (
    <ol className="bundle-services">
      {services.map((service) => {
        const recipe = [service.command, ...service.args].join(" ");
        return (
          <li key={`${service.name}:${service.port}`} className={service.role === "primary" ? "is-primary" : undefined}>
            <div className="bundle-service-title">
              <span className="bundle-service-icon" aria-hidden="true">
                {service.role === "primary" ? <Monitor size={14} /> : <Server size={14} />}
              </span>
              <strong>{service.name}</strong>
              <span className="local-app-port">:{service.port}</span>
              <small>{service.role === "primary" ? t.primaryService : t.dependencyService}</small>
              <small>{service.framework}</small>
            </div>
            <code title={recipe}>{recipe}</code>
            <span className="bundle-service-cwd" title={service.cwd}>{service.cwd}</span>
            {service.note ? <small className="bundle-service-note">{service.note}</small> : null}
          </li>
        );
      })}
    </ol>
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
              <span className="discovery-icon" aria-hidden="true">
                {candidate.iconUrl ? <img src={candidate.iconUrl} alt="" /> : initialsForTitle(candidate.name)}
              </span>
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
  t,
  busy,
  logsOpen,
  logs,
  logFilter,
  scriptOpen,
  bundle,
  onControl,
  onOpen,
  onEdit,
  onDelete,
  onToggleLogs,
  onLogFilter,
  onToggleScript
}: {
  app: LocalAppView;
  t: LocalAppsText;
  busy: boolean;
  logsOpen: boolean;
  logs: string[];
  logFilter: string | null;
  scriptOpen: boolean;
  bundle: LocalAppBundle | null | undefined;
  onControl: (action: "start" | "stop" | "restart") => void;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleLogs: () => void;
  onLogFilter: (service: string | null) => void;
  onToggleScript: () => void;
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
  // Multi-service bundles tag each line with its service; single-service logs need no filter.
  const services = bundle && bundle.services.length > 1 ? bundle.services : [];
  const visibleLogs = logFilter && services.length > 0
    ? logs.filter((line) => logLineService(line) === logFilter)
    : logs;

  const chips = bundle?.services.length ? bundle.services : null;

  return (
    <article className={`local-app-card${running ? " is-running" : ""}${errored ? " is-error" : ""}`} data-state={dotClass.replace("local-app-dot-", "")}>
      <div className="local-app-row">
        <span className="local-app-avatar" aria-hidden="true">{initialsForTitle(app.name)}</span>
        <div className="local-app-identity">
          <div className="local-app-title-row">
            <strong title={app.name}>{app.name}</strong>
            <span className={`local-app-status-pill ${dotClass}`}>
              <span className={`local-app-dot ${dotClass}`} aria-hidden="true" />
              {statusLabel}
            </span>
          </div>
          <div className="local-app-meta">
            {chips ? chips.map((service) => (
              <span key={`${service.name}:${service.port}`} className="local-app-service-chip" title={[service.command, ...service.args].join(" ")}>
                {service.role === "primary" ? <Monitor size={12} aria-hidden="true" /> : <Server size={12} aria-hidden="true" />}
                {service.name}<span>:{service.port}</span>
              </span>
            )) : (
              <span className="local-app-service-chip" title={app.cwd ? `${recipe}\n${app.cwd}` : recipe}>
                <Monitor size={12} aria-hidden="true" />
                <code>{app.command.split("/").pop()}</code><span>:{app.port}</span>
              </span>
            )}
            {running ? (
              <span className="local-app-metrics" aria-label={`${app.name} runtime`}>
                {t.status.cpu} {app.status.cpuPercent.toFixed(1)}% · {formatMemory(app.status.memoryBytes)} · {app.status.processCount} {t.status.processes}
              </span>
            ) : null}
          </div>
        </div>
        <div className="local-app-actions">
          {running ? (
            <button className="primary-action local-app-open" disabled={busy} onClick={onOpen}>
              <AppWindow size={14} aria-hidden="true" />{t.open}
            </button>
          ) : (
            <button className="primary-action" disabled={busy} onClick={() => onControl("start")}>
              <Play size={14} aria-hidden="true" />{t.start}
            </button>
          )}
          <div className="local-app-tools" role="group" aria-label={app.name}>
            {running ? (
              <IconAction label={t.stop} disabled={busy} onClick={() => onControl("stop")}><Square size={15} /></IconAction>
            ) : (
              <IconAction label={t.open} disabled={busy} onClick={onOpen}><AppWindow size={15} /></IconAction>
            )}
            <IconAction label={t.restart} disabled={busy || !running} onClick={() => onControl("restart")}><RotateCw size={15} /></IconAction>
            <IconAction label={t.logs} pressed={logsOpen} onClick={onToggleLogs}><ScrollText size={15} /></IconAction>
            {hasGeneratedScript(app) ? (
              <IconAction label={t.script} pressed={scriptOpen} onClick={onToggleScript}><FileCode2 size={15} /></IconAction>
            ) : null}
            <IconAction label={t.edit} onClick={onEdit}><Pencil size={15} /></IconAction>
            <IconAction label={t.delete} danger disabled={busy} onClick={onDelete}><Trash2 size={15} /></IconAction>
          </div>
        </div>
      </div>

      {app.status.lastError ? (
        <p className="local-app-error">
          <span>{app.status.lastError}</span>
          {!logsOpen ? <button type="button" onClick={onToggleLogs}>{t.logs}</button> : null}
        </p>
      ) : null}

      {logsOpen ? (
        <div className="local-app-log-view">
          {services.length > 0 ? (
            <div className="local-app-log-filter" role="group" aria-label={t.logs}>
              <button aria-pressed={logFilter === null} onClick={() => onLogFilter(null)}>{t.allServices}</button>
              {services.map((service) => (
                <button
                  key={service.name}
                  aria-pressed={logFilter === service.name}
                  onClick={() => onLogFilter(service.name)}
                >
                  {service.name}
                </button>
              ))}
            </div>
          ) : null}
          <pre className="local-app-logs">
            {visibleLogs.length === 0 ? t.noLogs : visibleLogs.join("\n")}
          </pre>
        </div>
      ) : null}

      {scriptOpen ? (
        <section className="local-app-bundle" aria-label={t.script}>
          {bundle === undefined ? <p>{t.scriptLoading}</p> : bundle === null ? <p>{t.notImported}</p> : (
            <>
              <ServiceList services={bundle.services} t={t} />
              <dl className="local-app-bundle-paths">
                <div><dt>{t.scriptPath}</dt><dd><code title={bundle.scriptPath}>{bundle.scriptPath}</code></dd></div>
                <div><dt>{t.manifestPath}</dt><dd><code title={bundle.manifestPath}>{bundle.manifestPath}</code></dd></div>
              </dl>
              <pre className="local-app-script">{bundle.script}</pre>
            </>
          )}
        </section>
      ) : null}
    </article>
  );
}

/** A compact icon button whose label is both its accessible name and its tooltip. */
function IconAction({
  label,
  onClick,
  disabled,
  pressed,
  danger,
  children
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`local-app-icon-action${danger ? " is-danger" : ""}`}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** The service's own explanation when it gave one, otherwise the generic fallback. */
function failureMessage(failure: unknown, fallback: string): string {
  return reasonFor(failure) ?? fallback;
}

/** Project imports run through a generated `<bundle>/run.sh`; the server confirms the bundle location. */
function hasGeneratedScript(app: LocalAppView): boolean {
  return app.command.endsWith("/run.sh");
}

/** Daemon lines look like `[time] stdout [service] text` once run.sh tags them. */
function logLineService(line: string): string | null {
  return /^\[[^\]]*\] \S+ \[([^\]]+)\] /.exec(line)?.[1] ?? null;
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
  grid-template-columns: 34px minmax(150px, 0.75fr) minmax(200px, 1.5fr) auto;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
}
.discovery-icon { display: grid; width: 32px; height: 32px; place-items: center; overflow: hidden; border: 1px solid var(--border-hairline-ink); border-radius: var(--radius-control); color: var(--text-primary); font-family: var(--type-mono); font-size: 0.62rem; background: var(--surface-raised-2); }
.discovery-icon img { width: 100%; height: 100%; object-fit: contain; }
.discovery-row + .discovery-row { border-top: 1px solid var(--border-hairline-ink); }
.discovery-main { display: flex; align-items: baseline; gap: var(--space-2); min-width: 0; }
.discovery-main strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.discovery-main span { color: var(--text-secondary); font-family: var(--type-mono); font-size: 0.72rem; }
.discovery-main small { color: var(--text-secondary); font-size: 0.68rem; }
.discovery-row code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font-size: 0.7rem; }
.discovery-row button { min-height: 44px; padding: var(--space-2) var(--space-3); }
.discovery-row button:disabled { opacity: 0.45; cursor: not-allowed; }
.project-import {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  border-bottom: 1px solid var(--la-line);
  padding: var(--space-3) var(--space-4);
  background: var(--la-surface);
}
.project-import > header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-4); }
.project-import h3 { margin: 0; font-size: 0.9rem; }
.project-import header p { margin: var(--space-1) 0 0; color: var(--la-muted); font-size: 0.74rem; line-height: 1.4; }
.project-import header button { min-width: 44px; min-height: 44px; }
.project-import-form {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) auto;
  align-items: end;
  gap: var(--space-3);
}
.project-import-form input { width: 100%; min-width: 0; font-family: var(--type-mono); }
.project-import-form button, .project-import .dialog-actions button {
  min-height: 44px;
  border: 1px solid var(--la-line);
  border-radius: var(--radius-control);
  padding: var(--space-2) var(--space-3);
  color: var(--la-ink);
  background: var(--la-surface-2);
}
.project-import .dialog-actions .primary-action {
  border-color: transparent;
  color: var(--la-on-accent);
  background: var(--la-accent);
}
.project-import button:disabled { opacity: 0.45; cursor: not-allowed; }
.project-import-plan { display: grid; gap: var(--space-3); }
.project-import-summary { margin: 0; font-size: 0.8rem; color: var(--la-muted); }
.project-import-summary strong { color: var(--la-ink); }
.project-import-notes { margin: 0; padding-inline-start: var(--space-4); color: var(--la-muted); font-size: 0.74rem; }
.project-import-location { display: flex; min-width: 0; gap: var(--space-2); margin: 0; font-size: 0.72rem; color: var(--la-muted); }
.project-import-location code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bundle-services { display: grid; margin: 0; padding: 0; list-style: none; border: 1px solid var(--la-line); border-radius: var(--radius-control); }
.bundle-services li { display: grid; min-width: 0; gap: var(--space-1); padding: var(--space-2) var(--space-3); }
.bundle-services li + li { border-top: 1px solid var(--la-line); }
.bundle-services li.is-primary { background: var(--la-surface-2); }
.bundle-service-title { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.bundle-service-title small { color: var(--la-muted); font-size: 0.68rem; }
.bundle-services code, .bundle-service-cwd {
  overflow: hidden;
  color: var(--la-muted);
  font-family: var(--type-mono);
  font-size: 0.7rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bundle-service-note { color: var(--la-muted); font-size: 0.68rem; }
.local-app-log-view { display: grid; gap: var(--space-2); }
.local-app-log-filter { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.local-apps-panel .local-app-log-filter button {
  min-height: 30px;
  border: 1px solid var(--la-line);
  border-radius: 999px;
  padding: 0 12px;
  color: var(--la-ink);
  font-size: 0.74rem;
  background: var(--la-surface-2);
}
.local-apps-panel .local-app-log-filter button[aria-pressed="true"] { border-color: transparent; color: var(--la-on-accent); background: var(--la-accent); }
.local-app-bundle { display: grid; gap: var(--space-2); }
.local-app-bundle > p { margin: 0; color: var(--la-muted); font-size: 0.76rem; }
.local-app-bundle-paths { display: grid; gap: var(--space-1); margin: 0; font-size: 0.7rem; }
.local-app-bundle-paths > div { display: flex; min-width: 0; gap: var(--space-2); }
.local-app-bundle-paths dt { flex: 0 0 auto; color: var(--la-muted); }
.local-app-bundle-paths dd { min-width: 0; margin: 0; }
.local-app-bundle-paths code { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.local-app-script {
  max-height: 320px;
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
/* Panel-scoped palette: light shells use the paper tokens; the classic dark canvas remaps these in its module CSS. */
.local-apps-panel {
  --la-surface: var(--surface-raised);
  --la-surface-2: var(--surface-raised-2);
  --la-ink: var(--text-primary);
  --la-muted: var(--text-secondary);
  --la-line: var(--border-hairline-ink);
  --la-accent: var(--accent-base);
  --la-on-accent: var(--text-on-accent);
}
/* ---- Redesigned app cards: one primary action, quiet icon tools, service chips ---- */
.local-apps-header .system-panel-actions > button { display: inline-flex; align-items: center; gap: 6px; }
.local-apps-header .primary-action { border-color: transparent; color: var(--la-on-accent); background: var(--la-accent); }
.local-apps-panel .local-apps-inventory .local-apps-list { display: grid; gap: 8px; padding-block: 10px; background: none; container-type: inline-size; }
.local-apps-panel .local-apps-list > .local-app-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  border: 1px solid var(--la-line);
  border-radius: 10px;
  padding: 12px 14px;
  background: var(--la-surface);
  box-shadow: inset 3px 0 0 var(--state-stopped);
  transition: border-color 120ms ease, box-shadow 120ms ease;
}
.local-apps-panel .local-apps-list > .local-app-card::before { display: none; }
.local-apps-panel .local-apps-list > .local-app-card:hover { border-color: color-mix(in srgb, var(--la-accent) 35%, var(--la-line)); }
.local-apps-panel .local-apps-list > .local-app-card[data-state="running"] { box-shadow: inset 3px 0 0 var(--state-running); }
.local-apps-panel .local-apps-list > .local-app-card[data-state="booting"] { box-shadow: inset 3px 0 0 var(--state-starting); }
.local-apps-panel .local-apps-list > .local-app-card[data-state="error"] { box-shadow: inset 3px 0 0 var(--state-failed); }
.local-app-row { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; align-items: center; gap: 12px; }
.local-app-avatar {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border-radius: 10px;
  color: var(--la-ink);
  font-size: 0.8rem;
  font-weight: 650;
  letter-spacing: 0.02em;
  background: color-mix(in srgb, var(--la-accent) 16%, var(--la-surface-2));
}
.local-app-identity { display: grid; min-width: 0; gap: 5px; }
.local-app-identity .local-app-title-row { display: flex; min-width: 0; align-items: center; gap: 8px; }
.local-app-identity .local-app-title-row strong { overflow: hidden; font-size: 0.9rem; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.local-app-identity .local-app-status-pill {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 5px;
  border: 0;
  border-radius: 999px;
  padding: 2px 8px;
  color: var(--la-ink);
  font-family: inherit;
  font-size: 0.68rem;
  background: color-mix(in srgb, var(--state-stopped) 14%, transparent);
}
.local-app-identity .local-app-status-pill.local-app-dot-running { background: color-mix(in srgb, var(--state-running) 18%, transparent); }
.local-app-identity .local-app-status-pill.local-app-dot-booting { background: color-mix(in srgb, var(--state-starting) 22%, transparent); }
.local-app-identity .local-app-status-pill.local-app-dot-error { color: var(--state-failed); background: color-mix(in srgb, var(--state-failed) 12%, transparent); }
.local-app-identity .local-app-dot { width: 6px; height: 6px; }
.local-app-dot.local-app-dot-booting { animation: local-app-pulse 1.2s ease-in-out infinite; }
@keyframes local-app-pulse { 50% { opacity: 0.35; } }
@media (prefers-reduced-motion: reduce) { .local-app-dot.local-app-dot-booting { animation: none; } }
.local-app-meta { display: flex; min-width: 0; flex-wrap: wrap; align-items: center; gap: 6px; }
.local-app-service-chip {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--la-line);
  border-radius: 6px;
  padding: 2px 7px;
  color: var(--la-muted);
  font-size: 0.72rem;
  background: var(--la-surface-2);
}
.local-app-service-chip code { overflow: hidden; font-size: inherit; text-overflow: ellipsis; white-space: nowrap; }
.local-app-service-chip > span { font-family: var(--type-mono); }
.local-app-metrics { color: var(--la-muted); font-size: 0.7rem; font-variant-numeric: tabular-nums; }
.local-apps-panel .local-app-card .local-app-actions { display: flex; grid-column: auto; flex-wrap: nowrap; align-items: center; gap: 8px; }
.local-apps-panel .local-app-card .local-app-actions > .primary-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  border: 0;
  border-radius: 8px;
  padding: 0 12px;
  color: var(--la-on-accent);
  font-size: 0.78rem;
  font-weight: 600;
  background: var(--la-accent);
}
.local-app-tools {
  display: flex;
  align-items: center;
  gap: 2px;
  border: 1px solid var(--la-line);
  border-radius: 8px;
  padding: 2px;
  background: var(--la-surface-2);
}
.local-apps-panel .local-app-card .local-app-actions .local-app-tools > .local-app-icon-action {
  display: grid;
  width: 30px;
  height: 30px;
  min-height: 0;
  place-items: center;
  border: 0;
  border-radius: 6px;
  padding: 0;
  color: var(--la-muted);
  background: transparent;
}
.local-apps-panel .local-app-card .local-app-actions .local-app-tools > .local-app-icon-action:hover:not(:disabled),
.local-apps-panel .local-app-card .local-app-actions .local-app-tools > .local-app-icon-action[aria-pressed="true"] {
  color: var(--la-ink);
  background: color-mix(in srgb, var(--la-accent) 16%, transparent);
}
.local-apps-panel .local-app-card .local-app-actions .local-app-tools > .local-app-icon-action.is-danger:hover:not(:disabled) { color: var(--state-failed); background: color-mix(in srgb, var(--state-failed) 12%, transparent); }
.local-apps-panel .local-app-card .local-app-actions .local-app-tools > .local-app-icon-action:disabled { opacity: 0.35; cursor: not-allowed; }
.local-apps-panel .local-app-card .local-app-actions .local-app-tools > .local-app-icon-action:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 1px; }
.local-apps-panel .local-app-card .local-app-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 0;
  border-radius: 8px;
  padding: 8px 10px;
  color: var(--state-failed);
  font-size: 0.74rem;
  background: color-mix(in srgb, var(--state-failed) 10%, transparent);
}
.local-app-error > span { min-width: 0; overflow-wrap: anywhere; }
.local-app-error > button { flex: 0 0 auto; border: 0; padding: 0; color: inherit; font: inherit; font-weight: 600; text-decoration: underline; background: none; }

/* ---- First-run welcome and import steps ---- */
.local-apps-welcome { display: grid; max-width: 520px; justify-items: center; gap: 10px; margin: 24px auto; padding: 28px 20px; text-align: center; }
.local-apps-welcome-icon {
  display: grid;
  width: 56px;
  height: 56px;
  place-items: center;
  border-radius: 16px;
  color: var(--la-ink);
  background: color-mix(in srgb, var(--la-accent) 20%, var(--la-surface-2));
}
.local-apps-welcome h3 { margin: 4px 0 0; font-size: 1.05rem; }
.local-apps-welcome > p { margin: 0; color: var(--la-muted); font-size: 0.8rem; line-height: 1.55; }
.local-apps-steps, .project-import-steps { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0; padding: 0; list-style: none; }
.local-apps-steps { justify-content: center; }
.local-apps-steps li, .project-import-steps li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--la-line);
  border-radius: 999px;
  padding: 4px 10px 4px 4px;
  color: var(--la-muted);
  font-size: 0.74rem;
  background: var(--la-surface-2);
}
.local-apps-steps li > span, .project-import-steps li > span {
  display: grid;
  width: 18px;
  height: 18px;
  place-items: center;
  border-radius: 999px;
  color: var(--la-ink);
  font-size: 0.66rem;
  font-weight: 700;
  background: var(--la-surface);
}
.project-import-steps li[aria-current="step"] { border-color: var(--la-accent); color: var(--la-ink); }
.project-import-steps li[aria-current="step"] > span,
.project-import-steps li[data-done] > span,
.local-apps-steps li > span { color: var(--la-on-accent); background: var(--la-accent); }
.local-apps-welcome-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 6px; }
.local-apps-welcome-actions > button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  border: 1px solid var(--la-line);
  border-radius: 8px;
  padding: 0 14px;
  color: var(--la-ink);
  font-size: 0.8rem;
  background: var(--la-surface);
}
.local-apps-welcome-actions > .primary-action { border-color: transparent; color: var(--la-on-accent); font-weight: 600; background: var(--la-accent); }
.bundle-service-icon { display: inline-grid; width: 22px; height: 22px; place-items: center; border-radius: 6px; color: var(--la-muted); background: var(--la-surface); }
.bundle-services li.is-primary .bundle-service-icon { color: var(--la-on-accent); background: var(--la-accent); }
/* Narrow windows: actions move under the identity instead of squeezing the name. */
@container (max-width: 640px) {
  .local-app-row { grid-template-columns: 36px minmax(0, 1fr); }
  .local-app-avatar { width: 36px; height: 36px; }
  .local-apps-panel .local-app-card .local-app-actions { grid-column: 1 / -1; flex-wrap: wrap; justify-content: space-between; }
}
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
  .project-import-form { grid-template-columns: minmax(0, 1fr); }
  .discovery-row { grid-template-columns: 34px minmax(0, 1fr) auto; }
  .discovery-row code { grid-column: 2 / -1; grid-row: 2; }
}
@media (max-width: 720px) {
  .local-apps-header { align-items: flex-start; }
  .local-apps-header .system-panel-actions { align-items: stretch; }
  .local-app-recipe span { display: none; }
}
`;
