/* 端口接接乐 Port Catcher: catch a frontend and a backend to make an app; dodge
   the errors. Mouse, touch or arrow keys. Best score stays in this browser. */
import { emit, glyph, h, store } from "./util.js";
import { lang, t } from "./i18n.js";

const KINDS = {
  web: { color: "#88b7ff", ink: "#08142c", labels: ["web :5173", "web :3000", "vite :5174", "next :3001"] },
  api: { color: "#f2c75c", ink: "#2a1c00", labels: ["api :8000", "api :5000", "flask :5001", "uvicorn :8080"] },
  bug: { color: "#ff6b6b", ink: "#2b0505", labels: ["EADDRINUSE", "502", "ECONNREFUSED", "Traceback", "OOM"] }
};

export function mountCatcher(body) {
  const canvas = h("canvas", { class: "catcher-canvas", tabindex: "0", "aria-label": t("catcher.title") });
  const ctx = canvas.getContext("2d");
  const overlay = h("div", { class: "catcher-overlay" });
  const stage = h("div", { class: "catcher-stage" }, canvas, overlay);
  body.append(stage);

  let dpr = 1;
  let W = 0;
  let H = 0;
  let raf = 0;
  let last = 0;
  let game = null;
  let best = Number(store.get("catcherBest", 0)) || 0;
  const keys = new Set();

  function fit() {
    const rect = stage.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = canvas.width = Math.round(rect.width * dpr);
    H = canvas.height = Math.round(rect.height * dpr);
    if (game) game.tray = Math.min(game.tray, W);
    draw();
  }

  function menu(title, lines, button) {
    overlay.hidden = false;
    const start = h("button", { type: "button", class: "button primary" }, glyph("play"), button);
    start.addEventListener("click", begin);
    overlay.replaceChildren(h("div", { class: "catcher-card" },
      h("h3", { text: title }),
      lines.map((line) => h("p", { text: line })),
      start));
    requestAnimationFrame(() => start.focus({ preventScroll: true }));
  }

  function begin() {
    overlay.hidden = true;
    game = { score: 0, lives: 3, apps: 0, combo: 0, held: null, chips: [], pops: [], tray: W / 2, spawnIn: 600, speed: 2.2 * dpr, elapsed: 0, shake: 0 };
    canvas.focus({ preventScroll: true });
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function over() {
    cancelAnimationFrame(raf);
    const record = game.score > best;
    if (record) {
      best = game.score;
      store.set("catcherBest", best);
      emit("catcher:record", { score: best });
    }
    menu(record ? t("catcher.record") : t("catcher.over"), [
      t("catcher.result", { score: game.score, apps: game.apps }),
      t("catcher.best", { best })
    ], t("catcher.again"));
  }

  function spawn() {
    const roll = Math.random();
    const bugChance = Math.min(0.38, 0.18 + game.elapsed / 120000);
    const want = game.held === "web" ? "api" : game.held === "api" ? "web" : null;
    const kind = roll < bugChance ? "bug" : want && Math.random() < 0.6 ? want : Math.random() < 0.5 ? "web" : "api";
    const spec = KINDS[kind];
    game.chips.push({ kind, label: spec.labels[Math.floor(Math.random() * spec.labels.length)], x: (40 + Math.random() * (W / dpr - 80)) * dpr, y: -20 * dpr, vy: game.speed * (0.8 + Math.random() * 0.5) });
  }

  function pop(text, x, y, color) {
    game.pops.push({ text, x, y, color, age: 0 });
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(48, now - last);
    last = now;
    if (document.hidden || stage.offsetParent === null) return;
    const g = game;
    g.elapsed += dt;
    g.speed = (2.2 + g.elapsed / 14000) * dpr;
    if (keys.has("ArrowLeft")) g.tray -= 9 * dpr * (dt / 16);
    if (keys.has("ArrowRight")) g.tray += 9 * dpr * (dt / 16);
    const trayW = 120 * dpr;
    g.tray = Math.max(trayW / 2, Math.min(W - trayW / 2, g.tray));
    g.spawnIn -= dt;
    if (g.spawnIn <= 0) {
      spawn();
      g.spawnIn = Math.max(340, 900 - g.elapsed / 60);
    }
    const trayY = H - 44 * dpr;
    for (const chip of g.chips) {
      chip.y += chip.vy * (dt / 16);
      if (!chip.done && chip.y >= trayY - 12 * dpr && chip.y <= trayY + 14 * dpr && Math.abs(chip.x - g.tray) < trayW / 2 + 30 * dpr) {
        chip.done = true;
        catchChip(chip);
      }
      if (!chip.done && chip.y > H + 30 * dpr) {
        chip.done = true;
        if (chip.kind !== "bug") g.combo = 0;
      }
    }
    g.chips = g.chips.filter((chip) => !chip.done);
    g.pops = g.pops.filter((p) => (p.age += dt) < 900);
    g.shake = Math.max(0, g.shake - dt);
    draw();
    if (g.lives <= 0) over();
  }

  function catchChip(chip) {
    const g = game;
    if (chip.kind === "bug") {
      g.lives -= 1;
      g.combo = 0;
      g.held = null;
      g.shake = 300;
      pop(lang === "zh" ? "接到报错！" : "Caught an error!", chip.x, chip.y, KINDS.bug.color);
      return;
    }
    g.score += 1;
    if (g.held && g.held !== chip.kind) {
      g.combo += 1;
      g.apps += 1;
      const bonus = 5 * g.combo;
      g.score += bonus;
      g.held = null;
      pop(`${t("catcher.pair")} +${bonus}`, chip.x, chip.y, "#c8ff3d");
    } else {
      g.held = chip.kind;
      pop(`+1 ${chip.kind}`, chip.x, chip.y, KINDS[chip.kind].color);
    }
  }

  function roundRect(x, y, w, hh, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, hh, r);
  }

  function draw() {
    if (!W) return;
    ctx.save();
    if (game?.shake) ctx.translate((Math.random() - 0.5) * 10 * dpr, 0);
    ctx.fillStyle = "#07090f";
    ctx.fillRect(-20, 0, W + 40, H);
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = dpr;
    for (let x = 0; x < W; x += 32 * dpr) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    if (game) {
      ctx.font = `700 ${12 * dpr}px ui-monospace, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const chip of game.chips) {
        const spec = KINDS[chip.kind];
        const width = ctx.measureText(chip.label).width + 22 * dpr;
        ctx.fillStyle = spec.color;
        roundRect(chip.x - width / 2, chip.y - 13 * dpr, width, 26 * dpr, 13 * dpr);
        ctx.fill();
        ctx.fillStyle = spec.ink;
        ctx.fillText(chip.label, chip.x, chip.y + dpr);
      }
      const trayW = 120 * dpr;
      const trayY = H - 44 * dpr;
      ctx.strokeStyle = "#a9f3d0";
      ctx.lineWidth = 8 * dpr;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(game.tray - trayW / 2, trayY);
      ctx.quadraticCurveTo(game.tray, trayY + 26 * dpr, game.tray + trayW / 2, trayY);
      ctx.stroke();
      ctx.fillStyle = game.held === "web" ? KINDS.web.color : "rgba(248, 213, 107, 0.35)";
      ctx.beginPath();
      ctx.arc(game.tray - 16 * dpr, trayY + 6 * dpr, 7 * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = game.held === "api" ? KINDS.api.color : "rgba(124, 199, 255, 0.35)";
      ctx.beginPath();
      ctx.arc(game.tray + 16 * dpr, trayY + 6 * dpr, 7 * dpr, 0, Math.PI * 2);
      ctx.fill();
      for (const p of game.pops) {
        ctx.globalAlpha = 1 - p.age / 900;
        ctx.fillStyle = p.color;
        ctx.font = `800 ${15 * dpr}px system-ui, sans-serif`;
        ctx.fillText(p.text, p.x, p.y - (p.age / 900) * 40 * dpr);
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = "left";
      ctx.fillStyle = "#f3f0e8";
      ctx.font = `700 ${14 * dpr}px system-ui, sans-serif`;
      ctx.fillText(`${t("catcher.score")} ${game.score}   ${t("catcher.apps")} ${game.apps}   ${"♥".repeat(Math.max(0, game.lives))}`, 14 * dpr, 20 * dpr);
      ctx.textAlign = "right";
      ctx.fillStyle = "#a9aaa5";
      ctx.fillText(`${t("catcher.bestShort")} ${best}`, W - 14 * dpr, 20 * dpr);
    }
    ctx.restore();
  }

  canvas.addEventListener("pointermove", (event) => {
    if (!game) return;
    const rect = canvas.getBoundingClientRect();
    game.tray = (event.clientX - rect.left) * dpr;
  });
  canvas.addEventListener("pointerdown", (event) => {
    if (!game) return;
    const rect = canvas.getBoundingClientRect();
    game.tray = (event.clientX - rect.left) * dpr;
  });
  canvas.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      keys.add(event.key);
    }
  });
  canvas.addEventListener("keyup", (event) => keys.delete(event.key));

  const observer = new ResizeObserver(fit);
  observer.observe(stage);
  requestAnimationFrame(fit);
  menu(t("catcher.title"), [t("catcher.rule1"), t("catcher.rule2"), t("catcher.best", { best })], t("catcher.start"));
  return {
    unmount() {
      cancelAnimationFrame(raf);
      observer.disconnect();
    }
  };
}
