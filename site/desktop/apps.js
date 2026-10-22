/* The apps on this desktop: built-ins, toys, and websites that allow being
   framed. Each app mounts into a window body and may return a controller. */
import { copyText, emit, glyph, h, isCompact, store, tile } from "./util.js";
import { lang, pick, t } from "./i18n.js";
import { INSTALL_COMMAND } from "./chapters.js";
import { mountInk } from "./ink.js";
import { mountGarden } from "./garden.js";
import { mountTutorial } from "./tutorial.js";
import { MOODS, getWallpaper, paintPreview, setAnimated, setWallpaper } from "./wallpaper.js";

/* Every site below was checked to render inside a frame (no X-Frame-Options,
   no frame-ancestors, no frame-busting) when this list was written. */
export const SITES = [
  { key: "silk", group: "art", url: "https://weavesilk.com/", glyph: "spiral", tint: "violet", name: { zh: "丝绸画", en: "Silk" }, blurb: { zh: "对称的丝线，画出会发光的画", en: "Draw glowing, symmetrical silk" } },
  { key: "patatap", group: "art", url: "https://patatap.com/", glyph: "keys", tint: "coral", name: { zh: "按键音画", en: "Patatap" }, blurb: { zh: "每个键都是一段声音和动画", en: "Every key is a sound and an animation" } },
  { key: "sand", group: "art", url: "https://thisissand.com/", glyph: "sand", tint: "gold", name: { zh: "流沙画", en: "This Is Sand" }, blurb: { zh: "一粒一粒堆出一幅沙画", en: "Pour a picture, grain by grain" } },
  { key: "sandspiel", group: "art", url: "https://sandspiel.club/", glyph: "sand", tint: "teal", name: { zh: "沙盒宇宙", en: "Sandspiel" }, blurb: { zh: "水、火、沙和植物会互相反应", en: "Sand, water, fire and plants that react" } },
  { key: "kandinsky", group: "art", url: "https://musiclab.chromeexperiments.com/Kandinsky/", glyph: "music", tint: "blue", name: { zh: "康定斯基", en: "Kandinsky" }, blurb: { zh: "Chrome Music Lab：画出来的形状会唱歌", en: "Chrome Music Lab: shapes you draw will sing" } },
  { key: "typatone", group: "art", url: "https://typatone.com/", glyph: "keys", tint: "lime", name: { zh: "打字成曲", en: "Typatone" }, blurb: { zh: "打出来的每个字母都是一个音", en: "Every letter you type is a note" } },
  { key: "excalidraw", group: "create", url: "https://excalidraw.com/", glyph: "pen", tint: "violet", name: { zh: "Excalidraw 手绘白板", en: "Excalidraw" }, blurb: { zh: "手绘风格的白板，画草图和流程图", en: "A hand-drawn style whiteboard" } },
  { key: "tldraw", group: "create", url: "https://www.tldraw.com/", glyph: "pen", tint: "graphite", name: { zh: "tldraw 无限画布", en: "tldraw" }, blurb: { zh: "无限大的白板", en: "An infinite canvas whiteboard" } },
  { key: "jspaint", group: "create", url: "https://jspaint.app/", glyph: "brush", tint: "blue", name: { zh: "画图", en: "JS Paint" }, blurb: { zh: "经典「画图」的网页复刻", en: "Classic Paint, rebuilt for the web" } },
  { key: "photopea", group: "create", url: "https://www.photopea.com/", glyph: "image", tint: "teal", name: { zh: "Photopea 修图", en: "Photopea" }, blurb: { zh: "网页里的图片编辑器，能打开 PSD", en: "An image editor that opens PSD files" } },
  { key: "p5", group: "create", url: "https://editor.p5js.org/", glyph: "code", tint: "coral", name: { zh: "p5.js 创意编程", en: "p5.js Editor" }, blurb: { zh: "写几行代码就能画画", en: "Creative coding in a few lines" } },
  { key: "desmos", group: "create", url: "https://www.desmos.com/calculator", glyph: "calc", tint: "lime", name: { zh: "Desmos 图形计算器", en: "Desmos" }, blurb: { zh: "输入函数，看它变成图像", en: "Type a function, watch it draw" } },
  { key: "earth", group: "world", url: "https://earth.nullschool.net/", glyph: "wind", tint: "night", name: { zh: "地球风场", en: "Earth Wind Map" }, blurb: { zh: "整个地球此刻的风和洋流", en: "The planet's winds and currents, live" } },
  { key: "osm", group: "world", url: "https://www.openstreetmap.org/export/embed.html?bbox=73.5%2C18.0%2C135.1%2C53.6&layer=mapnik", glyph: "map", tint: "teal", name: { zh: "开放街图", en: "OpenStreetMap" }, blurb: { zh: "大家一起画的世界地图", en: "The map of the world, drawn by everyone" } },
  { key: "gushiwen", group: "world", url: "https://so.gushiwen.cn/", glyph: "scroll", tint: "paper", name: { zh: "古诗文网", en: "Classical Poetry" }, blurb: { zh: "唐诗宋词，随手翻翻", en: "Chinese classical poetry to browse" } },
  { key: "baike", group: "world", url: "https://baike.baidu.com/", glyph: "book", tint: "blue", name: { zh: "百度百科", en: "Baidu Baike" }, blurb: { zh: "中文百科全书", en: "A Chinese-language encyclopedia" } },
  { key: "wikipedia", group: "world", url: lang === "zh" ? "https://zh.wikipedia.org/" : "https://en.wikipedia.org/", glyph: "book", tint: "graphite", name: { zh: "维基百科", en: "Wikipedia" }, blurb: { zh: "自由的百科全书", en: "The free encyclopedia" } },
  { key: "bilibili", group: "world", url: "https://www.bilibili.com/", glyph: "tv", tint: "pink", name: { zh: "哔哩哔哩", en: "Bilibili" }, blurb: { zh: "看视频", en: "Watch videos" } }
];

