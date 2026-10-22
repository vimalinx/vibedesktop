/* 小 V: a desktop pet shaped like the logo — the arc is its body, the two dots
   its eyes. It wanders, naps, can be thrown, and rides on window title bars. */
import { emit, h, on, reducedMotion, store, svg } from "./util.js";
import { lang } from "./i18n.js";
import { getInsets } from "./wm.js";

const LINES = {
  zh: [
    "前端在跑，后端也在跑，完美。",
    "端口 5173 又被占了？交给我。",
    "我只住在 127.0.0.1。",
    "关掉终端前，先看看是谁在跑。",
    "健康检查通过才算启动成功哦。",
    "把我拖到窗口上，我可以坐着兜风。",
    "要不要去「诗签」抽一支？",
    "「端口接接乐」的纪录是多少来着？",
    "装失败了也不怕，会自动回滚的。",
    "别在周五部署……",
    "我是用 SVG 画的，不吃内存。",
    "你的源码我一个字都不会改。"
  ],
  en: [
    "Frontend up, backend up. Perfect.",
    "Port 5173 taken again? Leave it to me.",
    "I only live on 127.0.0.1.",
    "Before closing a terminal, check who's running in it.",
    "It only counts as started once the health check passes.",
    "Drag me onto a window and I'll ride along.",
    "Fancy drawing a poem lot?",
    "What's your Port Catcher record?",
    "A failed install? It rolls back. Relax.",
    "Never deploy on a Friday…",
    "I'm drawn in SVG. I eat no memory.",
    "I will never change a line of your source."
  ]
};
const REACTIONS = {
  "storm:tamed": { zh: "整整齐齐，舒服了！", en: "So tidy. Lovely!" },
  "import:done": { zh: "又多了一个图标！", en: "Another icon on the desk!" },
  "market:installed": { zh: "装好了，健康检查全绿。", en: "Installed, all health checks green." },
  "manifest:fixed": { zh: "这份 app.json 可以上架了！", en: "That app.json is market-ready!" },
  "install:copied": { zh: "装好记得叫我！", en: "Call me once it's installed!" },
  "catcher:record": { zh: "新纪录！我就知道你行。", en: "New record! Knew you could." },
  "poem:drawn": { zh: "让我看看是什么签……", en: "Ooh, what did you draw?" }
};

const SIZE = 64;
let node = null;
let bubble = null;
let raf = 0;
let state = null;
let enabled = true;

export const petEnabled = () => enabled;

export function setPetEnabled(value) {
  enabled = value;
  store.set("pet", value);
  if (value) startPet();
  else stopPet();
}

export function initPet() {
  enabled = store.get("pet", true) !== false;
  for (const [event, text] of Object.entries(REACTIONS)) {
    on(event, () => {
      if (!state) return;
      hop();
      say(text[lang] || text.en);
    });
  }
  on("pet:poke", () => {
    if (!state) setPetEnabled(true);
    hop();
    say(lang === "zh" ? "我在这儿！点我、拖我，或者把我扔到窗口上。" : "Over here! Click me, drag me, or toss me onto a window.");
  });
  on("window:close", ({ id }) => {
    if (state?.ride?.id === id) fall();
  });
  on("window:minimize", ({ id }) => {
    if (state?.ride?.id === id) fall();
  });
  if (enabled) startPet();
}

function floor() {
  return innerHeight - getInsets().bottom - 6;
}

function startPet() {
  if (node) return;
  const eyes = [svg("circle", { cx: 22, cy: 40, r: 7, class: "pet-eye-gold" }), svg("circle", { cx: 42, cy: 40, r: 7, class: "pet-eye-blue" })];
  const pupils = [svg("circle", { cx: 22, cy: 40, r: 2.6, class: "pet-pupil" }), svg("circle", { cx: 42, cy: 40, r: 2.6, class: "pet-pupil" })];
  const lids = svg("path", { d: "M15 40h14M35 40h14", class: "pet-lids" });
  const graphic = svg("svg", { viewBox: "0 0 64 64", class: "pet-svg", "aria-hidden": "true" },
    svg("ellipse", { cx: 32, cy: 60, rx: 20, ry: 3, class: "pet-shadow" }),
    svg("path", { d: "M8 50C8 26 18 14 32 14s24 12 24 36z", class: "pet-body" }),
    svg("path", { d: "M14 38c5-16 31-16 36 0", class: "pet-arc" }),
    eyes, pupils, lids,
    svg("ellipse", { cx: 15, cy: 49, rx: 4, ry: 2.2, class: "pet-blush" }),
    svg("ellipse", { cx: 49, cy: 49, rx: 4, ry: 2.2, class: "pet-blush" }),
    svg("ellipse", { cx: 23, cy: 54, rx: 5, ry: 3, class: "pet-foot foot-left" }),
    svg("ellipse", { cx: 41, cy: 54, rx: 5, ry: 3, class: "pet-foot foot-right" }));
  node = h("button", { type: "button", class: "vd-pet", "aria-label": lang === "zh" ? "桌面宠物小 V，点一下和它说话" : "Little V, the desktop pet. Click to chat." }, graphic);
  bubble = h("p", { class: "vd-pet-bubble", role: "status", "aria-live": "polite", hidden: true });
  document.body.append(node, bubble);
  state = { x: 120, y: floor(), vx: 0, vy: 0, mode: "idle", until: performance.now() + 2500, target: 120, facing: 1, idleSince: performance.now(), ride: null, pupils, look: { x: 0, y: 0 } };
  wireInput();
  raf = requestAnimationFrame(step);
  setTimeout(() => say(lang === "zh" ? "嗨，我是小 V！点我、拖我都行。" : "Hi, I'm Little V! Click me or drag me around."), 1800);
}

