/* 墨染 Ink: press and drag; particles carry ink along a noise field, mirrored
   for symmetry. The painting lives in the window, so minimizing keeps it. */
import { download, emit, glyph, h, makeNoise } from "./util.js";
import { t } from "./i18n.js";

const COLORS = [
  { id: "ink", value: [28, 26, 30] },
  { id: "cinnabar", value: [196, 52, 36] },
  { id: "azurite", value: [30, 84, 148] },
  { id: "gamboge", value: [222, 158, 22] },
  { id: "malachite", value: [34, 126, 98] }
];
const SIZES = { fine: 0.55, medium: 1, bold: 1.8 };
const PAPER = "#f2ecdf";

export function mountInk(body) {
  const noise = makeNoise(Math.floor(Math.random() * 1e6));
  const canvas = h("canvas", { class: "ink-canvas", "aria-label": t("ink.hint") });
  const ctx = canvas.getContext("2d");
  let color = COLORS[0];
  let symmetry = 1;
  let size = SIZES.medium;
  let particles = [];
  let raf = 0;
  let painted = false;
  let dpr = 1;

  const swatches = COLORS.map((entry) => h("button", {
    type: "button",
    class: `ink-swatch swatch-${entry.id}`,
    "aria-pressed": String(entry === color),
    "aria-label": t(`ink.colors.${entry.id}`),
    title: t(`ink.colors.${entry.id}`),
    onClick: (event) => {
      color = entry;
      for (const other of swatches) other.setAttribute("aria-pressed", String(other === event.currentTarget));
    }
  }));
  const segmented = (label, options, initial, onPick) => {
    const buttons = options.map(([value, text]) => h("button", {
      type: "button",
      "aria-pressed": String(value === initial),
      text,
      onClick: (event) => {
        onPick(value);
        for (const other of buttons) other.setAttribute("aria-pressed", String(other === event.currentTarget));
      }
    }));
    return h("div", { class: "segmented", role: "group", "aria-label": label }, h("span", { class: "segmented-label", text: label }), buttons);
  };
  const toolbar = h("div", { class: "ink-tools" },
    h("div", { class: "ink-swatches", role: "group", "aria-label": t("ink.color") }, swatches),
    segmented(t("ink.symmetry"), [[1, "1"], [2, "2"], [6, "6"]], 1, (value) => { symmetry = value; }),
    segmented(t("ink.size"), [["fine", t("ink.fine")], ["medium", t("ink.medium")], ["bold", t("ink.bold")]], "medium", (value) => { size = SIZES[value]; }),
    h("span", { class: "spacer" }),
    h("button", { type: "button", class: "tool-button", onClick: clear }, glyph("trash"), t("ink.clear")),
    h("button", { type: "button", class: "tool-button", onClick: save }, glyph("save"), t("ink.save"))
  );
  const hint = h("p", { class: "ink-hint", text: t("ink.hint") });
  const stage = h("div", { class: "ink-stage" }, canvas, hint);
  body.append(toolbar, stage);

  function paper() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < canvas.width * canvas.height * 0.002; i++) {
      ctx.fillStyle = `rgba(120, 96, 60, ${Math.random() * 0.08})`;
      ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 1, 1);
    }
    ctx.restore();
  }

  function fit() {
    const rect = stage.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    dpr = Math.min(devicePixelRatio || 1, 2);
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);
    if (canvas.width === width && canvas.height === height) return;
    const keep = canvas.width > 0 && painted ? copy() : null;
    canvas.width = width;
    canvas.height = height;
    paper();
    if (keep) ctx.drawImage(keep, 0, 0);
  }

  function copy() {
    const node = document.createElement("canvas");
    node.width = canvas.width;
    node.height = canvas.height;
    node.getContext("2d").drawImage(canvas, 0, 0);
    return node;
  }

  function clear() {
    particles = [];
    painted = false;
    hint.hidden = false;
    paper();
  }

  function save() {
    canvas.toBlob((blob) => {
      if (blob) download(blob, "vibe-ink.png");
    }, "image/png");
  }

  let last = null;
  canvas.addEventListener("pointerdown", (event) => {
    canvas.setPointerCapture(event.pointerId);
    last = point(event);
    hint.hidden = true;
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!last) return;
    const next = point(event);
    const vx = next.x - last.x;
    const vy = next.y - last.y;
    const speed = Math.hypot(vx, vy);
    const count = Math.min(10, 2 + Math.floor(speed / 3));
    for (let i = 0; i < count; i++) {
      const f = i / count;
      particles.push({
        x: last.x + vx * f + (Math.random() - 0.5) * 3 * dpr,
        y: last.y + vy * f + (Math.random() - 0.5) * 3 * dpr,
        vx: vx * 0.25 + (Math.random() - 0.5) * dpr,
        vy: vy * 0.25 + (Math.random() - 0.5) * dpr,
        life: 1,
        decay: 0.008 + Math.random() * 0.02,
        width: (1.4 + Math.random() * 3.2) * size * dpr
      });
    }
    if (particles.length > 1400) particles.splice(0, particles.length - 1400);
    last = next;
    if (!painted) {
      painted = true;
      emit("ink:stroke", {});
    }
    if (!raf) raf = requestAnimationFrame(step);
  });
  const release = () => { last = null; };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  function point(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * dpr, y: (event.clientY - rect.top) * dpr };
  }

  function step(now) {
    raf = 0;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const [r, g, b] = color.value;
    ctx.lineCap = "round";
    ctx.globalCompositeOperation = "multiply";
    for (const p of particles) {
      const angle = noise(p.x * 0.004 / dpr, p.y * 0.004 / dpr + now * 0.00005) * Math.PI * 2;
      p.vx = p.vx * 0.9 + Math.cos(angle) * 0.6 * dpr;
      p.vy = p.vy * 0.9 + Math.sin(angle) * 0.6 * dpr;
      const nx = p.x + p.vx;
      const ny = p.y + p.vy;
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.05 + p.life * 0.22})`;
      ctx.lineWidth = Math.max(0.3, p.width * p.life);
      for (let k = 0; k < symmetry; k++) {
        const angleK = (Math.PI * 2 * k) / symmetry;
        for (const mirror of symmetry === 1 ? [1] : [1, -1]) {
          ctx.beginPath();
          const [ax, ay] = rotate(p.x - cx, (p.y - cy) * mirror, angleK);
          const [bx, by] = rotate(nx - cx, (ny - cy) * mirror, angleK);
          ctx.moveTo(cx + ax, cy + ay);
          ctx.lineTo(cx + bx, cy + by);
          ctx.stroke();
        }
      }
      p.x = nx;
      p.y = ny;
      p.life -= p.decay;
    }
    ctx.globalCompositeOperation = "source-over";
    particles = particles.filter((p) => p.life > 0);
    if (particles.length) raf = requestAnimationFrame(step);
  }

  const rotate = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

  const observer = new ResizeObserver(fit);
  observer.observe(stage);
  requestAnimationFrame(fit);

  return {
    unmount() {
      observer.disconnect();
      cancelAnimationFrame(raf);
    }
  };
}