const DEFAULT_PINNED = ["silk", "earth", "excalidraw", "gushiwen"];

export function pinnedSites() {
  const saved = store.get("pinned", null);
  return Array.isArray(saved) ? saved.filter((key) => SITES.some((site) => site.key === key)) : DEFAULT_PINNED;
}

export function pinSite(key, value) {
  const current = pinnedSites().filter((item) => item !== key);
  store.set("pinned", value ? [...current, key] : current);
  emit("desktop:changed", {});
}

export function buildRegistry(ctx) {
  const apps = new Map();
  const add = (app) => apps.set(app.id, { single: true, tileNode: () => tile(app.glyph, app.tint), ...app, title: app.title || (() => t(`app.${app.id}`)) });
  add({ id: "welcome", glyph: "sparkle", tint: "acid", size: [660, 600], mount: (body) => mountWelcome(body, ctx) });
  add({ id: "tutorial", glyph: "star", tint: "gold", size: [1080, 720], offset: 40, mount: (body, win) => mountTutorial(body, { ...ctx, params: win.params }) });
  add({ id: "market", glyph: "bag", tint: "blue", size: [1040, 720], mount: embedPage("/apps", t("app.market")) });
  add({ id: "install", glyph: "download", tint: "lime", size: [780, 680], mount: (body) => mountInstall(body) });
  add({ id: "ink", glyph: "brush", tint: "paper", size: [880, 620], mount: (body) => mountInk(body) });
  add({ id: "garden", glyph: "flower", tint: "night", size: [620, 700], mount: (body) => mountGarden(body) });
  add({ id: "wallpaper", glyph: "image", tint: "aurora", size: [820, 620], mount: (body) => mountWallpaperStudio(body) });
  add({ id: "gallery", glyph: "grid", tint: "coral", size: [980, 700], mount: (body) => mountGallery(body, ctx) });
  add({ id: "browser", glyph: "globe", tint: "teal", size: [1040, 700], mount: (body, win) => mountBrowser(body, win) });
  add({ id: "developers", glyph: "code", tint: "violet", size: [1000, 720], mount: embedPage("/developers", t("app.developers")) });
  add({ id: "github", glyph: "branch", tint: "graphite", href: "https://github.com/vimalinx/vibedesktop", mount: () => ({}) });
  for (const site of SITES) {
    add({ id: `site:${site.key}`, site, glyph: site.glyph, tint: site.tint, size: [1040, 700], title: () => pick(site.name), mount: (body) => mountSite(body, site.url, pick(site.name)) });
  }
  return apps;
}

