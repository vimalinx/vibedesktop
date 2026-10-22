/* vibedesktop.online: the web preview of Vibe Desktop. Top bar, icons, dock,
   search, scenes and keyboard shortcuts; windows live in wm.js. */
import { emit, glyph, h, on, reducedMotion, store } from "./util.js";
import { lang, pick, setLang, t } from "./i18n.js";
import { SITES, buildRegistry, pinSite, pinnedSites } from "./apps.js";
import { initPet } from "./pet.js";
import { SECTIONS } from "./showcase.js";
import { STYLES, applyStyle, currentStyle, savedStyle, styleCard } from "./styles.js";
import { MOODS, nextWallpaper, setWallpaper, startWallpaper } from "./wallpaper.js";
import * as wm from "./wm.js";

const $ = (selector) => document.querySelector(selector);

const DESKTOP = ["showcase", "market", "install", "appearance", "ink", "garden", "poem", "catcher", "gallery", "browser", "developers", "github"];
const DOCK = ["showcase", "market", "ink", "poem", "catcher", "gallery", "browser", "install"];
const MENU_APPS = ["showcase", "market", "install", "appearance", "ink", "garden", "poem", "catcher", "gallery", "browser", "developers"];
const KEYWORDS = {
  welcome: "welcome about 欢迎 关于 vibe",
  showcase: "what it does demo features import market 它能做什么 演示 功能 导入",
  appearance: "appearance style theme wallpaper windows macos 外观 样式 主题 壁纸",
  poem: "poem lot fortune 诗签 抽签 古诗",
  catcher: "game port catcher play 端口接接乐 游戏",
  market: "app market store install apps 应用市场 商店 安装",
  install: "install download setup linux 安装 下载 命令",
  ink: "ink paint draw brush 墨染 画画 水墨 绘画",
  garden: "sound garden music 声之花园 音乐 声音",
  gallery: "web gallery sites 网页画廊 网站",
  browser: "browser url website 浏览器 网址",
  developers: "developers app.json author skill 开发者 作者 上架",
  github: "github source code 源码"
};

/* ----- Static text ----- */

for (const node of document.querySelectorAll("[data-i18n]")) node.textContent = t(node.dataset.i18n);
for (const node of document.querySelectorAll("[data-i18n-label]")) {
  node.setAttribute("aria-label", t(node.dataset.i18nLabel));
  node.title = t(node.dataset.i18nLabel);
}

/* ----- Toasts ----- */

const toastNode = $(".vd-toast");
const toastQueue = [];
let toastTimer = 0;

function toast(text) {
  toastQueue.push(text);
  if (!toastNode.classList.contains("is-shown")) showNextToast();
}

function showNextToast() {
  const text = toastQueue.shift();
  if (!text) {
    toastNode.classList.remove("is-shown");
    return;
  }
  toastNode.textContent = text;
  toastNode.classList.add("is-shown");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(showNextToast, 2800);
}

/* ----- Scenes ----- */

const scenes = {
  list() {
    const saved = store.get("scenes", []);
    return Array.isArray(saved) ? saved.filter((scene) => scene && typeof scene.name === "string" && Array.isArray(scene.items)) : [];
  },
  save(name) {
    const items = wm.sceneSnapshot();
    if (items.length === 0) {
      toast(t("scenes.nothing"));
      return false;
    }
    const list = scenes.list();
    const finalName = String(name || "").trim().slice(0, 40) || t("scenes.defaultName", { n: list.length + 1 });
    store.set("scenes", [{ name: finalName, items, at: Date.now() }, ...list.filter((scene) => scene.name !== finalName)].slice(0, 8));
    toast(t("scenes.saved", { name: finalName }));
    emit("scene:save", { name: finalName });
    emit("scene:change", {});
    return true;
  },
  restore(name) {
    const scene = scenes.list().find((item) => item.name === name);
    if (!scene) return;
    wm.applyScene(scene.items);
    toast(t("scenes.restored", { name }));
    emit("scene:restore", { name });
  },
  remove(name) {
    store.set("scenes", scenes.list().filter((scene) => scene.name !== name));
    emit("scene:change", {});
  }
};

