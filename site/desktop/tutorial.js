/* 星图教程 Star Guide: eight chapters drawn as a constellation. Missions are
   real actions on this desktop (or in a chapter's simulation); finishing a
   chapter's missions lights its star. */
import { CHAPTERS } from "./chapters.js";
import { SIMS, installCard } from "./sims.js";
import { download, emit, glyph, h, isCompact, on, reducedMotion, store, svg } from "./util.js";
import { lang, pick, t } from "./i18n.js";

const state = load();
let notify = () => {};

function load() {
  const saved = store.get("tour", null);
  return {
    done: saved && typeof saved.done === "object" && saved.done ? saved.done : {},
    lit: Array.isArray(saved?.lit) ? saved.lit.filter((id) => CHAPTERS.some((chapter) => chapter.id === id)) : [],
    started: saved?.started === true
  };
}

const save = () => store.set("tour", state);
export const tourStats = () => ({ lit: state.lit.length, total: CHAPTERS.length });

const required = (chapter) => chapter.missions.filter((mission) => !(mission.desktopOnly && isCompact()));

/** Listens for mission events for the whole session, tutorial window open or not. */
export function initTour(toast) {
  notify = toast;
  for (const chapter of CHAPTERS) {
    for (const mission of chapter.missions) {
      on(mission.event, (detail) => {
        if (mission.event === "window:open" && ["tutorial", "welcome"].includes(detail.appId)) return;
        complete(chapter, mission);
      });
    }
  }
  // Paint, minimize, restore: the painting must survive the round trip.
  let painted = false;
  let minimized = false;
  on("ink:stroke", () => { painted = true; });
  on("window:minimize", ({ appId }) => { if (appId === "ink" && painted) minimized = true; });
  on("window:restore", ({ appId }) => { if (appId === "ink" && minimized) emit("ink:kept", {}); });
  on("window:close", ({ appId }) => { if (appId === "ink") { painted = false; minimized = false; } });
}

function complete(chapter, mission) {
  const key = `${chapter.id}.${mission.id}`;
  if (state.done[key]) return;
  state.done[key] = true;
  save();
  if (state.started) notify(t("mission.done", { text: pick(mission.text) }));
  if (!state.lit.includes(chapter.id) && required(chapter).every((item) => state.done[`${chapter.id}.${item.id}`])) light(chapter);
  emit("tour:update", {});
}

function light(chapter) {
  if (state.lit.includes(chapter.id)) return;
  state.lit.push(chapter.id);
  save();
  if (state.started) notify(`✦ ${t("star.lit", { n: CHAPTERS.indexOf(chapter) + 1, title: pick(chapter.short) })}`);
  emit("tour:update", { lit: chapter.id });
}

