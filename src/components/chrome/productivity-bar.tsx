"use client";
import { useEffect, useRef, useState } from "react";
import { desktopData } from "@/lib/desktop-data";
import { Search, PanelsTopLeft, Layers3, LayoutGrid, Bell, Folder } from "lucide-react";
import type { DesktopApp, DesktopPayload } from "@/lib/contracts";
import type { AppWindowState } from "@/protocol/shell/v1";
import { Dialog } from "@/components/dialogs/dialog";
import {
  displayAppTitle,
  isAppStoreApp,
  readLocalJson,
  writeLocalJson,
} from "@/lib/desktop-helpers";
import type { I18nMessages } from "@/lib/i18n";
import { restoreWindows, windowSession } from "@/lib/window-session";
import { splitBounds, tileWindows } from "@/lib/window-layout";
import {
  activity,
  canRetryActivity,
  clearActivities,
  retryActivity,
  runActivity,
  useActivities,
} from "@/lib/desktop-activity";

type Scene = {
  id: string;
  name: string;
  session: ReturnType<typeof windowSession>;
};
type Panel = "search" | "windows" | "scenes" | "organize" | "activity";
const panelIcons = { search: Search, windows: PanelsTopLeft, scenes: Layers3, organize: LayoutGrid, activity: Bell };
export function ProductivityBar({
  apps,
  payload,
  windows,
  t,
  zh,
  onOpen,
  onWindows,
  onPayload,
  onFilter,
  onPrepareScene,
  onCloseWindow,
  hiddenToolbar = false,
  request,
}: {
  hiddenToolbar?: boolean;
  request?: { panel: "windows" | "scenes" | "organize" | "activity" } | null;
  apps: DesktopApp[];
  payload: DesktopPayload;
  windows: AppWindowState[];
  t: I18nMessages;
  zh: boolean;
  onOpen: (app: DesktopApp) => void;
  onWindows: (windows: AppWindowState[]) => void;
  onPrepareScene: (apps: DesktopApp[]) => Promise<void>;
  onCloseWindow: (id: string) => void;
  onPayload: (payload: DesktopPayload) => void;
  onFilter: (ids: string[] | null) => void;
}) {
  const [panel, setPanel] = useState<Panel | null>(null);
  useEffect(() => { if (request) setPanel(request.panel); }, [request]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [groups, setGroups] = useState<Record<string, string>>({});
  const [group, setGroup] = useState("");
  const [filter, setFilter] = useState("");
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [sceneName, setSceneName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [undo, setUndo] = useState<{
    snapshot: DesktopPayload;
    ids: string[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const tasks = useActivities();
  const state = useRef({
    apps,
    windows,
    onOpen,
    onWindows,
    onCloseWindow,
    panel,
  });
  state.current = { apps, windows, onOpen, onWindows, onCloseWindow, panel };
  const groupKey = `vd:groups:${payload.desktop.id}`;
  const sceneKey = `vd:scenes:${payload.desktop.id}`;
  useEffect(() => {
    const savedGroups = readLocalJson<unknown>(groupKey, {});
    if (
      savedGroups &&
      typeof savedGroups === "object" &&
      !Array.isArray(savedGroups)
    )
      setGroups(
        Object.fromEntries(
          Object.entries(savedGroups).filter(
            ([, v]) => typeof v === "string" && v.length <= 40,
          ),
        ),
      );
    const savedScenes = readLocalJson<unknown>(sceneKey, []);
    if (Array.isArray(savedScenes))
      setScenes(
        savedScenes
          .filter(
            (s) =>
              s &&
              typeof s.id === "string" &&
              typeof s.name === "string" &&
              s.session &&
              Array.isArray(s.session.windows),
          )
          .slice(0, 20),
      );
    const savedRecent = readLocalJson<unknown>("vd:recent-apps", []);
    if (Array.isArray(savedRecent))
      setRecent(savedRecent.filter((x) => typeof x === "string").slice(0, 20));
  }, [groupKey, sceneKey]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setQuery("");
        setPanel("search");
        return;
      }
      if (
        state.current.panel ||
        (event.target as HTMLElement).closest(
          'input,textarea,[contenteditable="true"],[role="dialog"]',
        )
      )
        return;
      if (event.altKey && event.key.toLowerCase() === "w") {
        event.preventDefault();
        setPanel("windows");
      }
      if (event.altKey && event.shiftKey && event.key.toLowerCase() === "x") {
        event.preventDefault();
        const top = [...state.current.windows]
          .filter((w) => w.mode === "open")
          .sort((a, b) => b.z - a.z)[0];
        if (top) state.current.onCloseWindow(top.id);
      }
      if (event.altKey && event.key === "`") {
        event.preventDefault();
        const current = state.current.windows;
        if (!current.length) return;
        const sorted = [...current].sort((a, b) => a.z - b.z);
        const next = sorted[0];
        state.current.onWindows(
          current.map((w) =>
            w.id === next.id
              ? {
                  ...w,
                  mode: "open",
                  z: Math.max(...current.map((x) => x.z)) + 1,
                }
              : w,
          ),
        );
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    onFilter(
      filter
        ? apps.filter((a) => groups[a.id] === filter).map((a) => a.id)
        : null,
    );
  }, [filter, groups, apps, onFilter]);
  const label = (cn: string, en: string) => (zh ? cn : en);
  const labels: Record<Panel, string> = {
    search: label("快捷搜索", "Quick search"),
    windows: label("窗口总览", "Windows"),
    scenes: label("工作场景", "Work scenes"),
    organize: label("整理应用", "Organize apps"),
    activity: label("任务通知", "Activity"),
  };
  const sortedApps = [...apps].sort((a, b) => {
    const ai = recent.indexOf(a.id),
      bi = recent.indexOf(b.id);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  });
  const results = sortedApps
    .filter((a) =>
      `${displayAppTitle(a, t)} ${a.title} ${a.url || ""} ${groups[a.id] || ""}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
    )
    .slice(0, 30);
  function launch(app: DesktopApp) {
    const next = [app.id, ...recent.filter((id) => id !== app.id)].slice(0, 20);
    setRecent(next);
    writeLocalJson("vd:recent-apps", next);
    const existing = windows.find((w) => w.app.id === app.id);
    if (existing) focus(existing.id);
    else onOpen(app);
    setPanel(null);
  }
  function focus(id: string) {
    onWindows(
      windows.map((w) =>
        w.id === id
          ? {
              ...w,
              mode: "open",
              z: Math.max(10, ...windows.map((x) => x.z)) + 1,
            }
          : w,
      ),
    );
  }
  async function batch(action: "delete" | "undo") {
    setBusy(true);
    setError("");
    const snapshot = action === "delete" ? payload : undo?.snapshot;
    const ids =
      action === "delete"
        ? selected.filter((id) =>
            payload.apps.some((a) => a.id === id && a.kind !== "builtin"),
          )
        : undo?.ids;
    try {
      const next = await runActivity(
        label(
          action === "delete" ? "批量移除快捷方式" : "撤销移除",
          action === "delete" ? "Remove shortcuts" : "Undo removal",
        ),
        () => action === "delete"
          ? desktopData().batchApps({ action, ids: ids ?? [] })
          : snapshot
            ? desktopData().batchApps({ action, ids: ids ?? [], snapshot })
            : Promise.reject(new Error("No removal to undo.")),
      );
      onPayload(next);
      if (action === "delete") {
        setUndo({ snapshot: payload, ids: ids! });
        onWindows(windows.filter((w) => !ids!.includes(w.app.id)));
      } else setUndo(null);
      setSelected([]);
      setConfirmDelete(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function saveScene() {
    const name = sceneName.trim();
    if (!name) return;
    const existing = scenes.find((s) => s.name === name);
    const next = [
      {
        id: existing?.id || crypto.randomUUID(),
        name: name.slice(0, 60),
        session: windowSession(payload.desktop.id, windows),
      },
      ...scenes.filter((s) => s.id !== existing?.id),
    ].slice(0, 20);
    setScenes(next);
    writeLocalJson(sceneKey, next);
    setSceneName("");
    activity(label("已保存工作场景", "Work scene saved"), "success", name);
  }
  async function restoreScene(scene: Scene) {
    setBusy(true);
    setError("");
    try {
      const restored = restoreWindows(
        scene.session,
        payload.desktop.id,
        apps,
        window.innerWidth,
        window.innerHeight,
      );
      await onPrepareScene(
        restored.filter((w) => w.mode === "open").map((w) => w.app),
      );
      // Reuse IDs and mounted contents. Other windows are minimized, never destroyed.
      const desired = restored.map((w, i) => ({
        ...w,
        id: windows.find((x) => x.app.id === w.app.id)?.id || w.id,
        z: Math.max(10, ...windows.map((x) => x.z)) + i + 1,
      }));
      onWindows([
        ...windows.map(
          (w) =>
            desired.find((x) => x.id === w.id) || {
              ...w,
              mode: "minimized" as const,
            },
        ),
        ...desired.filter((w) => !windows.some((x) => x.id === w.id)),
      ]);
      const missing = scene.session.windows.filter(
        (w) => w && !apps.some((a) => a.id === w.appId),
      ).length;
      activity(
        label("已恢复工作场景", "Work scene restored"),
        "success",
        `${scene.name}${missing ? label(`；${missing} 个应用当前不可用`, `; ${missing} apps unavailable`) : ""}`,
      );
      setPanel(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const groupFilter = (
    <label className="desktop-group-filter">
      <Folder size={15} strokeWidth={1.7} aria-hidden="true" />
      <select
        aria-label={label("筛选分组", "Filter group")}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      >
        <option value="">{label("全部", "All")}</option>
        {[...new Set(Object.values(groups))].filter(Boolean).sort().map((g) => (
          <option key={g}>{g}</option>
        ))}
      </select>
    </label>
  );

  return (
    <>
      <output className="sr-only" aria-live="polite">
        {tasks[0]
          ? `${tasks[0].title} · ${tasks[0].state === "error" ? label("需处理", "Needs attention") : tasks[0].state === "running" ? label("进行中", "In progress") : label("已完成", "Completed")}`
          : ""}
      </output>
      <nav
        className="productivity-bar"
        style={hiddenToolbar ? { display: "none" } : undefined}
        aria-label={label("桌面工具", "Desktop tools")}
      >
        {(Object.keys(labels) as Panel[]).map((id) => {
          const Icon = panelIcons[id];
          return (
          <button
            key={id}
            className={`desktop-tool desktop-tool-${id}`}
            aria-label={labels[id]}
            aria-expanded={panel === id}
            title={id === "search" ? `${labels[id]} · Ctrl / ⌘ K` : labels[id]}
            onClick={() => {
              setPanel(id);
              setError("");
            }}
          >
            <Icon size={16} strokeWidth={1.7} aria-hidden="true" />
            <span>{labels[id]}</span>
            {id === "search" && <kbd aria-hidden="true">Ctrl K</kbd>}
            {id === "activity" && tasks.some((x) => x.state === "running") && <i className="desktop-tool-indicator" aria-hidden="true" />}
          </button>
        ); })}
        {groupFilter}
      </nav>
      {panel && (
        <Dialog
          title={labels[panel]}
          t={t}
          onClose={() => {
            if (!busy) setPanel(null);
          }}
          className="productivity-dialog"
          initialFocusSelector={
            panel === "search" ? 'input[type="search"]' : undefined
          }
        >
          <div className="productivity-content">
            {error && <p role="alert">{error}</p>}
            {panel === "search" && (
              <>
                <label>
                  {label("搜索应用或设置", "Search apps or settings")}
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && results[0]) {
                        e.preventDefault();
                        launch(results[0]);
                      }
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        e.currentTarget.parentElement?.nextElementSibling
                          ?.querySelector<HTMLButtonElement>("button")
                          ?.focus();
                      }
                    }}
                  />
                </label>
                <div className="productivity-list">
                  {results.map((app) => (
                    <button key={app.id} onClick={() => launch(app)}>
                      {displayAppTitle(app, t)}
                      <small>
                        {windows.some((w) => w.app.id === app.id)
                          ? label("切换到窗口", "Switch to window")
                          : groups[app.id] || app.url}
                      </small>
                    </button>
                  ))}
                  {!results.length && (
                    <p>
                      {label(
                        "没有匹配应用，试试其他名称。",
                        "No matching apps. Try another name.",
                      )}
                    </p>
                  )}
                </div>
                <p>Ctrl / ⌘ + K · Enter · Tab · Esc</p>
              </>
            )}
            {panel === "windows" && (
              <>
                <div className="productivity-actions">
                  <button
                    onClick={() =>
                      onWindows(
                        tileWindows(
                          windows,
                          window.innerWidth,
                          window.innerHeight,
                        ),
                      )
                    }
                  >
                    {label("平铺窗口", "Tile windows")}
                  </button>
                  <button
                    onClick={() =>
                      onWindows(
                        windows.map((w) => ({ ...w, mode: "minimized" })),
                      )
                    }
                  >
                    {label("显示桌面", "Show desktop")}
                  </button>
                </div>
                {!windows.length && (
                  <p>
                    {label(
                      "打开应用后，它们会显示在这里。",
                      "Open an app to see its window here.",
                    )}
                  </p>
                )}
                {[...windows]
                  .sort((a, b) => b.z - a.z)
                  .map((win) => (
                    <div className="productivity-row" key={win.id}>
                      <button
                        onClick={() => {
                          focus(win.id);
                          setPanel(null);
                        }}
                      >
                        {displayAppTitle(win.app, t)} ·{" "}
                        {win.mode === "minimized"
                          ? label("已最小化", "Minimized")
                          : label("已打开", "Open")}
                      </button>
                      {(["left", "right"] as const).map((side) => (
                        <button
                          key={side}
                          onClick={() =>
                            onWindows(
                              windows.map((w) =>
                                w.id === win.id
                                  ? {
                                      ...w,
                                      ...splitBounds(
                                        side,
                                        window.innerWidth,
                                        window.innerHeight,
                                      ),
                                      mode: "open",
                                    }
                                  : w,
                              ),
                            )
                          }
                        >
                          {side === "left"
                            ? label("左分屏", "Left half")
                            : label("右分屏", "Right half")}
                        </button>
                      ))}
                      <button
                        onClick={() =>
                          onWindows(
                            windows.map((w) =>
                              w.id === win.id ? { ...w, mode: "minimized" } : w,
                            ),
                          )
                        }
                      >
                        {label("最小化", "Minimize")}
                      </button>
                    </div>
                  ))}
                <p>
                  {label(
                    "Alt + W 打开总览；Alt + ` 切换窗口；Alt + Shift + X 关闭当前窗口。快捷键在桌面获得焦点时生效。",
                    "Alt + W: overview; Alt + `: cycle windows; Alt + Shift + X: close. Shortcuts work while the desktop has focus.",
                  )}
                </p>
              </>
            )}
            {panel === "scenes" && (
              <>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveScene();
                  }}
                >
                  <label>
                    {label("场景名称", "Scene name")}
                    <input
                      maxLength={60}
                      value={sceneName}
                      onChange={(e) => setSceneName(e.target.value)}
                    />
                  </label>
                  <button disabled={!sceneName.trim() || !windows.length}>
                    {label("保存当前场景", "Save current scene")}
                  </button>
                </form>
                <p>
                  {label(
                    "同名保存会更新布局。恢复时保留其他窗口的内容，应用内部文档由应用自行保存。",
                    "Saving the same name updates its layout. Restoring preserves other windows; each app owns its documents.",
                  )}
                </p>
                {scenes.map((scene) => (
                  <div className="productivity-row" key={scene.id}>
                    <span>
                      {scene.name} · {scene.session.windows?.length || 0}
                    </span>
                    <button
                      disabled={busy}
                      onClick={() => void restoreScene(scene)}
                    >
                      {label("恢复场景", "Restore scene")}
                    </button>
                    <button
                      onClick={() => {
                        const next = scenes.filter((s) => s.id !== scene.id);
                        setScenes(next);
                        writeLocalJson(sceneKey, next);
                      }}
                    >
                      {label("删除场景", "Delete scene")}
                    </button>
                  </div>
                ))}
              </>
            )}
            {panel === "organize" && (
              <>
                {hiddenToolbar ? groupFilter : null}
                <p>
                  {label(
                    "选择多个应用，统一设置分组。移除快捷方式不会卸载本地服务；系统入口会保留。",
                    "Select apps to group them. Removing shortcuts does not uninstall local services; system entries are kept.",
                  )}
                </p>
                <div className="productivity-actions">
                  <button onClick={() => setSelected(apps.map((a) => a.id))}>
                    {label("全选", "Select all")}
                  </button>
                  <button onClick={() => setSelected([])}>
                    {label("取消选择", "Clear selection")}
                  </button>
                  <label>
                    {label("目标分组", "Target group")}
                    <input
                      value={group}
                      maxLength={40}
                      onChange={(e) => setGroup(e.target.value)}
                    />
                  </label>
                  <button
                    disabled={!selected.length}
                    onClick={() => {
                      const next = { ...groups };
                      selected.forEach((id) => {
                        if (group.trim()) next[id] = group.trim();
                        else delete next[id];
                      });
                      setGroups(next);
                      writeLocalJson(groupKey, next);
                    }}
                  >
                    {label("移动到分组", "Move to group")}
                  </button>
                </div>
                <div className="productivity-list">
                  {apps.map((app) => (
                    <label key={app.id}>
                      <input
                        type="checkbox"
                        checked={selected.includes(app.id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, app.id]
                              : selected.filter((id) => id !== app.id),
                          )
                        }
                      />
                      {displayAppTitle(app, t)} <small>{groups[app.id]}</small>
                    </label>
                  ))}
                </div>
                <div className="productivity-actions">
                  <button
                    disabled={
                      busy ||
                      !selected.some((id) =>
                        payload.apps.some(
                          (a) => a.id === id && a.kind !== "builtin",
                        ),
                      )
                    }
                    onClick={() => setConfirmDelete(true)}
                  >
                    {label("移除所选快捷方式", "Remove selected shortcuts")}
                  </button>
                  {undo && (
                    <button disabled={busy} onClick={() => void batch("undo")}>
                      {label("撤销移除", "Undo removal")}
                    </button>
                  )}
                </div>
                {confirmDelete && (
                  <div role="alert">
                    <p>
                      {label(
                        "确定移除所选快捷方式？可以在此面板撤销。",
                        "Remove selected shortcuts? You can undo here.",
                      )}
                    </p>
                    <button
                      disabled={busy}
                      onClick={() => void batch("delete")}
                    >
                      {label("确认移除", "Confirm removal")}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => setConfirmDelete(false)}
                    >
                      {label("取消", "Cancel")}
                    </button>
                  </div>
                )}
              </>
            )}
            {panel === "activity" && (
              <>
                <button onClick={clearActivities}>
                  {label("清除已结束任务", "Clear finished tasks")}
                </button>
                {!tasks.length && (
                  <p>
                    {label(
                      "暂时没有任务。安装、启动和备份结果会留在这里。",
                      "No tasks yet. Installation, startup and backup results appear here.",
                    )}
                  </p>
                )}
                {tasks.map((task) => (
                  <article className="productivity-task" key={task.id}>
                    <strong>{task.title}</strong>
                    <span>
                      {task.state === "running"
                        ? label("进行中", "In progress")
                        : task.state === "error"
                          ? label("需处理", "Needs attention")
                          : label("已完成", "Completed")}
                    </span>
                    <time>{new Date(task.at).toLocaleString()}</time>
                    <p>{task.detail}</p>
                    {task.id.startsWith("embed:") &&
                      apps.some((app) => app.id === task.id.slice(6)) && (
                        <button
                          onClick={() =>
                            launch(
                              apps.find((app) => app.id === task.id.slice(6))!,
                            )
                          }
                        >
                          {label("打开应用", "Open app")}
                        </button>
                      )}
                    {task.id.startsWith("catalog:") &&
                      apps.some(isAppStoreApp) && (
                        <button
                          onClick={() => launch(apps.find(isAppStoreApp)!)}
                        >
                          {label("打开应用商店", "Open App Store")}
                        </button>
                      )}
                    {task.state === "error" && canRetryActivity(task.id) && (
                      <button
                        onClick={() =>
                          void retryActivity(task.id)?.catch(() => undefined)
                        }
                      >
                        {label("重试", "Retry")}
                      </button>
                    )}
                  </article>
                ))}
              </>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