/* ----- Apps ----- */

const ctx = {
  openApp: launch,
  closeApp: (appId) => wm.windowsOf(appId).forEach((win) => wm.closeWindow(win.id)),
  toast,
  on,
  scenes
};
const registry = buildRegistry(ctx);

function launch(appId, options) {
  const app = registry.get(appId);
  if (!app) return null;
  if (app.href) {
    window.open(app.href, "_blank", "noopener");
    return null;
  }
  return wm.openApp(appId, options);
}

const openInTab = (app) => window.open(app.site?.url || app.href, "_blank", "noopener,noreferrer");

/* ----- Desktop icons ----- */

const iconsNav = $(".vd-icons");

function renderIcons() {
  const ids = [...DESKTOP, ...pinnedSites().map((key) => `site:${key}`)];
  iconsNav.replaceChildren(...ids.filter((id) => registry.has(id)).map(iconButton));
}

function iconButton(id) {
  const app = registry.get(id);
  const button = h("button", { type: "button", class: "vd-icon", "data-app": id }, app.tileNode(), h("span", { class: "vd-icon-label", text: app.title() }));
  let timer = 0;
  button.addEventListener("click", () => {
    if (app.site) {
      clearTimeout(timer);
      timer = setTimeout(() => launch(id), 260);
    } else {
      launch(id);
    }
  });
  if (app.site) {
    button.addEventListener("dblclick", () => {
      clearTimeout(timer);
      openInTab(app);
    });
  }
  button.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    const items = [{ glyph: "windows", label: t("icon.open"), run: () => launch(id) }];
    if (app.site || app.href) items.push({ glyph: "external", label: t("icon.openTab"), run: () => openInTab(app) });
    if (app.site) {
      items.push("sep", { glyph: "trash", label: t("icon.remove"), run: () => { pinSite(app.site.key, false); toast(t("icon.removed", { name: app.title() })); } });
    }
    openMenu(button, items, { x: event.clientX, y: event.clientY });
  });
  return button;
}

/* ----- Dock ----- */

const dock = $(".vd-dock");
let dockKey = "";

function renderDock() {
  const windows = wm.listWindows();
  const running = new Set(windows.map((win) => win.appId));
  const extra = [...running].filter((id) => !DOCK.includes(id));
  const style = currentStyle();
  const key = [style, ...DOCK, "|", ...extra].join(",");
  if (key !== dockKey) {
    dockKey = key;
    const separator = extra.length ? [h("span", { class: "vd-dock-sep", "aria-hidden": "true" })] : [];
    const lead = style === "win" ? [
      h("button", { type: "button", class: "vd-dock-item vd-start-btn", "aria-label": t("start.label"), title: t("start.label"), "aria-haspopup": "dialog", onClick: (event) => toggleStart(event.currentTarget) }, h("img", { src: "/icon.svg", width: "30", height: "30", alt: "" })),
      h("button", { type: "button", class: "vd-dock-item vd-taskbar-search", "aria-label": t("menu.search"), title: t("menu.search"), onClick: openSearch }, glyph("search"))
    ] : [];
    dock.replaceChildren(...lead, ...DOCK.map(dockButton), ...separator, ...extra.map(dockButton));
  }
  const active = wm.activeWindow()?.appId;
  for (const button of dock.querySelectorAll("[data-app]")) {
    const id = button.dataset.app;
    button.classList.toggle("is-running", running.has(id));
    button.classList.toggle("is-active", id === active);
  }
}

