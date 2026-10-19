/** A complete browser-native shell. Both shipped packages use the public host API only. */
export async function mount(host) {
  host.styleContent(await (await fetch(host.asset("content.css"), { signal: host.signal })).text());
  if (host.signal.aborted) return;
  const root = host.root;
  const shell = root.querySelector(".os-shell");
  const mac = shell.dataset.appearance === "macos";
  shell.classList.add(mac ? "macos" : "windows");
  const q = selector => root.querySelector(selector);
  const signal = host.signal;
  const listen = (node, event, fn, options = {}) => node.addEventListener(event, fn, { ...options, signal });
  const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const paths = {
    activity: '<rect x="2" y="3" width="20" height="18" rx="3"/><path d="M3 13h4l3-6 4 11 3-5h4"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    view: '<rect x="3" y="4" width="12" height="16" rx="2"/><rect x="17" y="6" width="4" height="12" rx="1"/>',
    wifi: '<path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0"/><circle cx="12" cy="20" r=".6"/>',
    settings: '<path d="m9 3-.8 3-2.8.8L3 5.7 1.7 8l2.2 2.2v3.6L1.7 16 3 18.3l2.4-1.1 2.8.8.8 3h3l.8-3 2.8-.8 2.4 1.1 1.3-2.3-2.2-2.2v-3.6L19.3 8 18 5.7l-2.4 1.1-2.8-.8-.8-3z" transform="translate(1)"/><circle cx="11.5" cy="12" r="3"/>',
    folder: '<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 9h18"/>',
    cloud: '<path d="M7 18a5 5 0 1 1 0-10 6 6 0 0 1 11.6 2 4 4 0 0 1-.6 8z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    bag: '<path d="M5 7h14l2 14H3zM8 8V6a4 4 0 0 1 8 0v2"/>',
    terminal: '<rect x="2" y="3" width="20" height="18" rx="3"/><path d="m6 8 4 4-4 4m7 0h5"/>',
    browser: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a18 18 0 0 1 0 20 18 18 0 0 1 0-20"/>',
    plus: '<path d="M12 4v16M4 12h16"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    minus: '<path d="M5 12h14"/>',
    maximize: '<rect x="5" y="5" width="14" height="14" rx="1"/>',
    restore: '<path d="M8 5V3h13v13h-2"/><rect x="3" y="8" width="13" height="13" rx="1"/>',
    arrow: '<path d="m9 5 7 7-7 7"/>',
    external: '<path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7"/>',
    palette: '<circle cx="12" cy="12" r="9"/><circle cx="8" cy="8" r="1"/><circle cx="15" cy="7" r="1"/><circle cx="6" cy="13" r="1"/><path d="M15 20c-4-6 8-7 5-12"/>',
    moon: '<path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13z"/>',
    sliders: '<path d="M4 6h16M4 18h16"/><circle cx="9" cy="6" r="3" fill="currentColor"/><circle cx="15" cy="18" r="3" fill="currentColor"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    left: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/><path d="M5 5h5v14H5z" fill="currentColor" stroke="none"/>',
    right: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/><path d="M14 5h5v14h-5z" fill="currentColor" stroke="none"/>',
    refresh: '<path d="M20 5v5h-5M4 19v-5h5M5 8a8 8 0 0 1 13-3l2 2M4 17l2 2a8 8 0 0 0 13-3"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  };
  const svg = (name, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.grid}</svg>`;
  function systemSnapshot(snapshot) { return { ...snapshot, apps: snapshot.apps.map(app => app.iconUrl === "vd://icon/start-board" ? { ...app, label: snapshot.locale === "zh" ? mac ? "活动监视器" : "任务管理器" : mac ? "Activity Monitor" : "Task Manager" } : app) }; }
  let state = systemSnapshot(host.snapshot());
  let panel = "";
  let overview = false;
  let desktopHiddenIds = [];
  let currentDrag = null;
  let appSignature = "";
  let windowSignature = "";
  let settingsSave = Promise.resolve();
  let preferences = { ...state.preferences.values };
  let lastPrefRevision = state.preferences.revision;
  let desktopSelection = "";
  let suppressIconClickUntil = 0;
  let iconDragging = false;
  let search = "";
  const frames = new Map();
  const text = (zh, en) => state.locale === "zh" ? zh : en;
  const appType = app => app.iconUrl?.startsWith("vd://icon/") ? app.iconUrl.slice(10) : app.source === "local" ? "local-apps" : "browser";
  const glyph = type => ({ "start-board": "activity", "app-store": "bag", "local-apps": "terminal", "weather": "sun", "settings": "settings", "webui-import": "browser" }[type] || "browser");
  const icon = app => {
    const type = appType(app);
    return `<span class="app-glyph glyph-${escape(type)}${app.imageUrl ? " has-image" : ""}">${app.imageUrl ? `<img src="${escape(app.imageUrl)}" alt="" draggable="false">` : svg(glyph(type))}</span>`;
  };
  const button = (label, action, glyphName, cls = "") => `<button class="${cls}" data-action="${action}" aria-label="${escape(label)}" title="${escape(label)}">${svg(glyphName)}</button>`;
  const mark = mac ? '<span class="vibe-mark">v</span>' : '<span class="win-mark"><i></i><i></i><i></i><i></i></span>';
  shell.innerHTML = `
    <div class="wallpaper" aria-hidden="true"></div><div class="wallpaper-light" aria-hidden="true"></div><canvas class="effect-canvas" aria-hidden="true"></canvas>
    <header class="menu-bar">${button("桌面菜单", "menu", "grid", "brand-menu")}<button class="active-app" data-action="launcher">${text("桌面", "Desktop")}</button><nav><button data-action="file">${text("文件", "File")}</button><button data-action="view">${text("显示", "View")}</button><button data-action="windows">${text("窗口", "Window")}</button><button data-action="help">${text("帮助", "Help")}</button></nav><div class="menu-status">${button("搜索应用", "search", "search")}${button("连接状态", "connection", "wifi")}${button("控制中心", "controls", "sliders")}<button data-action="calendar" class="menu-clock"></button></div></header>
    <div class="os-desktop-icons" role="group" aria-label="桌面应用"></div>
    <div class="window-layer"></div><div class="snap-preview" hidden></div>
    <div class="overview-label" hidden><strong>${text("所有窗口", "All windows")}</strong><span>${text("点选一个窗口，回到工作中", "Choose a window to continue")}</span><button data-action="overview">${text("完成", "Done")}</button></div>
    <footer class="taskbar"><button class="taskbar-weather" data-action="widgets">${svg("cloud")}<span><strong>Vibe Desktop</strong><small>${text("你的个人空间", "Your personal space")}</small></span></button><div class="taskbar-center"><button class="start-button" data-action="launcher" aria-label="${mac ? "启动台" : "开始"}" title="${mac ? "启动台" : "开始"}">${mark}</button>${button("搜索应用", "search", "search", "search-button")}${button("任务视图", "overview", "view", "view-button")}<span class="dock-separator"></span><div class="pinned-apps"></div><span class="dock-separator"></span>${button("桌面外观", "packages", "palette", "package-button")}</div><div class="taskbar-tray">${button("外观与特效", "controls", "sliders")}${button("连接状态", "connection", "wifi")}<button class="tray-clock" data-action="calendar"></button><button class="show-desktop" data-action="desktop" aria-label="显示桌面" title="显示桌面"></button></div></footer>
    <div class="panel-layer"></div><div class="shell-toast" role="status" hidden></div>`;
  if (mac) q(".brand-menu").innerHTML = '<span class="vibe-mark">v</span>';
  const icons = q(".os-desktop-icons"), pinned = q(".pinned-apps"), layer = q(".window-layer"), panels = q(".panel-layer");
  const findApp = id => state.apps.find(a => a.id === id);
  const pinnedIds = () => Array.isArray(preferences.pinnedApps) ? preferences.pinnedApps : state.apps.slice(0, 10).map(a => a.id);
  const openSettings = () => { const app = state.apps.find(a => appType(a) === "settings"); if (app) openApp(app.id); };
  const desktopApps = () => state.desktopAppIds ? state.apps.filter(a => state.desktopAppIds.includes(a.id)) : state.apps;
  const findWindow = id => state.windows.find(w => w.id === id);
  let toastTimer;
  function toast(message) { const node = q(".shell-toast"); node.textContent = message; node.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { node.hidden = true; }, 3500); }
  function save(next) {
    preferences = { ...preferences, ...next }; applyPreferences(); syncApps(); syncWindows();
    const captured = { ...preferences };
    settingsSave = settingsSave.catch(() => {}).then(async () => {
      try { await host.savePreferences(captured); }
      catch (error) { toast(error.code === "revision_conflict" ? text("设置已在其他页面更改，请重新切换桌面后再保存。", "Settings changed elsewhere. Reload this desktop before saving.") : error.message); }
    });
  }
  function applyPreferences() {
    shell.classList.toggle("is-dark", preferences.dark === true);
    host.presentSystemTools({ appearance: mac ? "macos" : "windows", colorScheme: preferences.dark === true ? "dark" : "light", accent: typeof preferences.accent === "string" && /^#[a-f\d]{6}$/i.test(preferences.accent) ? preferences.accent : "#2979ed" });
    shell.classList.toggle("reduce-motion", state.reducedMotion || preferences.motion === false);
    shell.classList.toggle("solid-surfaces", preferences.glass === false);
    shell.classList.toggle("ambient-motion", preferences.ambient === true && !state.reducedMotion && preferences.motion !== false);
    shell.style.setProperty("--os-icon-size", `${Math.max(36, Math.min(72, Number(preferences.iconSize) || 48))}px`);
    shell.style.setProperty("--dock-icon-size", `${Math.max(32, Math.min(64, Number(preferences.dockSize) || (mac ? 48 : 30)))}px`);
    if (typeof preferences.accent === "string" && /^#[a-f\d]{6}$/i.test(preferences.accent)) shell.style.setProperty("--os-accent", preferences.accent);
    q(".wallpaper").style.backgroundImage = state.wallpaper || "";
    q(".effect-canvas").hidden = preferences.particles !== true;
    layoutIcons();
    updateEffects();
  }
  function openApp(id) { host.open(id); closePanel(); overview = false; syncWindows(); }
  function closePanel() { panel = ""; search = ""; panels.replaceChildren(); shell.classList.remove("panel-open"); root.querySelectorAll('[aria-expanded="true"]').forEach(n => n.setAttribute("aria-expanded", "false")); }
  function activatePanel(name, anchor) {
    if (panel === name) { closePanel(); return; }
    closePanel(); panel = name; shell.classList.add("panel-open");
    if (anchor) anchor.setAttribute("aria-expanded", "true");
    const node = document.createElement("section"); node.className = `shell-panel panel-${name}`; node.setAttribute("aria-label", ({ launcher: "开始菜单", search: "搜索应用", controls: "外观与特效", calendar: "日历", connection: "连接状态" })[name] || "桌面菜单");
    panels.append(node);
    if (name === "launcher" || name === "search") {
      node.innerHTML = `<div class="launcher-search">${svg("search")}<input aria-label="搜索应用" placeholder="${text("搜索应用，开始新的工作", "Search apps and start something")}" autocomplete="off"><kbd>Ctrl Space</kbd></div><div class="launcher-heading"><strong>${text(mac ? "应用程序" : "已固定", mac ? "Applications" : "Pinned")}</strong><button data-action="all-apps">${text("所有应用", "All apps")} ${svg("arrow")}</button></div><div class="launcher-apps"></div><div class="recent-heading"><strong>${text("继续工作", "Pick up where you left off")}</strong><span>${state.windows.length ? text("打开的窗口", "Open windows") : text("属于你的工作空间", "A space for your work")}</span></div><div class="recent-apps"></div><footer class="launcher-footer"><span class="user-avatar">${escape(state.userName.slice(0, 1))}</span><strong>${escape(state.userName)}</strong><button data-action="packages">${svg("palette")} ${text("个性化", "Personalize")}</button>${button("工作场景", "workspace:scenes", "folder")}${button("添加应用", "add", "plus")}</footer>`;
      renderSearch();
      const input = node.querySelector("input"); listen(input, "input", () => { search = input.value; renderSearch(); });
      listen(input, "keydown", event => { if (event.key === "Enter") node.querySelector(".launcher-apps button")?.click(); });
      if (name === "search") requestAnimationFrame(() => input.focus());
    } else if (name === "controls" || name === "view") {
      node.classList.add("panel-controls");
      node.innerHTML = `<header><span>${text("控制中心", "Control Center")}</span>${button("关闭", "dismiss", "close")}</header><div class="control-tiles"><button data-toggle="dark" aria-pressed="${preferences.dark === true}">${svg("moon")}<strong>${text("深色外观", "Dark appearance")}</strong><small>${text("桌面与窗口", "Desktop & windows")}</small></button><button data-toggle="glass" aria-pressed="${preferences.glass !== false}">${svg("view")}<strong>${text("通透玻璃", "Translucency")}</strong><small>${text("柔和模糊", "Soft backdrop blur")}</small></button><button data-toggle="motion" aria-pressed="${preferences.motion !== false}">${svg("refresh")}<strong>${text("灵动动效", "Motion effects")}</strong><small>${state.reducedMotion ? text("系统已减少动态", "Reduced by system") : text("窗口与 Dock", "Windows & Dock")}</small></button><button data-toggle="particles" aria-pressed="${preferences.particles === true}">${svg("sun")}<strong>${text("星尘特效", "Stardust")}</strong><small>${text("轻盈粒子", "Floating particles")}</small></button></div><label class="effect-range"><span>${text("桌面图标", "Desktop icons")}</span><input aria-label="桌面图标大小" type="range" data-setting="iconSize" min="36" max="72" value="${Number(preferences.iconSize) || 48}"></label><label class="effect-range"><span>${text(mac ? "Dock 大小" : "任务栏图标", mac ? "Dock size" : "Taskbar icons")}</span><input aria-label="Dock 图标大小" type="range" data-setting="dockSize" min="32" max="64" value="${Number(preferences.dockSize) || (mac ? 48 : 32)}"></label><div class="accent-options"><span>${text("强调色", "Accent")}</span>${["#2979ed", "#a360e8", "#ef688d", "#259879", "#d77b24"].map(color => `<button data-accent="${color}" style="--swatch:${color}" aria-label="强调色 ${color}" ${preferences.accent === color ? 'aria-pressed="true"' : ""}></button>`).join("")}</div><button class="ambient-option" data-toggle="ambient" aria-pressed="${preferences.ambient === true}">${svg("sun")} ${text("动态壁纸光影", "Ambient wallpaper motion")}<span>${preferences.ambient === true ? "ON" : "OFF"}</span></button><footer><button data-action="packages">${svg("palette")} ${text("更多桌面与自定义", "Desktop packages & customization")}${svg("arrow")}</button></footer>`;
      for (const input of node.querySelectorAll("input[type=range]")) { listen(input, "input", () => { preferences = { ...preferences, [input.dataset.setting]: Number(input.value) }; applyPreferences(); }); listen(input, "change", () => save({ [input.dataset.setting]: Number(input.value) })); }
    } else if (name === "calendar" || name === "widgets") {
      const now = new Date(), first = new Date(now.getFullYear(), now.getMonth(), 1), count = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      node.innerHTML = `<header><span>${text("今天", "Today")}</span>${button("关闭", "dismiss", "close")}</header><div class="calendar-date"><strong>${now.getDate()}</strong><span>${new Intl.DateTimeFormat(state.locale, { month: "long", year: "numeric", weekday: "long" }).format(now)}</span></div><div class="calendar-grid">${(state.locale === "zh" ? ["日", "一", "二", "三", "四", "五", "六"] : ["S", "M", "T", "W", "T", "F", "S"]).map(day => `<span class="weekday">${day}</span>`).join("")}${Array.from({ length: first.getDay() }, () => "<span></span>").join("")}${Array.from({ length: count }, (_, i) => `<span class="${i + 1 === now.getDate() ? "today" : ""}">${i + 1}</span>`).join("")}</div><div class="calendar-summary">${svg("view")}<span>${state.windows.filter(w => w.mode === "open").length} ${text("个窗口正在桌面上", "windows on your desktop")}</span></div>`;
    } else if (name === "connection") {
      node.innerHTML = `<header><span>${text("本地服务", "Local service")}</span>${button("关闭", "dismiss", "close")}</header><div class="connection-info">${svg("wifi")}<strong>${text("正在检查连接…", "Checking connection…")}</strong><p>${text("应用管理器与桌面服务的实时状态", "Live desktop and app manager status")}</p></div>`;
      host.data.localApps.daemonStatus().then(result => { if (panel === name && !signal.aborted) node.querySelector("strong").textContent = result.ok ? text("应用管理器已连接", "App manager connected") : text("应用管理器尚未连接", "App manager unavailable"); }).catch(() => { if (panel === name) node.querySelector("strong").textContent = text("暂时无法获取状态", "Status unavailable"); });
    } else {
      node.classList.add("menu-popover");
      const menus = {
        menu: [["packages", "palette", "关于这个桌面 / 个性化"], ["launcher", "grid", "应用程序"], ["controls", "sliders", "外观与特效"], ["workspace:scenes", "folder", "工作场景"], ["workspace:organize", "grid", "分组与批量操作"], ["workspace:activity", "view", "任务通知"], ["desktop", "view", "显示桌面"]],
        file: [["add", "plus", "添加应用快捷方式"], ["arrange", "grid", "整理桌面图标"], ["wallpaper", "palette", "更换壁纸"]],
        help: [["packages", "palette", "桌面包与自定义"], ["shortcuts", "terminal", "键盘快捷键"]],
        windows: [["overview", "view", "显示所有窗口"], ["desktop", "minus", "全部最小化"], ...state.windows.map(w => [`focus:${w.id}`, "browser", findApp(w.app.id)?.label || w.app.title])],
      };
      node.innerHTML = (menus[name] || menus.menu).map(([action, glyphName, label]) => `<button data-action="${escape(action)}">${svg(glyphName)}<span>${escape(label)}</span>${svg("arrow")}</button>`).join("");
      if (anchor && mac) { const bounds = anchor.getBoundingClientRect(); node.style.left = `${Math.min(bounds.left, innerWidth - 270)}px`; }
    }
  }
  function renderSearch() {
    const results = state.apps.filter(a => (a.label + a.title + (a.url || "")).toLowerCase().includes(search.toLowerCase()));
    q(".launcher-apps").innerHTML = results.length ? results.map(a => `<button data-open="${escape(a.id)}">${icon(a)}<span>${escape(a.label)}</span></button>`).join("") : `<p class="no-results">${text("没有找到应用，换个关键词试试。", "No apps found. Try another search.")}</p>`;
    const recent = [...state.windows].sort((a, b) => b.z - a.z).slice(0, 4);
    q(".recent-apps").innerHTML = recent.length ? recent.map(w => { const app = findApp(w.app.id) || { ...w.app, label: w.app.title }; return `<button data-action="focus:${escape(w.id)}">${icon(app)}<span><strong>${escape(app.label)}</strong><small>${text(w.mode === "minimized" ? "已最小化，继续工作" : "窗口已打开", w.mode === "minimized" ? "Minimized · resume" : "Window is open")}</small></span></button>`; }).join("") : `<div class="empty-recents">${svg("folder")}<span>${text("打开一个应用，从这里继续。", "Open an app to get started.")}</span></div>`;
  }
  function snap(id, side) {
    const w = findWindow(id); if (!w) return;
    const top = mac ? 36 : 12, bottom = mac ? 96 : 60, gap = 10;
    if (side === "fill") { host.patch(id, { maximized: !w.maximized, tiled: false }); return; }
    const thirds = side.startsWith("third-"), quarter = side.startsWith("quarter-");
    const columns = thirds ? 3 : 2, index = thirds ? Number(side.slice(6)) : side.endsWith("right") ? 1 : 0;
    const width = (innerWidth - gap * (columns + 1)) / columns, height = quarter ? (innerHeight - top - bottom - gap) / 2 : innerHeight - top - bottom;
    host.patch(id, { x: gap + index * (width + gap), y: top + (side.includes("bottom") ? height + gap : 0), width, height, maximized: false, tiled: true });
  }
  function showSnap(id, anchor) {
    closePanel(); panel = "snap";
    const bounds = anchor.getBoundingClientRect();
    panels.innerHTML = `<section class="shell-panel snap-menu" aria-label="窗口布局" style="left:${Math.max(8, Math.min(innerWidth - 228, bounds.right - 210))}px;top:${bounds.bottom + 6}px"><strong>${text("窗口布局", "Window layout")}</strong><div>${["left", "right", "fill", "quarter-top-left", "quarter-top-right", "quarter-bottom-left", "quarter-bottom-right", "third-0", "third-1", "third-2"].map((side, i) => `<button data-snap="${side}" data-id="${escape(id)}" aria-label="${["靠左分屏", "靠右分屏", "最大化或还原", "左上四分屏", "右上四分屏", "左下四分屏", "右下四分屏", "左侧三分屏", "中间三分屏", "右侧三分屏"][i]}"><span class="layout-preview layout-${side}"><i></i></span></button>`).join("")}</div></section>`;
    const menu = panels.firstElementChild; menu.style.top = `${Math.max(mac ? 34 : 8, Math.min(bounds.bottom + 6, innerHeight - menu.offsetHeight - 8))}px`;
  }
  function syncApps() {
    const signature = JSON.stringify([state.desktopAppIds, pinnedIds(), state.windows.map(w => w.app.id), state.apps.map(a => [a.id, a.label, a.imageUrl, a.gridX, a.gridY, a.running])]);
    if (signature === appSignature) return;
    if (iconDragging) return;
    appSignature = signature;
    icons.innerHTML = desktopApps().map(a => `<button class="os-desktop-icon" data-app="${escape(a.id)}" aria-label="${escape(a.label)}" title="${escape(a.label)}" style="--grid-x:${a.gridX};--grid-y:${a.gridY}">${icon(a)}<span>${escape(a.label)}</span>${a.running ? '<i class="app-running-dot"></i>' : ""}</button>`).join("");
    layoutIcons();
    pinned.innerHTML = state.apps.filter(a => pinnedIds().includes(a.id) || state.windows.some(w => w.app.id === a.id)).map(a => `<button class="dock-app" data-dock="${escape(a.id)}" aria-label="${escape(a.label)}" title="${escape(a.label)}">${icon(a)}<span class="dock-label">${escape(a.label)}</span><i class="running-indicator"></i></button>`).join("");
  }
  function layoutIcons() {
    const small = innerWidth < 640, stepX = small ? (innerWidth - 28) / 3 : 106, stepY = 112;
    const rows = Math.max(1, Math.floor((innerHeight - (mac ? 150 : 120)) / stepY));
    const columns = small ? 3 : Math.max(1, Math.floor((innerWidth - 36) / stepX));
    const positions = preferences.positions || {};
    const used = new Set(), reserved = new Map();
    // Reserve explicit placements before assigning defaults, regardless of app order.
    if (!small) for (const app of desktopApps()) {
      const saved = positions[app.id];
      if (saved && Number.isInteger(saved.column) && Number.isInteger(saved.row) && saved.column >= 0 && saved.column < columns && saved.row >= 0 && saved.row < rows && !used.has(`${saved.column}:${saved.row}`)) {
        reserved.set(app.id, saved); used.add(`${saved.column}:${saved.row}`);
      }
    }
    desktopApps().forEach((app, index) => {
      const node = [...icons.children].find(n => n.dataset.app === app.id); if (!node) return;
      const saved = reserved.get(app.id);
      let column = small ? index % columns : Math.floor(index / rows), row = small ? Math.floor(index / columns) : index % rows;
      if (saved) { column = saved.column; row = saved.row; }
      while (!saved && used.has(`${column}:${row}`)) { row++; if (row >= rows) { row = 0; column++; } }
      used.add(`${column}:${row}`);
      Object.assign(node.style, { position: "absolute", top: `${row * stepY}px`, width: `${small ? stepX : 88}px`, left: mac && !small ? "auto" : `${column * stepX}px`, right: mac && !small ? `${column * stepX}px` : "auto" });
    });
  }
  listen(icons, "pointerdown", event => {
    const node = event.target.closest("[data-app]");
    if (!node || event.button !== 0 || innerWidth < 640) return;
    const startX = event.clientX, startY = event.clientY;
    const bounds = icons.getBoundingClientRect();
    node.setPointerCapture(event.pointerId);
    let moved = false;
    const move = e => {
      if (e.pointerId !== event.pointerId) return;
      if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) < 5) return;
      moved = true; iconDragging = true; node.style.zIndex = "10"; node.style.transform = `translate(${e.clientX - startX}px,${e.clientY - startY}px)`;
    };
    const finish = e => {
      if (e.pointerId !== event.pointerId) return;
      node.style.transform = ""; node.style.zIndex = ""; iconDragging = false;
      node.removeEventListener("pointermove", move); node.removeEventListener("pointerup", finish); node.removeEventListener("pointercancel", finish);
      if (!moved || e.type !== "pointerup") return;
      suppressIconClickUntil = performance.now() + 400;
      const columns = Math.max(1, Math.floor((innerWidth - 36) / 106)), rows = Math.max(1, Math.floor((innerHeight - (mac ? 150 : 120)) / 112));
      const column = Math.max(0, Math.min(columns - 1, Math.floor((mac ? bounds.right - e.clientX : e.clientX - bounds.left) / 106)));
      const row = Math.max(0, Math.min(rows - 1, Math.floor((e.clientY - bounds.top) / 112)));
      const positions = { ...(preferences.positions || {}) };
      for (const [id, position] of Object.entries(positions)) if (position.column === column && position.row === row) delete positions[id];
      save({ positions: { ...positions, [node.dataset.app]: { column, row } } });
    };
    listen(node, "pointermove", move); listen(node, "pointerup", finish); listen(node, "pointercancel", finish);
  });
  function newFrame(w) {
    const frame = document.createElement("section"); frame.className = "shell-window"; frame.dataset.window = w.id; frame.dataset.tool = w.app.kind === "builtin" ? appType(w.app) : "web-app"; frame.setAttribute("aria-label", findApp(w.app.id)?.label || w.app.title);
    const close = button("关闭", "close-window", "close", "close-control"), minimize = button("最小化", "minimize-window", "minus", "minimize-control"), maximize = button("最大化或还原", "maximize-window", "maximize", "maximize-control");
    const controls = `<div class="window-controls">${mac ? close + minimize + maximize : close + maximize + minimize}</div>`;
    frame.innerHTML = `<header class="shell-titlebar">${controls}<span class="window-caption">${mac ? "" : button("窗口菜单", "window-menu", glyph(appType(w.app)), "window-icon")}<span>${escape(findApp(w.app.id)?.label || w.app.title)}</span></span><div class="window-extras">${w.app.url ? button("在浏览器打开", "external-window", "external") : ""}${button("窗口布局", "snap-window", "view")}</div></header><div class="shell-window-body"></div>${["n","ne","e","se","s","sw","w","nw"].map(edge => `<span class="resize-edge resize-${edge}" data-edge="${edge}" aria-hidden="true"></span>`).join("")}<button class="overview-select" aria-label="切换到此窗口"></button>`;
    frame.querySelector(".shell-window-body").append(host.content(w.id));
    listen(frame, "pointerdown", () => { if (!overview) host.focus(w.id); });
    listen(frame.querySelector(".overview-select"), "click", () => { overview = false; host.focus(w.id); syncWindows(); });
    listen(frame.querySelector(".shell-titlebar"), "dblclick", event => { if (!event.target.closest("button") && !overview) snap(w.id, "fill"); });
    listen(frame.querySelector(".shell-titlebar"), "pointerdown", event => beginDrag(event, w.id, false));
    for (const edge of frame.querySelectorAll(".resize-edge")) listen(edge, "pointerdown", event => beginDrag(event, w.id, edge.dataset.edge));
    if (!mac) listen(frame.querySelector(".window-icon"), "dblclick", event => { event.stopPropagation(); closePanel(); host.close(w.id); });
    listen(frame.querySelector(".maximize-control"), "contextmenu", event => { event.preventDefault(); event.stopPropagation(); showSnap(w.id, event.currentTarget); });
    let snapTimer;
    listen(frame.querySelector(".maximize-control"), "pointerenter", event => { const anchor = event.currentTarget; snapTimer = setTimeout(() => { if (!currentDrag && !signal.aborted) showSnap(w.id, anchor); }, 650); });
    listen(frame.querySelector(".maximize-control"), "pointerleave", () => clearTimeout(snapTimer));
    listen(signal, "abort", () => clearTimeout(snapTimer));
    layer.append(frame); frames.set(w.id, frame); return frame;
  }
  function syncWindows() {
    const top = Math.max(0, ...state.windows.filter(w => w.mode === "open").map(w => w.z));
    const sorted = [...state.windows].sort((a, b) => a.z - b.z);
    for (const [id, frame] of frames) if (!state.windows.some(w => w.id === id)) { frame.remove(); frames.delete(id); }
    shell.classList.toggle("overview-mode", overview);
    q(".overview-label").hidden = !overview;
    sorted.forEach((w, index) => {
      const frame = frames.get(w.id) || newFrame(w);
      const small = innerWidth < 640;
      const max = w.maximized || small;
      const previousMode = frame.dataset.mode;
      const activeMotion = !state.reducedMotion && preferences.motion !== false;
      if (previousMode === "open" && w.mode === "minimized" && !overview && activeMotion) {
        const animation = frame.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: mac ? "translateY(230px) scale(.08)" : "translateY(100px) scale(.82)" }], { duration: mac ? 320 : 180, easing: "cubic-bezier(.4,0,.8,.5)" });
        animation.id = "shell-minimize";
        animation.onfinish = () => { if (findWindow(w.id)?.mode === "minimized" && !overview) frame.hidden = true; };
      } else if (!frame.getAnimations().some(a => a.id === "shell-minimize")) frame.hidden = w.mode === "minimized" && !overview;
      if ((previousMode === "minimized" && w.mode === "open") || overview) {
        for (const animation of frame.getAnimations()) if (animation.id === "shell-minimize") animation.cancel();
        frame.hidden = false;
        if (!overview && activeMotion) frame.animate([{ opacity: 0, transform: "translateY(35px) scale(.92)" }, { opacity: 1, transform: "none" }], { duration: mac ? 320 : 220, easing: "cubic-bezier(.16,1,.3,1)" });
      }
      frame.inert = w.mode === "minimized" && !overview;
      frame.classList.toggle("is-active", w.z === top && w.mode === "open");
      frame.classList.toggle("is-maximized", max);
      frame.dataset.mode = w.mode;
      frame.style.zIndex = String(20 + index);
      const topInset = mac ? 34 : 8, bottomInset = mac ? 92 : 60;
      let x = max ? (small ? 4 : 8) : Math.max(4, Math.min(w.x, innerWidth - 120));
      let y = max ? topInset : Math.max(topInset, Math.min(w.y, innerHeight - 120));
      let width = max ? innerWidth - (small ? 8 : 16) : Math.min(w.width, innerWidth - 8);
      let height = max ? innerHeight - topInset - bottomInset : Math.min(w.height, innerHeight - y - bottomInset);
      if (overview) {
        const columns = innerWidth < 700 ? 1 : sorted.length > 4 ? 3 : 2;
        const cellWidth = (innerWidth - 80) / columns, cellHeight = Math.min(280, (innerHeight - 200) / Math.max(1, Math.ceil(sorted.length / columns)));
        width = Math.max(w.width, 600); height = Math.max(w.height, 420);
        const scale = Math.min((cellWidth - 30) / width, (cellHeight - 28) / height);
        x = 40 + (index % columns) * cellWidth + (cellWidth - width * scale) / 2; y = 90 + Math.floor(index / columns) * cellHeight;
        frame.style.transform = `scale(${Math.max(.15, scale)})`;
      } else frame.style.transform = "";
      Object.assign(frame.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${Math.max(160, height)}px` });
      frame.querySelector(".maximize-control").setAttribute("aria-label", w.maximized ? "还原窗口" : "最大化窗口");
    });
    for (const item of pinned.querySelectorAll("[data-dock]")) {
      const wins = state.windows.filter(w => w.app.id === item.dataset.dock);
      item.classList.toggle("is-running", wins.length > 0);
      item.classList.toggle("is-active", wins.some(w => w.z === top && w.mode === "open"));
    }
    q(".active-app").textContent = mac ? (findApp(sorted.find(w => w.z === top)?.app.id)?.label || text("桌面", "Desktop")) : text("桌面", "Desktop");
    const signature = state.windows.map(w => `${w.id}:${w.mode}`).join();
    if (signature !== windowSignature && (panel === "launcher" || panel === "search")) renderSearch();
    windowSignature = signature;
  }
  function beginDrag(event, id, resizing) {
    if (event.button !== 0 || overview || (!resizing && event.target.closest("button"))) return;
    const w = findWindow(id); if (!w || (resizing && w.maximized)) return;
    event.preventDefault(); event.stopPropagation(); host.focus(id); closePanel();
    const target = event.currentTarget; target.setPointerCapture(event.pointerId);
    let origin = { ...w };
    let moved = false;
    currentDrag = { id, resizing, x: event.clientX, y: event.clientY, origin, pending: null, frame: 0 };
    frames.get(id).classList.add("is-dragging");
    let snapSide = "";
    const move = e => {
      if (!currentDrag || e.pointerId !== event.pointerId) return;
      const dx = e.clientX - currentDrag.x, dy = e.clientY - currentDrag.y;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      if (!moved && w.maximized && !resizing) origin = { ...w, x: Math.max(8, currentDrag.x - Math.min(w.width, innerWidth - 16) * currentDrag.x / innerWidth), y: mac ? 36 : 8, maximized: false };
      moved = true;
      if (resizing) {
        const top = mac ? 34 : 4, bottom = innerHeight - (mac ? 92 : 60);
        let left = origin.x, right = origin.x + origin.width, y = origin.y, end = origin.y + origin.height;
        if (resizing.includes("w")) left = Math.max(4, Math.min(right - 320, origin.x + dx));
        if (resizing.includes("e")) right = Math.max(left + 320, Math.min(innerWidth - 4, right + dx));
        if (resizing.includes("n")) y = Math.max(top, Math.min(end - 220, origin.y + dy));
        if (resizing.includes("s")) end = Math.max(y + 220, Math.min(bottom, end + dy));
        currentDrag.pending = { x: left, y, width: right - left, height: end - y, tiled: false };
      } else currentDrag.pending = { x: Math.max(4, Math.min(innerWidth - 120, origin.x + dx)), y: Math.max(mac ? 34 : 4, Math.min(innerHeight - 110, origin.y + dy)), maximized: false, tiled: false };
      if (!currentDrag.frame) currentDrag.frame = requestAnimationFrame(() => { if (!currentDrag) return; currentDrag.frame = 0; host.patch(id, currentDrag.pending); });
      snapSide = !resizing && innerWidth >= 640 ? e.clientX < 28 ? "left" : e.clientX > innerWidth - 28 ? "right" : e.clientY < (mac ? 40 : 12) ? "fill" : "" : "";
      const preview = q(".snap-preview"); preview.hidden = !snapSide; preview.dataset.side = snapSide;
    };
    const finish = e => {
      if (e.pointerId !== event.pointerId) return;
      if (currentDrag?.frame) cancelAnimationFrame(currentDrag.frame);
      if (currentDrag?.pending) host.patch(id, currentDrag.pending);
      if (e.type === "pointerup" && snapSide) snap(id, snapSide);
      currentDrag = null; frames.get(id)?.classList.remove("is-dragging"); q(".snap-preview").hidden = true;
      target.removeEventListener("pointermove", move); target.removeEventListener("pointerup", finish); target.removeEventListener("pointercancel", finish);
    };
    target.addEventListener("pointermove", move, { signal }); target.addEventListener("pointerup", finish, { signal }); target.addEventListener("pointercancel", finish, { signal });
  }
  listen(root, "click", event => {
    const target = event.target.closest?.("button");
    if (!target) { if (!event.target.closest?.(".shell-panel,.shell-window")) { closePanel(); desktopSelection = ""; for (const item of icons.children) item.classList.remove("is-selected"); } return; }
    const appId = target.dataset.open;
    if (appId) { openApp(appId); return; }
    if (target.dataset.dock) {
      const existing = [...state.windows].sort((a, b) => b.z - a.z).find(w => w.app.id === target.dataset.dock);
      if (existing) { if (!mac && existing.mode === "open" && frames.get(existing.id)?.classList.contains("is-active")) host.patch(existing.id, { mode: "minimized" }); else host.focus(existing.id); closePanel(); }
      else openApp(target.dataset.dock);
      return;
    }
    if (target.dataset.app) {
      if (performance.now() < suppressIconClickUntil) return;
      desktopSelection = target.dataset.app;
      for (const item of icons.children) item.classList.toggle("is-selected", item.dataset.app === desktopSelection);
      closePanel(); if (event.pointerType === "touch") openApp(desktopSelection); return;
    }
    if (target.dataset.toggle) {
      const key = target.dataset.toggle; const current = ["glass", "motion"].includes(key) ? preferences[key] !== false : preferences[key] === true;
      save({ [key]: !current }); const currentPanel = panel; closePanel(); activatePanel(currentPanel); return;
    }
    if (target.dataset.accent) { save({ accent: target.dataset.accent }); return; }
    if (target.dataset.snap) { snap(target.dataset.id, target.dataset.snap); closePanel(); return; }
    const action = target.dataset.action;
    if (!action) return;
    if (action.startsWith("workspace:")) { closePanel(); host.workspace(action.slice(10)); return; }
    if (action.startsWith("focus:")) { overview = false; host.focus(action.slice(6)); closePanel(); syncWindows(); return; }
    const windowId = target.closest("[data-window]")?.dataset.window;
    const actions = {
      "close-window": () => host.close(windowId),
      "minimize-window": () => host.patch(windowId, { mode: "minimized" }),
      "maximize-window": () => snap(windowId, "fill"),
      "external-window": () => host.external(findWindow(windowId)?.app.id),
      "snap-window": () => showSnap(windowId, target),
      "window-menu": () => windowMenu(windowId, target.getBoundingClientRect().left, target.getBoundingClientRect().bottom),
      "packages": () => { closePanel(); host.managePackages(); },
      "add": () => { closePanel(); host.addApp(); },
      "arrange": () => { closePanel(); save({ positions: {} }); host.arrangeApps(); },
      "settings": openSettings,
      "wallpaper": () => { closePanel(); host.wallpaper(); },
      "dismiss": closePanel,
      "overview": () => { closePanel(); overview = !overview; syncWindows(); },
      "desktop": () => { closePanel(); const visible = state.windows.filter(w => w.mode === "open"); if (visible.length) { desktopHiddenIds = visible.map(w => w.id); for (const id of desktopHiddenIds) host.patch(id, { mode: "minimized" }); } else { for (const id of desktopHiddenIds) host.patch(id, { mode: "open" }); desktopHiddenIds = []; } },
      "all-apps": () => { q(".launcher-apps").classList.toggle("list-view"); target.setAttribute("aria-pressed", String(q(".launcher-apps").classList.contains("list-view"))); },
      "shortcuts": () => { closePanel(); toast(text("Ctrl / ⌘ + Space 搜索 · Ctrl / ⌘ + Alt + ←/→ 分屏 · Esc 关闭菜单", "Ctrl / ⌘ + Space: search · Ctrl / ⌘ + Alt + arrows: snap · Esc: close menu")); },
    };
    if (actions[action]) actions[action](); else activatePanel(action, target);
  });
  listen(icons, "dblclick", event => { const app = event.target.closest("[data-app]"); if (app) openApp(app.dataset.app); });
  listen(icons, "keydown", event => { const app = event.target.closest("[data-app]"); if (app && event.key === "Enter") openApp(app.dataset.app); });
  function contextMenu(title, entries, x, y) {
    closePanel(); panel = "context";
    const node = document.createElement("section"); node.className = "shell-panel context-popover"; node.setAttribute("aria-label", title);
    for (const [label, glyphName, action, disabled] of entries) {
      if (!label) { node.append(document.createElement("hr")); continue; }
      const item = document.createElement("button"); item.innerHTML = `${svg(glyphName)}<span>${escape(label)}</span>`; item.disabled = disabled === true;
      listen(item, "click", event => { event.stopPropagation(); closePanel(); action(); }); node.append(item);
    }
    panels.append(node);
    Object.assign(node.style, { left: `${Math.max(8, Math.min(x, innerWidth - node.offsetWidth - 8))}px`, top: `${Math.max(mac ? 34 : 8, Math.min(y, innerHeight - node.offsetHeight - 8))}px` });
  }
  function windowMenu(id, x, y) {
    const w = findWindow(id); if (!w) return;
    contextMenu("窗口菜单", [
      ["还原", "restore", () => host.patch(id, { maximized: false, mode: "open" }), !w.maximized && w.mode === "open"],
      ["最小化", "minus", () => host.patch(id, { mode: "minimized" })],
      ["最大化", "maximize", () => host.patch(id, { maximized: true }), w.maximized],
      ["靠左分屏", "left", () => snap(id, "left")], ["靠右分屏", "right", () => snap(id, "right")], [""],
      ["关闭", "close", () => host.close(id)],
    ], x, y);
  }
  listen(root, "contextmenu", event => {
    if (event.target.closest?.(".shell-window-body")) { event.stopPropagation(); return; }
    event.preventDefault(); event.stopPropagation();
    const frame = event.target.closest?.(".shell-titlebar");
    if (frame) { windowMenu(frame.closest("[data-window]").dataset.window, event.clientX, event.clientY); return; }
    const item = event.target.closest?.("[data-app],[data-dock],[data-open]"); const app = item ? findApp(item.dataset.app || item.dataset.dock || item.dataset.open) : null;
    const entries = [];
    if (app) {
      const wins = state.windows.filter(w => w.app.id === app.id);
      entries.push(["打开", "browser", () => openApp(app.id)]);
      if (app.url) entries.push(["在浏览器中打开", "external", () => host.external(app.id)]);
      entries.push([pinnedIds().includes(app.id) ? (mac ? "从 Dock 移除" : "从任务栏取消固定") : (mac ? "保留在 Dock 中" : "固定到任务栏"), "view", () => save({ pinnedApps: pinnedIds().includes(app.id) ? pinnedIds().filter(id => id !== app.id) : [...pinnedIds(), app.id] })]);
      for (const w of wins) entries.push([w.mode === "minimized" ? "显示窗口" : "前往窗口", "browser", () => host.focus(w.id)]);
      if (wins.length) entries.push(["关闭所有窗口", "close", () => wins.forEach(w => host.close(w.id))]);
      if (app.source === "user") entries.push([""], ["编辑快捷方式", "settings", () => host.editApp(app.id)], ["移除快捷方式", "trash", () => host.removeApp(app.id)]);
    } else if (event.target.closest?.(".taskbar")) {
      entries.push(["系统设置", "settings", openSettings], ["显示所有窗口", "view", () => { overview = true; syncWindows(); }], ["桌面系统", "palette", host.managePackages]);
    } else {
      entries.push(["所有应用", "grid", () => activatePanel("launcher")], ["分组与整理", "folder", () => host.workspace("organize")], ["添加应用", "plus", host.addApp], ["整理图标", "refresh", () => { save({ positions: {} }); host.arrangeApps(); }], [""], ["更换壁纸", "palette", host.wallpaper], ["个性化桌面", "palette", host.managePackages], ["系统设置", "settings", openSettings], ["外观与特效", "sliders", () => activatePanel("controls")]);
    }
    contextMenu(app ? "应用右键菜单" : "桌面右键菜单", entries, event.clientX, event.clientY);
  });
  // Slotted application events do not bubble through the shell's own tree.
  listen(document, "pointerdown", event => {
    if (!panel || event.button !== 0) return;
    const path = event.composedPath();
    if (!path.includes(panels) && !path.some(node => node instanceof Element && node.matches(".taskbar,.menu-bar"))) closePanel();
  }, { capture: true });
  if (mac) listen(q(".menu-bar"), "pointerover", event => {
    const item = event.target.closest("button[data-action]");
    if (item && ["menu", "file", "view", "windows", "help"].includes(panel) && ["menu", "file", "view", "windows", "help"].includes(item.dataset.action) && item.dataset.action !== panel) activatePanel(item.dataset.action, item);
  });
  listen(document, "keydown", event => {
    if (event.isComposing || event.defaultPrevented || event.composedPath().some(node => node instanceof Element && node.matches('[role="dialog"]'))) return;
    if (event.key === "Escape") { closePanel(); overview = false; syncWindows(); }
    if ((event.ctrlKey || event.metaKey) && event.code === "Space") { event.preventDefault(); activatePanel("search"); }
    const active = [...state.windows].filter(w => w.mode === "open").sort((a, b) => b.z - a.z)[0];
    if (active && (event.ctrlKey || event.metaKey) && event.altKey && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault(); if (event.key === "ArrowDown") host.patch(active.id, { mode: "minimized" }); else snap(active.id, event.key === "ArrowLeft" ? "left" : event.key === "ArrowRight" ? "right" : "fill");
    }
    if (event.key === "Tab" && panel) {
      const focusable = [...panels.querySelectorAll("button:not(:disabled),input,a")];
      const index = focusable.indexOf(root.activeElement);
      if (focusable.length && (index < 0 || (!event.shiftKey && index === focusable.length - 1) || (event.shiftKey && index === 0))) { event.preventDefault(); focusable[event.shiftKey ? focusable.length - 1 : 0].focus(); }
    }
  });
  if (mac) {
    listen(q(".taskbar-center"), "pointermove", event => {
      if (state.reducedMotion || preferences.motion === false || event.pointerType === "touch") return;
      const items = q(".taskbar-center").querySelectorAll("button");
      for (const item of items) { const bounds = item.getBoundingClientRect(); const distance = Math.abs(event.clientX - (bounds.left + bounds.width / 2)); item.style.setProperty("--dock-scale", String(1 + Math.max(0, 1 - distance / 130) * .38)); }
    });
    listen(q(".taskbar-center"), "pointerleave", () => q(".taskbar-center").querySelectorAll("button").forEach(n => n.style.setProperty("--dock-scale", "1")));
  }
  const canvas = q(".effect-canvas"), ctx = canvas.getContext("2d");
  const particles = Array.from({ length: 44 }, (_, i) => ({ x: ((i * 137.5) % 1000) / 1000, y: ((i * 73.7) % 1000) / 1000, r: .6 + i % 3 * .4 }));
  let effectFrame = 0;
  const draw = time => {
    effectFrame = 0;
    if (!ctx || document.hidden || preferences.particles !== true || state.reducedMotion || preferences.motion === false) return;
    effectFrame = requestAnimationFrame(draw);
    if (canvas.width !== innerWidth || canvas.height !== innerHeight) { canvas.width = innerWidth; canvas.height = innerHeight; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) { const x = (p.x * canvas.width + Math.sin(time / 7000 + p.y * 20) * 24); const y = (p.y * canvas.height - time / 55 * p.r) % canvas.height; ctx.beginPath(); ctx.arc(x, (y + canvas.height) % canvas.height, p.r, 0, Math.PI * 2); ctx.fillStyle = `rgba(255,255,255,${.18 + p.r / 5})`; ctx.fill(); }
  };
  function updateEffects() {
    if (!effectFrame && !document.hidden && preferences.particles === true && !state.reducedMotion && preferences.motion !== false) effectFrame = requestAnimationFrame(draw);
    if (effectFrame && (document.hidden || preferences.particles !== true || state.reducedMotion || preferences.motion === false)) { cancelAnimationFrame(effectFrame); effectFrame = 0; }
  }
  listen(document, "visibilitychange", () => { shell.classList.toggle("effects-paused", document.hidden); updateEffects(); });
  listen(root, "error", event => { if (event.target instanceof HTMLImageElement && event.target.parentElement?.classList.contains("app-glyph")) { event.target.parentElement.classList.remove("has-image"); event.target.parentElement.innerHTML = svg("browser"); }; }, { capture: true });
  listen(window, "resize", () => { syncWindows(); layoutIcons(); });
  const unsubscribe = host.subscribe(next => {
    state = systemSnapshot(next);
    if (lastPrefRevision !== state.preferences.revision) { lastPrefRevision = state.preferences.revision; preferences = { ...state.preferences.values }; }
    applyPreferences(); syncApps(); syncWindows();
    root.querySelectorAll('[data-action="connection"]').forEach(n => { n.classList.toggle("service-unavailable", state.localService === "unavailable"); n.title = state.localService === "unavailable" ? text("应用管理器未连接", "App manager unavailable") : text("连接状态", "Connection status"); });
    const now = new Date();
    q(".menu-clock").textContent = new Intl.DateTimeFormat(state.locale, { month: "short", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" }).format(now);
    q(".tray-clock").innerHTML = `<span>${new Intl.DateTimeFormat(state.locale, { hour: "2-digit", minute: "2-digit" }).format(now)}</span><small>${new Intl.DateTimeFormat(state.locale, { year: "numeric", month: "2-digit", day: "2-digit" }).format(now)}</small>`;
  });
  return () => { unsubscribe(); cancelAnimationFrame(effectFrame); if (currentDrag?.frame) cancelAnimationFrame(currentDrag.frame); clearTimeout(toastTimer); for (const frame of frames.values()) frame.remove(); frames.clear(); };
}
