/* Desktop styles. The installed Vibe Desktop ships Windows 11 and macOS desktop
   packages next to its own look; the preview offers the same three choices. */
import { emit, h, store } from "./util.js";
import { pick } from "./i18n.js";
import { getWallpaper, paintPreview, setWallpaper } from "./wallpaper.js";
import { setInsets } from "./wm.js";

export const STYLES = [
  {
    id: "vibe",
    wallpaper: "shanshui",
    insets: { top: 44, bottom: 92 },
    name: { zh: "Vibe 夜墨", en: "Vibe Ink" },
    note: { zh: "水墨夜色 · 浮动程序坞 · 生成艺术壁纸", en: "Ink-wash night · floating dock · generative wallpaper" }
  },
  {
    id: "win",
    wallpaper: "bloom",
    insets: { top: 0, bottom: 56 },
    name: { zh: "Windows 11 风格", en: "Windows 11 style" },
    note: { zh: "居中任务栏 · 开始菜单 · 云母玻璃", en: "Centered taskbar · Start menu · Mica glass" }
  },
  {
    id: "mac",
    wallpaper: "dune",
    insets: { top: 30, bottom: 92 },
    name: { zh: "macOS 风格", en: "macOS style" },
    note: { zh: "全局菜单栏 · 会放大的 Dock · 红绿灯按钮", en: "Global menu bar · magnifying Dock · traffic lights" }
  }
];

const byId = (id) => STYLES.find((style) => style.id === id);

export function savedStyle() {
  const id = store.get("style", null);
  return byId(id) ? id : null;
}

export const currentStyle = () => document.body.dataset.style || "vibe";

/** Applies a style; switching also brings that style's own wallpaper. */
export function applyStyle(id, { withWallpaper = true, persist = true } = {}) {
  const style = byId(id) || STYLES[0];
  document.body.dataset.style = style.id;
  setInsets(style.insets);
  if (withWallpaper && getWallpaper().mood !== style.wallpaper) setWallpaper(style.wallpaper);
  if (persist) store.set("style", style.id);
  emit("style:change", { id: style.id });
}

/** A small picture of a style: its wallpaper plus a sketch of its chrome. */
export function stylePreview(style) {
  const canvas = h("canvas", { width: "360", height: "225", "aria-hidden": "true" });
  paintPreview(canvas, style.wallpaper, 1022);
  return h("span", { class: `style-preview style-${style.id}`, "aria-hidden": "true" },
    canvas,
    h("span", { class: "sp-top" }),
    h("span", { class: "sp-win" }, h("span", { class: "sp-bar" }, h("i"), h("i"), h("i"))),
    h("span", { class: "sp-dock" }, h("i"), h("i"), h("i"), h("i"), h("i")));
}

export function styleCard(style, selected, onPick) {
  return h("button", { type: "button", role: "radio", class: "style-card", "aria-checked": String(selected), "data-style": style.id, onClick: () => onPick(style.id) },
    stylePreview(style),
    h("strong", { text: pick(style.name) }),
    h("small", { text: pick(style.note) }));
}