function dockButton(id) {
  const app = registry.get(id);
  const button = h("button", { type: "button", class: "vd-dock-item", "data-app": id, "aria-label": app.title(), title: app.title() },
    app.tileNode(), h("span", { class: "vd-dock-dot", "aria-hidden": "true" }));
  button.addEventListener("click", () => {
    const [win] = wm.windowsOf(id);
    if (!win) launch(id);
    else if (win.minimized) wm.restoreWindow(win.id);
    else if (wm.activeWindow()?.id === win.id) wm.minimizeWindow(win.id);
    else wm.focusWindow(win.id);
  });
  return button;
}

/* ----- Menus ----- */

let menu = null;
let menuAnchor = null;

function closeMenu() {
  if (!menu) return;
  menu.remove();
  menu = null;
  menuAnchor?.setAttribute("aria-expanded", "false");
  removeEventListener("pointerdown", outsideMenu, true);
}

function outsideMenu(event) {
  if (menu && !menu.contains(event.target) && !menuAnchor?.contains(event.target)) closeMenu();
}

function openMenu(anchor, items, point) {
  const reopen = menu && menuAnchor === anchor && !point;
  closeMenu();
  if (reopen) return;
  menuAnchor = anchor;
  menu = h("div", { class: "vd-menu", role: "menu" });
  for (const item of items) {
    if (item === "sep") menu.append(h("hr"));
    else if (item instanceof Node) menu.append(item);
    else {
      menu.append(h("button", {
        type: "button",
        role: "menuitem",
        class: "vd-menu-item",
        disabled: item.disabled,
        onClick: () => {
          closeMenu();
          item.run?.();
        }
      }, item.glyph ? glyph(item.glyph) : h("span", { class: "glyph" }), h("span", { text: item.label }), item.hint ? h("small", { text: item.hint }) : null));
    }
  }
  document.body.append(menu);
  const rect = anchor.getBoundingClientRect();
  const box = menu.getBoundingClientRect();
  const hiddenAnchor = !point && rect.width === 0 && rect.height === 0;
  const x = point ? point.x : hiddenAnchor ? (innerWidth - box.width) / 2 : rect.left;
  const y = point ? point.y : hiddenAnchor ? innerHeight - wm.getInsets().bottom - box.height - 8 : rect.bottom + 6;
  menu.style.left = `${Math.max(8, Math.min(x, innerWidth - box.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, innerHeight - box.height - 8))}px`;
  anchor.setAttribute("aria-expanded", "true");
  addEventListener("pointerdown", outsideMenu, true);
  menu.addEventListener("keydown", (event) => {
    const buttons = [...menu.querySelectorAll("button:not([disabled]), input")];
    const index = buttons.indexOf(document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      const back = menuAnchor;
      closeMenu();
      back?.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
  });
  (menu.querySelector("input, button:not([disabled])"))?.focus();
}

function appsMenu(anchor) {
  openMenu(anchor, [
    ...MENU_APPS.map((id) => ({ glyph: registry.get(id).glyph, label: registry.get(id).title(), run: () => launch(id) })),
    "sep",
    { glyph: "branch", label: "GitHub", hint: "↗", run: () => launch("github") },
    { glyph: "info", label: t("menu.about"), run: () => launch("welcome") }
  ]);
}

function windowsMenu(anchor = $("[data-menu=windows]")) {
  const windows = wm.listWindows();
  openMenu(anchor, [
    ...(windows.length
      ? windows.slice().reverse().map((win) => ({
        glyph: registry.get(win.appId)?.glyph,
        label: win.el.querySelector(".vd-win-title")?.textContent || win.appId,
        hint: win.minimized ? t("windows.minimized") : undefined,
        run: () => (win.minimized ? wm.restoreWindow(win.id) : wm.focusWindow(win.id))
      }))
      : [{ label: t("windows.none"), disabled: true }]),
    "sep",
    { glyph: "grid", label: t("windows.tile"), hint: "", disabled: windows.length === 0, run: () => wm.tileAll() },
    { glyph: "minimize", label: t("windows.minimizeAll"), disabled: windows.length === 0, run: () => wm.minimizeAll() }
  ]);
}

function scenesMenu(anchor) {
  const input = h("input", { class: "vd-menu-input", placeholder: t("scenes.placeholder"), "aria-label": t("scenes.placeholder"), maxlength: "40" });
  const form = h("form", { class: "vd-menu-form" }, input, h("button", { type: "submit", class: "button primary", text: t("scenes.save") }));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (scenes.save(input.value)) closeMenu();
  });
  const list = scenes.list();
  const rows = list.length
    ? list.map((scene) => h("div", { class: "vd-menu-scene" },
      h("button", { type: "button", role: "menuitem", class: "vd-menu-item", onClick: () => { closeMenu(); scenes.restore(scene.name); } },
        glyph("layers"), h("span", { text: scene.name }), h("small", { text: t("scenes.count", { n: scene.items.length }) })),
      h("button", { type: "button", class: "vd-menu-delete", "aria-label": t("scenes.delete", { name: scene.name }), title: t("scenes.delete", { name: scene.name }), onClick: () => { scenes.remove(scene.name); closeMenu(); scenesMenu(anchor); } }, glyph("close"))))
    : [h("p", { class: "vd-menu-empty", text: t("scenes.empty") })];
  openMenu(anchor, [h("p", { class: "vd-menu-title", text: t("scenes.title") }), form, "sep", ...rows]);
}