function stopPet() {
  cancelAnimationFrame(raf);
  node?.remove();
  bubble?.remove();
  node = null;
  bubble = null;
  state = null;
}

let bubbleTimer = 0;
function say(text) {
  if (!bubble) return;
  bubble.textContent = text;
  bubble.hidden = false;
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => { if (bubble) bubble.hidden = true; }, 3600);
  wake();
}

function wake() {
  if (!state) return;
  state.idleSince = performance.now();
  if (state.mode === "sleep") {
    state.mode = "idle";
    state.until = performance.now() + 800;
  }
}

function hop() {
  if (!state || state.mode === "drag") return;
  wake();
  if (state.mode !== "fall") {
    state.vy = -7;
    state.mode = "fall";
    state.ride = null;
  }
}

function fall() {
  if (!state) return;
  state.ride = null;
  state.mode = "fall";
  state.vy = Math.min(state.vy, 0);
}

function wireInput() {
  let press = null;
  let lastClick = 0;
  node.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    node.setPointerCapture(event.pointerId);
    press = { x: event.clientX, y: event.clientY, dx: state.x - event.clientX, dy: state.y - event.clientY, moved: false, last: [] };
    wake();
  });
  node.addEventListener("pointermove", (event) => {
    if (!press) return;
    if (!press.moved && Math.hypot(event.clientX - press.x, event.clientY - press.y) < 5) return;
    press.moved = true;
    state.mode = "drag";
    state.ride = null;
    state.x = Math.max(30, Math.min(innerWidth - 30, event.clientX + press.dx));
    state.y = Math.max(SIZE, Math.min(innerHeight, event.clientY + press.dy));
    press.last.push({ x: event.clientX, y: event.clientY, t: performance.now() });
    if (press.last.length > 5) press.last.shift();
  });
  const release = () => {
    if (!press) return;
    if (press.moved) {
      const [a, b] = [press.last[0], press.last[press.last.length - 1]];
      const dt = a && b ? Math.max(16, b.t - a.t) : 16;
      const cap = (v) => Math.max(-12, Math.min(12, v));
      state.vx = a && b ? cap(((b.x - a.x) / dt) * 16) : 0;
      state.vy = a && b ? cap(((b.y - a.y) / dt) * 16) : 0;
      state.mode = "fall";
      say(lang === "zh" ? "哇——" : "Wheee—");
    } else {
      const now = performance.now();
      if (now - lastClick < 320) dance();
      else {
        hop();
        const lines = LINES[lang] || LINES.en;
        say(lines[Math.floor(Math.random() * lines.length)]);
      }
      lastClick = now;
    }
    press = null;
  };
  node.addEventListener("click", (event) => {
    if (event.detail !== 0) return;
    hop();
    const lines = LINES[lang] || LINES.en;
    say(lines[Math.floor(Math.random() * lines.length)]);
  });
  node.addEventListener("pointerup", release);
  node.addEventListener("pointercancel", release);
  addEventListener("pointermove", (event) => {
    if (!state) return;
    const dx = event.clientX - state.x;
    const dy = event.clientY - (state.y - SIZE * 0.6);
    const d = Math.hypot(dx, dy) || 1;
    state.look = { x: (dx / d) * Math.min(1, d / 200) * 2.6, y: (dy / d) * Math.min(1, d / 200) * 2.6 };
    if (d < 160) wake();
  }, { passive: true });
}