export function mountTutorial(body, ctx) {
  state.started = true;
  save();
  let index = Math.max(0, CHAPTERS.findIndex((chapter) => chapter.id === ctx.params?.chapter));
  let sim = null;
  const sky = h("div", { class: "tour-sky" });
  const page = h("div", { class: "tour-page", tabindex: "-1" });
  body.append(h("div", { class: "tour" }, sky, page));
  let missionsBox = null;

  function drawSky(flash) {
    const stars = CHAPTERS.map((chapter) => chapter.star);
    const all = state.lit.length === CHAPTERS.length;
    const graphic = svg("svg", { viewBox: "36 70 448 490", class: `tour-map${all ? " is-complete" : ""}`, role: "img", "aria-label": t("tour.progress", { n: state.lit.length, total: CHAPTERS.length }) });
    graphic.append(svg("defs", {}, svg("radialGradient", { id: "star-glow" }, svg("stop", { offset: "0", "stop-color": "#fff6c8", "stop-opacity": ".9" }), svg("stop", { offset: "1", "stop-color": "#c8ff3d", "stop-opacity": "0" }))));
    for (let i = 1; i < stars.length; i++) {
      const lit = state.lit.includes(CHAPTERS[i - 1].id) && state.lit.includes(CHAPTERS[i].id);
      graphic.append(svg("line", { x1: stars[i - 1][0], y1: stars[i - 1][1], x2: stars[i][0], y2: stars[i][1], class: `tour-link${lit ? " is-lit" : ""}` }));
    }
    if (all) graphic.append(svg("circle", { cx: 196, cy: 470, r: 30, class: "tour-planet planet-gold" }), svg("circle", { cx: 380, cy: 380, r: 30, class: "tour-planet planet-blue" }));
    CHAPTERS.forEach((chapter, i) => {
      const [x, y] = chapter.star;
      const lit = state.lit.includes(chapter.id);
      const group = svg("g", { class: `tour-star${lit ? " is-lit" : ""}${i === index ? " is-current" : ""}${flash === chapter.id ? " is-new" : ""}`, "aria-hidden": "true" },
        svg("circle", { cx: x, cy: y, r: 40, class: "tour-star-glow", fill: "url(#star-glow)" }),
        svg("circle", { cx: x, cy: y, r: 26, class: "tour-star-ring" }),
        svg("path", { d: starPath(x, y, lit ? 16 : 11), class: "tour-star-core" }),
        svg("text", { x: x + (x > 300 ? -34 : 34), y: y + 8, class: "tour-star-number", "text-anchor": x > 300 ? "end" : "start" }, String(i + 1)));
      group.addEventListener("click", () => goTo(i));
      graphic.append(group);
    });
    const meter = h("span", { class: "tour-meter", "aria-hidden": "true" }, h("i"));
    meter.firstChild.style.width = `${(state.lit.length / CHAPTERS.length) * 100}%`;
    const list = h("ol", { class: "tour-list" }, CHAPTERS.map((chapter, i) => {
      const lit = state.lit.includes(chapter.id);
      return h("li", {}, h("button", { type: "button", class: `tour-item${lit ? " is-lit" : ""}`, "aria-current": i === index ? "step" : undefined, onClick: () => goTo(i) },
        h("span", { class: "tour-item-mark", "aria-hidden": "true" }, lit ? glyph("star") : String(i + 1)),
        h("span", { text: pick(chapter.short) }),
        lit ? h("span", { class: "visually-hidden", text: t("tour.lit") }) : null));
    }));
    sky.replaceChildren(
      h("p", { class: "tour-title", text: t("app.tutorial") }),
      graphic,
      h("p", { class: "tour-progress" }, h("strong", { text: t("tour.progress", { n: state.lit.length, total: CHAPTERS.length }) })),
      meter,
      list);
    requestAnimationFrame(() => {
      const current = list.querySelector("[aria-current]");
      if (current && list.scrollWidth > list.clientWidth) list.scrollLeft = current.offsetLeft - (list.clientWidth - current.offsetWidth) / 2;
    });
  }

  function goTo(next) {
    index = Math.max(0, Math.min(CHAPTERS.length - 1, next));
    renderPage();
    drawSky();
    page.scrollTop = 0;
    page.focus({ preventScroll: true });
  }

  function renderPage() {
    sim?.unmount?.();
    sim = null;
    const chapter = CHAPTERS[index];
    const parts = [
      h("p", { class: "tour-kicker" }, h("span", { text: `${t("tour.chapter", { n: index + 1 })} · ${pick(chapter.short)}` })),
      h("h3", { class: "tour-heading", text: pick(chapter.title) }),
      h("p", { class: "tour-lead", rich: pick(chapter.lead) })
    ];
    if (chapter.sim) {
      sim = SIMS[chapter.sim](ctx);
      parts.push(h("section", { class: "tour-sim" }, chapter.simLead ? h("p", { class: "tour-sim-lead", text: pick(chapter.simLead) }) : null, sim.node));
    }
    if (chapter.keys) {
      parts.push(h("dl", { class: "tour-keys" }, chapter.keys.map(([keys, text]) => [h("dt", {}, h("kbd", { text: keys })), h("dd", { text: pick(text) })])));
    }
    parts.push(h("h4", { class: "tour-sub", text: t("tour.points") }), h("ul", { class: "tour-points" }, chapter.points.map((point) => h("li", { rich: pick(point) }))));
    if (chapter.shot) {
      parts.push(h("figure", { class: "tour-shot" },
        h("img", { src: chapter.shot.src, alt: pick(chapter.shot.caption), loading: "lazy", width: "1800", height: "1125" }),
        h("figcaption", {}, h("span", { class: "sim-tag", text: t("tour.real") }), " ", pick(chapter.shot.caption))));
    }
    if (chapter.commands) {
      parts.push(h("div", { class: "tour-commands" }, chapter.commands.map((command) => h("pre", {}, h("code", { text: command })))),
        h("p", { class: "tour-links" },
          h("button", { type: "button", class: "link-button", onClick: () => ctx.openApp("developers") }, t("app.developers"), " →"),
          h("a", { href: "https://github.com/vimalinx/vibedesktop/blob/main/docs/app-format.md", target: "_blank", rel: "noreferrer", text: lang === "zh" ? "完整格式说明 ↗" : "Full format reference ↗" })));
    }
    if (chapter.install) {
      parts.push(h("section", { class: "tour-install" },
        h("h4", { class: "tour-sub", text: t("install.title") }),
        h("p", { class: "tour-lead", text: t("install.req") }),
        installCard()));
    }
    missionsBox = h("section", { class: "tour-missions", "aria-live": "polite" });
    parts.push(missionsBox);
    parts.push(h("nav", { class: "tour-nav" },
      h("button", { type: "button", class: "button secondary", disabled: index === 0, onClick: () => goTo(index - 1) }, `← ${t("tour.prev")}`),
      index < CHAPTERS.length - 1
        ? h("button", { type: "button", class: "button primary", onClick: () => goTo(index + 1) }, `${t("tour.next")} · ${pick(CHAPTERS[index + 1].short)} →`)
        : h("button", { type: "button", class: "button secondary", onClick: () => ctx.openApp("install") }, t("app.install"), " →")));
    page.replaceChildren(h("article", { class: "tour-chapter" }, parts));
    renderMissions();
  }

  function renderMissions() {
    if (!missionsBox) return;
    const chapter = CHAPTERS[index];
    const lit = state.lit.includes(chapter.id);
    const items = chapter.missions.map((mission) => {
      const done = Boolean(state.done[`${chapter.id}.${mission.id}`]);
      const optional = mission.desktopOnly && isCompact();
      return h("li", { class: `${done ? "is-done" : ""}${optional ? " is-optional" : ""}` },
        h("span", { class: "mission-box", "aria-hidden": "true" }, done ? glyph("check") : null),
        h("span", { text: pick(mission.text) }),
        optional ? h("small", { text: t("tour.desktopOnly") }) : null,
        h("span", { class: "visually-hidden", text: done ? "✓" : "" }));
    });
    const footer = lit
      ? h("p", { class: "tour-lit" }, glyph("star"), t("tour.lit"))
      : h("p", { class: "tour-caption", text: t("tour.missionsLeft") });
    const children = [h("h4", { class: "tour-sub", text: t("tour.missions") }), h("ul", { class: "mission-list" }, items), footer];
    if (state.lit.length === CHAPTERS.length) children.push(finale());
    missionsBox.replaceChildren(...children);
  }

  function finale() {
    const holder = h("div", { class: "tour-certificate" });
    const show = h("button", { type: "button", class: "button primary" }, glyph("sparkle"), t("tour.certificate"));
    show.addEventListener("click", () => {
      const canvas = certificate();
      const get = h("button", { type: "button", class: "button primary", onClick: () => canvas.toBlob((blob) => blob && download(blob, "vibe-desktop-star-guide.png"), "image/png") }, glyph("download"), t("tour.download"));
      holder.replaceChildren(canvas, h("div", { class: "sim-controls" }, get, h("button", { type: "button", class: "button secondary", onClick: () => ctx.openApp("install") }, t("welcome.install"))));
    });
    return h("div", { class: "tour-finale" },
      h("h4", { class: "tour-heading", text: t("tour.allDone") }),
      h("p", { class: "tour-lead", text: t("tour.finale") }),
      h("div", { class: "sim-controls" }, show,
        h("button", { type: "button", class: "button secondary", onClick: () => {
          state.done = {};
          state.lit = [];
          save();
          notify(t("tour.resetDone"));
          emit("tour:update", {});
          goTo(0);
        } }, glyph("refresh"), t("tour.reset"))),
      holder);
  }

  const off = on("tour:update", ({ lit }) => {
    drawSky(lit);
    renderMissions();
    if (lit && !reducedMotion.matches) burst(sky);
  });

  drawSky();
  renderPage();
  return {
    params: () => ({ chapter: CHAPTERS[index].id }),
    update: (params) => {
      const next = CHAPTERS.findIndex((chapter) => chapter.id === params?.chapter);
      if (next >= 0) goTo(next);
    },
    unmount() {
      off();
      sim?.unmount?.();
    }
  };
}