function brandMenu(anchor) {
  openMenu(anchor, [
    { glyph: "info", label: t("menu.about"), run: () => launch("welcome") },
    { glyph: "star", label: t("app.showcase"), run: () => launch("showcase") },
    { glyph: "image", label: t("app.appearance"), run: () => launch("appearance") },
    { glyph: "download", label: t("app.install"), run: () => launch("install") },
    "sep",
    { glyph: "branch", label: "GitHub", hint: "↗", run: () => launch("github") }
  ]);
}

/* ----- Search (Ctrl/⌘ K) ----- */

let search = null;

function searchItems() {
  const apps = [...MENU_APPS, "github", "welcome"].map((id) => ({
    kind: t("search.app"), label: registry.get(id).title(), node: () => registry.get(id).tileNode(), keys: KEYWORDS[id] || "", run: () => launch(id)
  }));
  const sites = SITES.map((site) => ({
    kind: t("search.site"), label: pick(site.name), node: () => registry.get(`site:${site.key}`).tileNode(),
    keys: `${site.name.zh} ${site.name.en} ${site.blurb.zh} ${site.blurb.en} ${new URL(site.url).hostname}`, run: () => launch(`site:${site.key}`)
  }));
  const sections = SECTIONS.map((section) => ({
    kind: t("app.showcase"), label: `${pick(section.tab)} · ${pick(section.title)}`, node: () => registry.get("showcase").tileNode(),
    keys: `${section.tab.zh} ${section.tab.en} ${section.title.zh} ${section.title.en}`, run: () => launch("showcase", { params: { section: section.id } })
  }));
  const styles = STYLES.map((style) => ({
    kind: t("search.command"), label: `${t("appearance.style")}：${pick(style.name)}`, node: () => registry.get("appearance").tileNode(),
    keys: `style 样式 ${style.name.zh} ${style.name.en}`, run: () => applyStyle(style.id)
  }));
  const commands = [
    { kind: t("search.command"), label: t("command.tile"), keys: "tile split 平铺 分屏", run: () => wm.tileAll() },
    { kind: t("search.command"), label: t("command.saveScene"), keys: "scene save 场景 保存", run: () => scenes.save() },
    ...MOODS.map((mood) => ({ kind: t("search.command"), label: t("command.wallpaper", { name: t(`wallpaper.${mood}`) }), keys: `wallpaper 壁纸 ${mood}`, run: () => setWallpaper(mood) })),
    { kind: t("search.command"), label: t("command.lang"), keys: "language english chinese 语言 中文 英文", run: () => setLang(lang === "zh" ? "en" : "zh") }
  ];
  return [...apps, ...sections, ...sites, ...styles, ...commands];
}

