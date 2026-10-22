/* Window manager: open, focus, drag, resize, edge-snap, minimize, maximize,
   tile, cycle, and restore the layout after a refresh — the same behaviour the
   installed desktop has, in plain DOM. */
import { clamp, emit, glyph, h, isCompact, reducedMotion, store } from "./util.js";
import { t } from "./i18n.js";

const EDGE = 8;
const MIN_W = 320;
const MIN_H = 220;

const wins = new Map();
let registry = null;
let layer = null;
let ghost = null;
let zTop = 10;
let seq = 0;
let activeId = null;
let saveTimer = 0;
let onChange = () => {};
let insets = { top: 44, bottom: 92 };

export function initWindows(apps, container, changed) {
  registry = apps;
  layer = container;
  onChange = changed;
  ghost = h("div", { class: "vd-snap-ghost", hidden: true });
  layer.append(ghost);
  addEventListener("resize", () => {
    for (const win of wins.values()) {
      fitInside(win);
      apply(win);
    }
  });
}

/** The desktop style decides where the top bar and the dock or taskbar sit. */
export function setInsets(next) {
  insets = { ...next };
  for (const win of wins.values()) {
    fitInside(win);
    apply(win);
  }
}

export const getInsets = () => ({ ...insets });

export function area() {
  return { x: 0, y: insets.top, w: innerWidth, h: Math.max(240, innerHeight - insets.top - insets.bottom) };
}

function shown(win) {
  const a = area();
  if (win.maximized) return { x: a.x + 6, y: a.y + 4, w: a.w - 12, h: a.h - 4 };
  if (win.snapped === "left") return { x: 6, y: a.y + 4, w: Math.floor(a.w / 2) - 9, h: a.h - 4 };
  if (win.snapped === "right") return { x: Math.ceil(a.w / 2) + 3, y: a.y + 4, w: Math.floor(a.w / 2) - 9, h: a.h - 4 };
  return win.rect;
}

function apply(win) {
  const style = win.el.style;
  if (isCompact()) {
    for (const key of ["left", "top", "width", "height"]) style.removeProperty(key);
  } else {
    const rect = shown(win);
    style.left = `${Math.round(rect.x)}px`;
    style.top = `${Math.round(rect.y)}px`;
    style.width = `${Math.round(rect.w)}px`;
    style.height = `${Math.round(rect.h)}px`;
  }
  win.el.classList.toggle("is-maximized", win.maximized);
  win.el.classList.toggle("is-snapped", Boolean(win.snapped));
  const maxButton = win.el.querySelector("[data-act=max]");
  if (maxButton) {
    const label = win.maximized ? t("win.restore") : t("win.maximize");
    maxButton.setAttribute("aria-label", label);
    maxButton.title = label;
    maxButton.replaceChildren(glyph(win.maximized ? "restore" : "maximize"));
  }
  win.ctrl?.resized?.();
}

function fitInside(win) {
  const a = area();
  win.rect.w = clamp(win.rect.w, MIN_W, Math.max(MIN_W, a.w - 12));
  win.rect.h = clamp(win.rect.h, MIN_H, Math.max(MIN_H, a.h - 4));
  win.rect.x = clamp(win.rect.x, 80 - win.rect.w, a.w - 80);
  win.rect.y = clamp(win.rect.y, a.y, a.y + a.h - 44);
}

export function listWindows() {
  return [...wins.values()].sort((a, b) => a.z - b.z);
}

export const activeWindow = () => (activeId ? wins.get(activeId) ?? null : null);
export const windowsOf = (appId) => listWindows().filter((win) => win.appId === appId);