function embedPage(path, title) {
  return (body) => {
    body.append(h("iframe", { class: "vd-frame", src: `${path}?embed=1`, title }));
    return {
      actions: [{ glyph: "external", label: t("win.openTab"), run: () => window.open(path, "_blank", "noopener") }]
    };
  };
}

export function frameFor(url, title) {
  return h("iframe", {
    class: "vd-frame",
    src: url,
    title,
    referrerpolicy: "no-referrer",
    allow: "autoplay; fullscreen; clipboard-write",
    sandbox: "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals allow-pointer-lock"
  });
}

function siteNotice(url) {
  if (store.get("siteNoticeDismissed", false)) return null;
  const notice = h("div", { class: "vd-site-notice", role: "note" },
    h("span", { text: t("site.blank") }),
    h("a", { href: url, target: "_blank", rel: "noopener noreferrer", text: t("site.openTab") }),
    h("button", { type: "button", text: t("site.dismiss"), onClick: () => { store.set("siteNoticeDismissed", true); notice.remove(); } }));
  return notice;
}

function mountSite(body, url, title) {
  let frameNode = frameFor(url, title);
  body.append(frameNode, siteNotice(url) || "");
  return {
    actions: [
      { glyph: "refresh", label: t("win.reload"), run: () => { const next = frameFor(url, title); frameNode.replaceWith(next); frameNode = next; } },
      { glyph: "external", label: t("win.openTab"), run: () => window.open(url, "_blank", "noopener,noreferrer") }
    ]
  };
}

/* ----- Welcome ----- */

function mountWelcome(body, ctx) {
  const title = h("h3", { class: "welcome-title" }, t("welcome.title").split("\n").map((line, index) => (index ? [h("br"), h("em", { text: line })] : line)));
  const start = h("button", { type: "button", class: "button primary", onClick: () => ctx.openApp("tutorial") }, glyph("star"), t("welcome.start"));
  body.append(h("div", { class: "welcome" },
    h("div", { class: "welcome-art", "aria-hidden": "true" }, h("span", { class: "welcome-arc" }), h("span", { class: "welcome-dot dot-gold" }), h("span", { class: "welcome-dot dot-blue" })),
    h("p", { class: "eyebrow welcome-kicker" }, h("span"), t("welcome.kicker")),
    title,
    h("p", { class: "welcome-lead", text: t("welcome.lead") }),
    h("p", { class: "welcome-demo", text: t("welcome.demo") }),
    isCompact() ? h("p", { class: "welcome-mobile", text: t("welcome.mobile") }) : null,
    h("div", { class: "welcome-actions" },
      start,
      h("button", { type: "button", class: "button secondary", onClick: () => ctx.openApp("install") }, glyph("download"), t("welcome.install")),
      h("button", { type: "button", class: "button ghost", onClick: () => ctx.closeApp("welcome") }, t("welcome.explore"))),
    h("ul", { class: "welcome-tips" }, ["welcome.tip1", "welcome.tip2", "welcome.tip3"].map((key) => h("li", { text: t(key) })))));
  requestAnimationFrame(() => start.focus({ preventScroll: true }));
  return {};
}

/* ----- Install ----- */