function openSearch() {
  if (search) {
    search.input.focus();
    return;
  }
  closeMenu();
  const all = searchItems();
  const input = h("input", { class: "vd-search-input", type: "search", placeholder: t("search.placeholder"), "aria-label": t("search.placeholder"), autocomplete: "off", spellcheck: "false", role: "combobox", "aria-expanded": "true", "aria-controls": "vd-search-list" });
  const list = h("div", { class: "vd-search-list", id: "vd-search-list", role: "listbox" });
  const panel = h("div", { class: "vd-search", role: "dialog", "aria-modal": "true", "aria-label": t("menu.search") },
    h("div", { class: "vd-search-field" }, glyph("search"), input, h("kbd", { text: "Esc" })),
    list,
    h("p", { class: "vd-search-hint", text: t("search.hint") }));
  const backdrop = h("div", { class: "vd-search-backdrop" }, panel);
  backdrop.addEventListener("pointerdown", (event) => { if (event.target === backdrop) closeSearch(); });
  let results = [];
  let selected = 0;
  const render = () => {
    const query = input.value.trim().toLowerCase();
    results = query
      ? all.map((item) => {
        const label = item.label.toLowerCase();
        const score = label.startsWith(query) ? 0 : label.includes(query) ? 1 : item.keys.toLowerCase().includes(query) ? 2 : 9;
        return { item, score };
      }).filter((entry) => entry.score < 9).sort((a, b) => a.score - b.score).map((entry) => entry.item).slice(0, 9)
      : all.slice(0, 9);
    selected = Math.min(selected, Math.max(0, results.length - 1));
    list.replaceChildren(...(results.length
      ? results.map((item, index) => h("button", {
        type: "button",
        role: "option",
        id: `vd-search-${index}`,
        class: "vd-search-item",
        "aria-selected": String(index === selected),
        onClick: () => run(item),
        onPointermove: () => { if (selected !== index) { selected = index; render(); } }
      }, item.node ? item.node() : glyph("sparkle"), h("span", { text: item.label }), h("small", { text: item.kind })))
      : [h("p", { class: "vd-search-empty", text: t("search.empty") })]));
    input.setAttribute("aria-activedescendant", results.length ? `vd-search-${selected}` : "");
  };
  const run = (item) => {
    closeSearch();
    item.run();
    emit("search:launch", {});
  };
  input.addEventListener("input", () => {
    selected = 0;
    render();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSearch();
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (results[selected]) run(results[selected]);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Tab") {
      event.preventDefault();
      const step = event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey) ? -1 : 1;
      selected = (selected + step + results.length) % Math.max(1, results.length);
      render();
      list.children[selected]?.scrollIntoView({ block: "nearest" });
    }
  });
  document.body.append(backdrop);
  search = { backdrop, input, restore: document.activeElement };
  render();
  input.focus();
}

function closeSearch() {
  if (!search) return;
  search.backdrop.remove();
  const back = search.restore;
  search = null;
  if (back instanceof HTMLElement) back.focus({ preventScroll: true });
}

/* ----- Top bar ----- */

$("[data-menu=brand]").addEventListener("click", (event) => brandMenu(event.currentTarget));
$("[data-menu=apps]").addEventListener("click", (event) => appsMenu(event.currentTarget));
$("[data-menu=windows]").addEventListener("click", (event) => windowsMenu(event.currentTarget));
$("[data-menu=scenes]").addEventListener("click", (event) => scenesMenu(event.currentTarget));
$("[data-action=search]").addEventListener("click", openSearch);
$("[data-action=wallpaper]").addEventListener("click", () => {
  const mood = nextWallpaper();
  toast(t("command.wallpaper", { name: t(`wallpaper.${mood}`) }));
});
$("[data-action=lang]").addEventListener("click", () => setLang(lang === "zh" ? "en" : "zh"));
$("[data-search-key]").textContent = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘K" : "Ctrl K";