export function openApp(appId, options = {}) {
  const app = registry.get(appId);
  if (!app) return null;
  if (app.single !== false) {
    const existing = windowsOf(appId)[0];
    if (existing) {
      if (options.params) existing.ctrl?.update?.(options.params);
      if (existing.minimized) restoreWindow(existing.id);
      focusWindow(existing.id);
      return existing;
    }
  }
  const id = `w${++seq}`;
  const a = area();
  const [wantW, wantH] = app.size || [760, 540];
  const w = Math.min(wantW, a.w - 24);
  const hh = Math.min(wantH, a.h - 12);
  const step = (wins.size % 6) * 26;
  const rect = options.rect ? { ...options.rect } : {
    x: Math.round(Math.max(12, (a.w - w) / 2 + (app.offset || 0) + step - 60)),
    y: Math.round(Math.min(a.y + Math.max(6, (a.h - hh) / 2 - 24 + step), a.y + a.h - hh)),
    w,
    h: hh
  };

  const title = h("h2", { class: "vd-win-title", id: `${id}-title`, text: app.title() });
  const extra = h("div", { class: "vd-win-extra" });
  const actions = h("div", { class: "vd-win-actions" });
  const button = (act, name, label) => h("button", { type: "button", class: "vd-win-btn", "data-act": act, "aria-label": label, title: label }, glyph(name));
  const bar = h("header", { class: "vd-win-bar" }, actions, app.tileNode(), title, extra);
  const body = h("div", { class: "vd-win-body" });
  const el = h("section", { class: `vd-win app-${app.id.replace(/[^a-z0-9-]/gi, "-")}`, role: "dialog", "aria-labelledby": title.id, tabindex: "-1", "data-win": id },
    bar, body, h("div", { class: "vd-win-resize", "aria-hidden": "true" }));
  layer.append(el);

  const win = { id, appId, el, body, rect, z: 0, minimized: false, maximized: Boolean(options.maximized), snapped: options.snapped || null, ctrl: null };
  wins.set(id, win);
  fitInside(win);
  win.ctrl = app.mount(body, {
    win,
    params: options.params || {},
    close: () => closeWindow(id),
    setTitle: (text) => { title.textContent = text; }
  }) || {};
  for (const extra of win.ctrl.actions || []) {
    const node = h("button", { type: "button", class: "vd-win-btn", "aria-label": extra.label, title: extra.label, onClick: extra.run }, glyph(extra.glyph));
    extra.append(node);
  }
  actions.append(button("min", "minimize", t("win.minimize")), button("max", "maximize", t("win.maximize")), button("close", "close", t("win.close")));
  actions.addEventListener("click", (event) => {
    const act = event.target.closest("[data-act]")?.dataset.act;
    if (act === "min") minimizeWindow(id);
    if (act === "max") toggleMaximize(id);
    if (act === "close") closeWindow(id);
  });
  el.addEventListener("pointerdown", () => focusWindow(id), true);
  enableDrag(win, bar);
  enableResize(win, el.querySelector(".vd-win-resize"));

  apply(win);
  focusWindow(id);
  if (!reducedMotion.matches && !options.quiet) {
    el.animate([{ opacity: 0, transform: "translateY(10px) scale(.97)" }, { opacity: 1, transform: "none" }], { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" });
  }
  if (options.minimized) minimizeWindow(id, true);
  emit("window:open", { id, appId });
  changed();
  return win;
}

export function focusWindow(id) {
  const win = wins.get(id);
  if (!win || win.minimized) return;
  if (activeId !== id || win.z !== zTop) {
    win.z = ++zTop;
    win.el.style.zIndex = String(win.z);
  }
  activeId = id;
  for (const other of wins.values()) other.el.classList.toggle("is-active", other.id === id);
  emit("window:focus", { id, appId: win.appId });
  onChange();
}

export function closeWindow(id) {
  const win = wins.get(id);
  if (!win) return;
  try {
    win.ctrl?.unmount?.();
  } catch {
    /* an app that fails to clean up still closes */
  }
  wins.delete(id);
  const finish = () => win.el.remove();
  if (reducedMotion.matches) finish();
  else win.el.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(.97)" }], { duration: 140 }).finished.then(finish, finish);
  if (activeId === id) focusTopmost();
  emit("window:close", { id, appId: win.appId });
  changed();
}

function dockTarget(appId) {
  const target = document.querySelector(`.vd-dock [data-app="${CSS.escape(appId)}"]`);
  return target?.getBoundingClientRect() ?? { left: innerWidth / 2, top: innerHeight - 40, width: 0, height: 0 };
}

export function minimizeWindow(id, quiet = false) {
  const win = wins.get(id);
  if (!win || win.minimized) return;
  win.minimized = true;
  const hide = () => {
    if (win.minimized) win.el.hidden = true;
  };
  if (quiet || reducedMotion.matches || isCompact()) hide();
  else {
    const from = win.el.getBoundingClientRect();
    const to = dockTarget(win.appId);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    win.el.animate([{ transform: "none", opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(.08)`, opacity: 0 }], { duration: 260, easing: "cubic-bezier(.4,0,.6,1)" }).finished.then(hide, hide);
  }
  if (activeId === id) focusTopmost();
  if (!quiet) emit("window:minimize", { id, appId: win.appId });
  changed();
}

export function restoreWindow(id) {
  const win = wins.get(id);
  if (!win || !win.minimized) return;
  win.minimized = false;
  win.el.hidden = false;
  apply(win);
  if (!reducedMotion.matches && !isCompact()) {
    const to = dockTarget(win.appId);
    const from = win.el.getBoundingClientRect();
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    win.el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(.08)`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" });
  }
  focusWindow(id);
  emit("window:restore", { id, appId: win.appId });
  changed();
}

export function toggleMaximize(id, force) {
  const win = wins.get(id);
  if (!win) return;
  win.maximized = force ?? !win.maximized;
  win.snapped = null;
  apply(win);
  changed();
}

export function snapWindow(id, side) {
  const win = wins.get(id);
  if (!win) return;
  win.maximized = false;
  win.snapped = side;
  apply(win);
  emit("window:snap", { id, appId: win.appId, side });
  changed();
}

export function tileAll() {
  const visible = listWindows().filter((win) => !win.minimized);
  if (visible.length === 0) return false;
  const a = area();
  const cols = Math.ceil(Math.sqrt(visible.length));
  const rows = Math.ceil(visible.length / cols);
  const gap = 8;
  const cellW = (a.w - gap * (cols + 1)) / cols;
  const cellH = (a.h - gap * rows) / rows;
  visible.forEach((win, index) => {
    win.maximized = false;
    win.snapped = null;
    win.rect = {
      x: gap + (index % cols) * (cellW + gap),
      y: a.y + gap / 2 + Math.floor(index / cols) * (cellH + gap),
      w: Math.max(MIN_W, cellW),
      h: Math.max(MIN_H, cellH)
    };
    apply(win);
  });
  emit("window:snap", { side: "tile" });
  changed();
  return true;
}

export function minimizeAll() {
  for (const win of listWindows()) minimizeWindow(win.id);
}

export function cycleWindows() {
  const visible = listWindows().filter((win) => !win.minimized);
  if (visible.length < 2) return;
  focusWindow(visible[0].id);
}

function focusTopmost() {
  const next = listWindows().filter((win) => !win.minimized).pop();
  activeId = null;
  if (next) focusWindow(next.id);
  else for (const other of wins.values()) other.el.classList.remove("is-active");
}

function enableDrag(win, bar) {
  bar.addEventListener("dblclick", (event) => {
    if (!event.target.closest("button") && !isCompact()) toggleMaximize(win.id);
  });
  bar.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("button") || isCompact()) return;
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY, rect: { ...win.rect } };
    const wasDocked = win.maximized || Boolean(win.snapped);
    let moved = false;
    let zone = null;
    bar.setPointerCapture(event.pointerId);
    document.body.classList.add("is-dragging");
    const move = (moveEvent) => {
      const dx = moveEvent.clientX - start.x;
      const dy = moveEvent.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      if (!moved) {
        moved = true;
        if (wasDocked) {
          const current = shown(win);
          const ratio = (start.x - current.x) / current.w;
          win.maximized = false;
          win.snapped = null;
          win.rect.x = start.x - win.rect.w * ratio;
          win.rect.y = Math.max(insets.top, start.y - 20);
          start.rect = { ...win.rect };
        }
      }
      win.rect.x = start.rect.x + dx;
      win.rect.y = clamp(start.rect.y + dy, insets.top, innerHeight - 60);
      zone = moveEvent.clientX <= EDGE ? "left" : moveEvent.clientX >= innerWidth - EDGE ? "right" : moveEvent.clientY <= Math.max(2, insets.top - 6) ? "max" : null;
      showGhost(zone);
      apply(win);
    };
    const end = () => {
      bar.removeEventListener("pointermove", move);
      bar.removeEventListener("pointerup", end);
      bar.removeEventListener("pointercancel", end);
      document.body.classList.remove("is-dragging");
      showGhost(null);
      if (!moved) return;
      if (zone === "max") toggleMaximize(win.id, true);
      else if (zone) snapWindow(win.id, zone);
      else {
        fitInside(win);
        apply(win);
      }
      emit("window:move", { id: win.id, appId: win.appId });
      changed();
    };
    bar.addEventListener("pointermove", move);
    bar.addEventListener("pointerup", end);
    bar.addEventListener("pointercancel", end);
  });
}

function enableResize(win, handle) {
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || isCompact()) return;
    event.preventDefault();
    event.stopPropagation();
    const start = { x: event.clientX, y: event.clientY, w: win.rect.w, h: win.rect.h };
    if (win.maximized || win.snapped) {
      win.rect = { ...shown(win) };
      start.w = win.rect.w;
      start.h = win.rect.h;
      win.maximized = false;
      win.snapped = null;
    }
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add("is-dragging");
    const move = (moveEvent) => {
      win.rect.w = Math.max(MIN_W, start.w + moveEvent.clientX - start.x);
      win.rect.h = Math.max(MIN_H, start.h + moveEvent.clientY - start.y);
      apply(win);
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      document.body.classList.remove("is-dragging");
      changed();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  });
}