function mountInstall(body) {
  const status = h("p", { class: "copy-status", role: "status", "aria-live": "polite" });
  const copy = h("button", { type: "button", class: "copy-button" }, t("install.copy"));
  copy.addEventListener("click", async () => {
    const ok = await copyText(INSTALL_COMMAND);
    status.textContent = ok ? t("install.copied") : t("install.copyFail");
    if (ok) emit("install:copied", {});
  });
  const fact = (value, key) => h("div", {}, h("strong", { text: value }), h("span", { text: t(key) }));
  const link = (href, key) => h("a", { href, target: "_blank", rel: "noreferrer", text: `${t(key)} ↗` });
  body.append(h("div", { class: "install-app" },
    h("p", { class: "eyebrow", text: t("install.kicker") }),
    h("h3", { class: "install-title", text: t("install.title") }),
    h("p", { class: "install-lead", rich: t("install.lead") }),
    h("div", { class: "command-card" },
      h("div", { class: "command-header" }, h("span", { text: "Terminal" }), h("span", { text: "latest release" })),
      h("pre", {}, h("code", { text: INSTALL_COMMAND })),
      copy,
      status),
    h("ol", { class: "install-steps" }, ["install.step1", "install.step2", "install.step3"].map((key) => h("li", { rich: t(key) }))),
    h("div", { class: "install-facts" }, fact("1", "install.fact1"), fact("~85 MB", "install.fact2"), fact("0", "install.fact3"), fact("127.0.0.1", "install.fact4")),
    h("p", { class: "install-req", text: t("install.req") }),
    h("h4", { class: "install-sub", text: t("install.cli") }),
    h("pre", { class: "code-sample" }, h("code", { text: [
      "vibedesktop open | status | logs",
      "vibedesktop add ~/Projects/my-app --plan     # preview",
      "vibedesktop add ~/Projects/my-app --start    # register, start, verify",
      "vibedesktop install owner/repo               # from the app market",
      "vibedesktop update | rollback | uninstall"
    ].join("\n") })),
    h("p", { class: "install-links" },
      link("https://github.com/vimalinx/vibedesktop", "install.source"),
      link("https://github.com/vimalinx/vibedesktop/blob/main/SECURITY.md", "install.security"),
      link("https://github.com/vimalinx/vibedesktop/blob/main/docs/guide.md", "install.guide"),
      link("https://github.com/vimalinx/vibedesktop/blob/main/CHANGELOG.md", "install.changelog"))));
  return {};
}

/* ----- Web Gallery ----- */

function mountGallery(body, ctx) {
  const render = () => {
    const pinned = new Set(pinnedSites());
    const section = (group, key) => h("section", { class: "gallery-group" },
      h("h3", { class: "gallery-heading", text: t(key) }),
      h("div", { class: "gallery-grid" }, SITES.filter((site) => site.group === group).map((site) => {
        const isPinned = pinned.has(site.key);
        return h("article", { class: "gallery-card" },
          h("button", { type: "button", class: "gallery-open", onClick: () => ctx.openApp(`site:${site.key}`) },
            tile(site.glyph, site.tint),
            h("span", {}, h("strong", { text: pick(site.name) }), h("small", { text: pick(site.blurb) }), h("span", { class: "gallery-host", text: new URL(site.url).hostname }))),
          h("div", { class: "gallery-actions" },
            h("button", { type: "button", class: "chip", "aria-pressed": String(isPinned), onClick: () => { pinSite(site.key, !isPinned); ctx.toast(isPinned ? t("icon.removed", { name: pick(site.name) }) : t("icon.pinned", { name: pick(site.name) })); } },
              glyph(isPinned ? "check" : "plus"), isPinned ? t("gallery.pinned") : t("gallery.pin")),
            h("a", { class: "chip", href: site.url, target: "_blank", rel: "noopener noreferrer", "aria-label": `${pick(site.name)} · ${t("win.openTab")}`, title: t("win.openTab") }, glyph("external"))));
      })));
    body.replaceChildren(h("div", { class: "gallery" },
      h("p", { class: "gallery-lead", text: t("gallery.lead") }),
      h("p", { class: "gallery-note", text: t("gallery.note") }),
      section("art", "gallery.art"),
      section("create", "gallery.create"),
      section("world", "gallery.world")));
  };
  render();
  const off = ctx.on("desktop:changed", render);
  return { unmount: off };
}