const clock = $(".vd-clock");
const tray = h("div", { class: "vd-tray" },
  h("button", { type: "button", class: "vd-tray-btn", text: t("menu.lang"), "aria-label": t("menu.langLabel"), title: t("menu.langLabel"), onClick: () => setLang(lang === "zh" ? "en" : "zh") }),
  h("button", { type: "button", class: "vd-tray-btn", "aria-label": t("menu.wallpaper"), title: t("menu.wallpaper"), onClick: () => $("[data-action=wallpaper]").click() }, glyph("image")),
  h("time", { class: "vd-tray-clock" }));
document.body.append(tray);
function tickClock() {
  const now = new Date();
  const locale = lang === "zh" ? "zh-CN" : "en";
  clock.dateTime = now.toISOString();
  clock.textContent = now.toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const trayClock = tray.querySelector("time");
  trayClock.dateTime = now.toISOString();
  trayClock.replaceChildren(h("span", { text: now.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) }), h("span", { text: now.toLocaleDateString(locale) }));
}
tickClock();
setInterval(tickClock, 20000);

/* ----- Start menu (Windows style) ----- */

let startPanel = null;

function closeStart() {
  startPanel?.remove();
  startPanel = null;
  removeEventListener("pointerdown", outsideStart, true);
}

function outsideStart(event) {
  if (startPanel && !startPanel.contains(event.target) && !event.target.closest?.(".vd-start-btn")) closeStart();
}

function toggleStart() {
  if (startPanel) {
    closeStart();
    return;
  }
  closeMenu();
  const run = (fn) => () => {
    closeStart();
    fn();
  };
  const pinned = MENU_APPS.map((id) => h("button", { type: "button", class: "vd-start-app", onClick: run(() => launch(id)) }, registry.get(id).tileNode(), h("span", { text: registry.get(id).title() })));
  const sceneList = scenes.list();
  startPanel = h("div", { class: "vd-start", role: "dialog", "aria-label": t("start.label") },
    h("button", { type: "button", class: "vd-start-search", onClick: run(openSearch) }, glyph("search"), h("span", { text: t("start.search") })),
    h("p", { class: "vd-start-heading", text: t("start.pinned") }),
    h("div", { class: "vd-start-grid" }, pinned),
    h("p", { class: "vd-start-heading", text: t("start.scenes") }),
    h("div", { class: "vd-start-scenes" },
      sceneList.length
        ? sceneList.map((scene) => h("button", { type: "button", class: "chip", onClick: run(() => scenes.restore(scene.name)) }, glyph("layers"), scene.name))
        : h("p", { class: "vd-menu-empty", text: t("start.noScenes") }),
      h("button", { type: "button", class: "chip", onClick: run(() => scenes.save()) }, glyph("save"), t("command.saveScene"))),
    h("div", { class: "vd-start-foot" },
      h("span", { class: "vd-start-user" }, h("img", { src: "/icon.svg", width: "28", height: "28", alt: "" }), h("span", { text: `Vibe Desktop · ${t("demo.badge")}` })),
      h("button", { type: "button", class: "vd-start-power", onClick: run(() => launch("appearance")), title: t("start.appearance"), "aria-label": t("start.appearance") }, glyph("image")),
      h("button", { type: "button", class: "vd-start-power", onClick: run(() => launch("github")), title: "GitHub", "aria-label": "GitHub" }, glyph("branch"))));
  startPanel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeStart();
      dock.querySelector(".vd-start-btn")?.focus();
    }
  });
  document.body.append(startPanel);
  addEventListener("pointerdown", outsideStart, true);
  startPanel.querySelector("button")?.focus();
}

/* ----- First visit: pick a desktop ----- */