function showGhost(zone) {
  ghost.hidden = !zone;
  if (!zone) return;
  const a = area();
  const rect = zone === "max" ? { x: 6, y: a.y + 4, w: a.w - 12, h: a.h - 4 }
    : zone === "left" ? { x: 6, y: a.y + 4, w: a.w / 2 - 9, h: a.h - 4 }
      : { x: a.w / 2 + 3, y: a.y + 4, w: a.w / 2 - 9, h: a.h - 4 };
  Object.assign(ghost.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` });
}

/* ----- Layout persistence and scenes ----- */

function changed() {
  onChange();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => store.set("layout", snapshot(true)), 250);
}

function snapshot(includeMinimized) {
  return listWindows()
    .filter((win) => includeMinimized || !win.minimized)
    .filter((win) => registry.get(win.appId)?.persist !== false)
    .map((win) => ({
      appId: win.appId,
      rect: { ...win.rect },
      maximized: win.maximized,
      snapped: win.snapped,
      minimized: win.minimized,
      params: win.ctrl?.params?.() ?? undefined
    }));
}

export function restoreLayout() {
  const saved = store.get("layout", null);
  if (!Array.isArray(saved) || saved.length === 0) return false;
  for (const entry of saved.slice(0, 12)) {
    if (!entry || typeof entry.appId !== "string" || !registry.get(entry.appId)) continue;
    openApp(entry.appId, { ...sanitize(entry), quiet: true });
  }
  return wins.size > 0;
}

function sanitize(entry) {
  const rect = entry.rect && ["x", "y", "w", "h"].every((key) => Number.isFinite(entry.rect[key])) ? entry.rect : undefined;
  return {
    rect,
    maximized: entry.maximized === true,
    snapped: entry.snapped === "left" || entry.snapped === "right" ? entry.snapped : null,
    minimized: entry.minimized === true,
    params: entry.params && typeof entry.params === "object" ? entry.params : undefined
  };
}

export const sceneSnapshot = () => snapshot(false);

/** Restoring a scene keeps mounted windows and minimizes the rest, like the installed desktop. */
export function applyScene(items) {
  const keep = new Set();
  for (const entry of items) {
    if (!registry.get(entry.appId)) continue;
    const state = sanitize(entry);
    const existing = windowsOf(entry.appId)[0];
    if (existing && registry.get(entry.appId).single !== false) {
      if (state.rect) existing.rect = { ...state.rect };
      existing.maximized = state.maximized;
      existing.snapped = state.snapped;
      fitInside(existing);
      if (existing.minimized) restoreWindow(existing.id);
      apply(existing);
      focusWindow(existing.id);
      keep.add(existing.id);
    } else {
      const opened = openApp(entry.appId, { ...state, minimized: false });
      if (opened) keep.add(opened.id);
    }
  }
  for (const win of listWindows()) if (!keep.has(win.id)) minimizeWindow(win.id);
  changed();
}