function starPath(cx, cy, r) {
  const points = [];
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 ? r * 0.42 : r;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    points.push(`${(cx + Math.cos(a) * radius).toFixed(1)},${(cy + Math.sin(a) * radius).toFixed(1)}`);
  }
  return `M${points.join("L")}Z`;
}

function burst(container) {
  const box = container.getBoundingClientRect();
  for (let i = 0; i < 18; i++) {
    const spark = h("span", { class: "tour-spark", "aria-hidden": "true" });
    spark.style.left = `${box.width / 2}px`;
    spark.style.top = `${box.height * 0.45}px`;
    container.append(spark);
    const angle = (Math.PI * 2 * i) / 18;
    const distance = 60 + Math.random() * 90;
    spark.animate([{ transform: "translate(0,0) scale(1)", opacity: 1 }, { transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px) scale(.2)`, opacity: 0 }],
      { duration: 900 + Math.random() * 400, easing: "cubic-bezier(.1,.8,.3,1)" }).finished.then(() => spark.remove(), () => spark.remove());
  }
}

function certificate() {
  const canvas = h("canvas", { class: "certificate-canvas", width: "1600", height: "1100", role: "img", "aria-label": t("tour.cert.title") });
  const c = canvas.getContext("2d");
  const serif = '"Noto Serif SC", "Source Han Serif SC", "Songti SC", Georgia, serif';
  c.fillStyle = "#f2ecdf";
  c.fillRect(0, 0, 1600, 1100);
  for (let i = 0; i < 9000; i++) {
    c.fillStyle = `rgba(120, 96, 60, ${Math.random() * 0.07})`;
    c.fillRect(Math.random() * 1600, Math.random() * 1100, 1.5, 1.5);
  }
  c.strokeStyle = "#b8402c";
  c.lineWidth = 6;
  c.strokeRect(50, 50, 1500, 1000);
  c.lineWidth = 1.5;
  c.strokeRect(68, 68, 1464, 964);
  c.fillStyle = "#1c1a1e";
  c.textAlign = "center";
  c.font = `600 34px ${serif}`;
  c.fillText("VIBE DESKTOP", 800, 170);
  c.font = `700 88px ${serif}`;
  c.fillText(t("tour.cert.title"), 800, 290);
  c.font = `400 34px ${serif}`;
  c.fillStyle = "#4a4448";
  c.fillText(t("tour.cert.body"), 800, 360);
  const offsetX = 800 - 260;
  const offsetY = 380;
  const pts = CHAPTERS.map((chapter) => [offsetX + chapter.star[0], offsetY + chapter.star[1] * 0.75]);
  c.strokeStyle = "rgba(28, 26, 30, 0.6)";
  c.lineWidth = 2;
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.stroke();
  c.fillStyle = "#d9a520";
  for (const [x, y] of pts) {
    c.beginPath();
    c.arc(x, y, 9, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = "#e9b949";
  c.beginPath();
  c.arc(offsetX + 196, offsetY + 470 * 0.75, 16, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#5aa2e6";
  c.beginPath();
  c.arc(offsetX + 380, offsetY + 380 * 0.75, 16, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#1c1a1e";
  c.font = `700 52px ${serif}`;
  c.fillText(t("tour.cert.role"), 800, 900);
  c.font = `400 26px ${serif}`;
  c.fillStyle = "#4a4448";
  c.fillText(`${new Date().toLocaleDateString(lang === "zh" ? "zh-CN" : "en", { year: "numeric", month: "long", day: "numeric" })} · vibedesktop.online`, 800, 960);
  c.fillText(t("tour.cert.footer"), 800, 1000);
  c.save();
  c.translate(1330, 840);
  c.rotate(-0.06);
  c.fillStyle = "rgba(190, 52, 34, 0.9)";
  c.fillRect(0, 0, 130, 130);
  c.fillStyle = "#f6ead6";
  c.font = `700 52px ${serif}`;
  c.fillText("本地", 65, 62);
  c.font = `700 30px ${serif}`;
  c.fillText("VIBE", 65, 108);
  c.restore();
  return canvas;
}