/* ----- Browser ----- */

function normalizeUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function mountBrowser(body, win) {
  let current = normalizeUrl(win.params?.url);
  const input = h("input", { type: "text", inputmode: "url", enterkeyhint: "go", class: "browser-input", placeholder: t("browser.placeholder"), "aria-label": t("browser.placeholder"), spellcheck: "false", autocomplete: "off", value: current || "" });
  const message = h("p", { class: "browser-message", role: "status", "aria-live": "polite" });
  const viewport = h("div", { class: "browser-viewport" });
  const form = h("form", { class: "browser-bar", novalidate: true }, glyph("globe"), input, h("button", { type: "submit", class: "button primary", text: t("browser.go") }));
  const go = (url) => {
    current = url;
    input.value = url;
    message.textContent = "";
    viewport.replaceChildren(frameFor(url, new URL(url).hostname), siteNotice(url) || "");
    win.setTitle(`${t("app.browser")} · ${new URL(url).hostname}`);
  };
  const start = () => viewport.replaceChildren(h("div", { class: "browser-start" },
    h("h3", { text: t("browser.title") }),
    h("p", { text: t("browser.hint") }),
    h("p", { class: "browser-picks-label", text: t("browser.picks") }),
    h("div", { class: "browser-picks" }, SITES.filter((site) => ["gushiwen", "earth", "wikipedia", "desmos", "osm", "baike"].includes(site.key))
      .map((site) => h("button", { type: "button", class: "chip", onClick: () => go(site.url) }, glyph(site.glyph), pick(site.name))))));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const url = normalizeUrl(input.value);
    if (!url) {
      message.textContent = t("browser.invalid");
      return;
    }
    go(url);
  });
  body.append(h("div", { class: "browser" }, form, message, viewport));
  if (current) go(current);
  else start();
  return {
    params: () => (current ? { url: current } : {}),
    update: (params) => { const url = normalizeUrl(params?.url); if (url) go(url); },
    actions: [{ glyph: "external", label: t("win.openTab"), run: () => current && window.open(current, "_blank", "noopener,noreferrer") }]
  };
}

/* ----- Wallpaper Studio ----- */

function mountWallpaperStudio(body) {
  const grid = h("div", { class: "wallpaper-grid" });
  const animate = h("input", { type: "checkbox" });
  const render = () => {
    const { mood, seed, animated } = getWallpaper();
    animate.checked = animated;
    grid.replaceChildren(...MOODS.map((name) => {
      const preview = h("canvas", { width: "320", height: "200", class: "wallpaper-preview", "aria-hidden": "true" });
      paintPreview(preview, name, seed);
      const labelKey = `wallpaper.${name}`;
      return h("button", { type: "button", class: "wallpaper-card", "aria-pressed": String(name === mood), onClick: () => { setWallpaper(name); setTimeout(render, 320); } },
        preview,
        h("strong", { text: t(labelKey) }),
        h("small", { text: t(`${labelKey}.note`) }),
        name === mood ? h("span", { class: "wallpaper-current", text: t("wallpaper.current") }) : null);
    }));
  };
  animate.addEventListener("change", () => setAnimated(animate.checked));
  body.append(h("div", { class: "wallpaper-studio" },
    h("p", { class: "gallery-lead", text: t("wallpaper.lead") }),
    grid,
    h("div", { class: "sim-controls" },
      h("button", { type: "button", class: "button primary", onClick: () => { const { mood } = getWallpaper(); setWallpaper(mood, Math.floor(Math.random() * 1e6)); setTimeout(render, 320); } }, glyph("sparkle"), t("wallpaper.seed")),
      h("label", { class: "toggle" }, animate, h("span", { text: t("wallpaper.animate") })))));
  render();
  return {};
}