function dance() {
  if (!node || reducedMotion.matches) return;
  node.animate([{ transform: "rotate(0)" }, { transform: "rotate(360deg) scale(1.15)" }, { transform: "rotate(720deg)" }], { duration: 900, easing: "cubic-bezier(.4,0,.2,1)", composite: "add" });
  for (let i = 0; i < 16; i++) {
    const dot = h("span", { class: "vd-pet-confetti", "aria-hidden": "true" });
    dot.style.left = `${state.x}px`;
    dot.style.top = `${state.y - SIZE / 2}px`;
    dot.style.background = ["#c8ff3d", "#f8d56b", "#7cc7ff", "#a9f3d0", "#ff8fb8"][i % 5];
    document.body.append(dot);
    const a = (i / 16) * Math.PI * 2;
    dot.animate([{ transform: "translate(0,0)", opacity: 1 }, { transform: `translate(${Math.cos(a) * 90}px, ${Math.sin(a) * 90 - 30}px)`, opacity: 0 }],
      { duration: 900, easing: "cubic-bezier(.1,.8,.3,1)" }).finished.then(() => dot.remove(), () => dot.remove());
  }
  say(lang === "zh" ? "转圈圈！" : "Spin!");
  emit("pet:dance", {});
}

/** The highest visible window top edge under x, between the pet's last and next y. */
function landing(x, fromY, toY) {
  let best = null;
  for (const win of document.querySelectorAll(".vd-win:not([hidden])")) {
    const rect = win.getBoundingClientRect();
    if (x < rect.left + 12 || x > rect.right - 12) continue;
    if (rect.top >= fromY - 1 && rect.top <= toY && (!best || rect.top < best.top)) best = { top: rect.top, el: win };
  }
  return best;
}

function step(now) {
  raf = requestAnimationFrame(step);
  if (!state || document.hidden) return;
  const ground = floor();
  const motion = !reducedMotion.matches;
  if (state.mode === "drag") {
    /* follows the pointer */
  } else if (state.mode === "fall") {
    const nextY = state.y + state.vy;
    state.vy = Math.min(18, state.vy + 0.5);
    state.x += state.vx;
    state.vx *= 0.98;
    if (state.y < SIZE + 4 && state.vy < 0) {
      state.vy = -state.vy * 0.3;
      state.y = SIZE + 4;
    }
    if (state.x < 30 || state.x > innerWidth - 30) {
      state.vx = -state.vx * 0.5;
      state.x = Math.max(30, Math.min(innerWidth - 30, state.x));
    }
    const hit = state.vy > 0 ? landing(state.x, state.y, nextY) : null;
    if (hit) {
      const rect = hit.el.getBoundingClientRect();
      state.ride = { id: hit.el.dataset.win, el: hit.el, offset: state.x - rect.left };
      state.y = rect.top;
      state.mode = "ride";
      state.vx = 0;
      say(lang === "zh" ? "这个窗口坐着挺舒服。" : "Comfy window, this one.");
    } else if (nextY >= ground) {
      state.y = ground;
      state.mode = "idle";
      state.vx = 0;
      state.until = now + 1500;
    } else {
      state.y = nextY;
    }
  } else if (state.mode === "ride") {
    const el = state.ride.el;
    if (!el.isConnected || el.hidden) fall();
    else {
      const rect = el.getBoundingClientRect();
      state.x = Math.max(rect.left + 20, Math.min(rect.right - 20, rect.left + state.ride.offset));
      state.y = rect.top;
    }
  } else if (state.y < ground - 2 || state.y > ground + 2) {
    state.mode = "fall";
    state.vy = 0;
  } else if (state.mode === "sleep") {
    /* zzz */
  } else if (now - state.idleSince > 30000) {
    state.mode = "sleep";
    say("Zzz…");
  } else if (state.mode === "walk" && motion) {
    const dir = Math.sign(state.target - state.x);
    state.facing = dir || state.facing;
    state.x += dir * 0.8;
    if (Math.abs(state.target - state.x) < 1) {
      state.mode = "idle";
      state.until = now + 2000 + Math.random() * 4000;
    }
  } else if (now > state.until && motion) {
    state.mode = "walk";
    state.target = 60 + Math.random() * (innerWidth - 120);
  }
  render(now);
}

function render(now) {
  const walking = state.mode === "walk";
  const bob = walking ? Math.abs(Math.sin(now * 0.012)) * -3 : state.mode === "idle" ? Math.sin(now * 0.003) * 1.2 : 0;
  node.style.transform = `translate(${Math.round(state.x - SIZE / 2)}px, ${Math.round(state.y - SIZE + bob)}px) scaleX(${state.facing < 0 ? -1 : 1})`;
  node.dataset.mode = state.mode;
  const look = state.mode === "sleep" ? { x: 0, y: 0 } : state.look;
  state.pupils[0].setAttribute("cx", String(22 + look.x * (state.facing < 0 ? -1 : 1)));
  state.pupils[1].setAttribute("cx", String(42 + look.x * (state.facing < 0 ? -1 : 1)));
  state.pupils[0].setAttribute("cy", String(40 + look.y));
  state.pupils[1].setAttribute("cy", String(40 + look.y));
  if (!bubble.hidden) {
    bubble.style.left = `${Math.round(Math.max(110, Math.min(innerWidth - 110, state.x)))}px`;
    bubble.style.top = `${Math.round(state.y - SIZE - 12)}px`;
  }
}