function onboard() {
  let choice = currentStyle();
  const cards = h("div", { class: "style-grid", role: "radiogroup", "aria-label": t("appearance.style") });
  const renderCards = () => cards.replaceChildren(...STYLES.map((style) => styleCard(style, style.id === choice, (id) => {
    choice = id;
    applyStyle(id, { persist: false });
    renderCards();
  })));
  renderCards();
  const go = h("button", { type: "button", class: "button primary" }, t("onboard.go"), " →");
  const panel = h("div", { class: "vd-onboard", role: "dialog", "aria-modal": "true", "aria-labelledby": "vd-onboard-title" },
    h("div", { class: "vd-onboard-card" },
      h("p", { class: "eyebrow" }, h("span"), "VIBE DESKTOP"),
      h("h2", { class: "vd-onboard-title", id: "vd-onboard-title", text: t("onboard.title") }),
      h("p", { class: "vd-onboard-lead", text: t("onboard.lead") }),
      cards,
      h("div", { class: "vd-onboard-actions" }, go, h("small", { text: t("onboard.later") }))));
  go.addEventListener("click", () => {
    applyStyle(choice);
    panel.classList.add("is-leaving");
    setTimeout(() => panel.remove(), reducedMotion.matches ? 0 : 420);
    launch("welcome");
  });
  document.body.append(panel);
  requestAnimationFrame(() => cards.querySelector("[aria-checked=true]")?.focus({ preventScroll: true }));
}

addEventListener("keydown", (event) => {
  const mod = event.ctrlKey || event.metaKey;
  if (mod && !event.altKey && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (search) closeSearch();
    else openSearch();
    return;
  }
  if (event.altKey && !mod) {
    if (event.code === "KeyW") {
      event.preventDefault();
      windowsMenu();
    } else if (event.code === "Backquote") {
      event.preventDefault();
      wm.cycleWindows();
    } else if (event.code === "KeyX" && event.shiftKey) {
      event.preventDefault();
      const active = wm.activeWindow();
      if (active) wm.closeWindow(active.id);
    }
  }
});

/* Pages shown inside windows (/apps, /developers) ask the desktop to navigate. */
addEventListener("message", (event) => {
  if (event.origin !== location.origin || event.data?.type !== "vd:navigate") return;
  const path = String(event.data.path || "");
  if (path.startsWith("/apps")) launch("market");
  else if (path.startsWith("/developers")) launch("developers");
  else if (path.includes("install")) launch("install");
  else launch("welcome");
});

/* ----- Start ----- */

startWallpaper($(".vd-wallpaper"));
wm.initWindows(registry, $(".vd-windows"), renderDock);
const firstVisit = savedStyle() === null;
applyStyle(savedStyle() || "vibe", { withWallpaper: false, persist: false });
renderIcons();
renderDock();
initPet();
on("desktop:changed", renderIcons);
on("style:change", () => {
  closeStart();
  renderDock();
});

const params = new URLSearchParams(location.search);
const restored = params.has("safe") ? false : wm.restoreLayout();
const ROUTES = { install: "install", showcase: "showcase", market: "market", apps: "market", developers: "developers", appearance: "appearance", poem: "poem", catcher: "catcher", welcome: "welcome" };
const route = ROUTES[params.get("open") || location.hash.slice(1)];
if (route) launch(route, params.get("section") ? { params: { section: params.get("section") } } : undefined);
else if (firstVisit) onboard();
else if (!restored) launch("welcome");
if (location.hash || params.has("open")) history.replaceState(null, "", location.pathname);

const boot = $(".vd-boot");
let seenBoot = false;
try {
  seenBoot = sessionStorage.getItem("vd.booted") === "1";
  sessionStorage.setItem("vd.booted", "1");
} catch {
  /* storage blocked: play the intro */
}
if (seenBoot || reducedMotion.matches) boot?.remove();
else if (boot) {
  setTimeout(() => {
    boot.classList.add("is-done");
    setTimeout(() => boot.remove(), 700);
  }, 1500);
}
document.body.classList.add("is-ready");
