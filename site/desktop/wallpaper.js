/* Generative wallpapers. Each mood is a pure function of its seed, painted on
   one canvas behind the desktop at ≤30 fps, and still when motion is reduced. */
import { emit, makeNoise, mulberry32, reducedMotion, store } from "./util.js";

export const MOODS = ["shanshui", "aurora", "stars", "riso"];
const SCALE = { shanshui: 1, aurora: 0.25, stars: 1, riso: 0.5 };

let canvas = null;
let ctx = null;
let mood = "shanshui";
let seed = 1022;
let animated = true;
let scene = null;
let raf = 0;
let last = 0;
let W = 0;
let H = 0;
let scale = 1;
const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, px: -9999, py: -9999 };

export function startWallpaper(target) {
  canvas = target;
  ctx = canvas.getContext("2d");
  const savedMood = store.get("wallpaper", "shanshui");
  mood = MOODS.includes(savedMood) ? savedMood : "shanshui";
  const savedSeed = store.get("wallpaperSeed", 1022);
  seed = Number.isInteger(savedSeed) ? savedSeed : 1022;
  animated = store.get("wallpaperAnimated", true) !== false;
  let resizeTimer = 0;
  addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(build, 160);
  });
  addEventListener("pointermove", (event) => {
    pointer.tx = event.clientX / innerWidth;
    pointer.ty = event.clientY / innerHeight;
    pointer.px = event.clientX;
    pointer.py = event.clientY;
  }, { passive: true });
  document.addEventListener("pointerleave", () => { pointer.px = -9999; pointer.py = -9999; });
  document.addEventListener("visibilitychange", schedule);
  reducedMotion.addEventListener("change", schedule);
  build();
}

export const getWallpaper = () => ({ mood, seed, animated });

export function setWallpaper(nextMood, nextSeed = seed) {
  if (!MOODS.includes(nextMood)) return;
  mood = nextMood;
  seed = nextSeed;
  store.set("wallpaper", mood);
  store.set("wallpaperSeed", seed);
  canvas.classList.add("is-fading");
  setTimeout(() => {
    build();
    canvas.classList.remove("is-fading");
  }, reducedMotion.matches ? 0 : 280);
  emit("wallpaper:change", { mood, seed });
}

export function nextWallpaper() {
  setWallpaper(MOODS[(MOODS.indexOf(mood) + 1) % MOODS.length]);
  return mood;
}

export function setAnimated(value) {
  animated = value;
  store.set("wallpaperAnimated", value);
  schedule();
  emit("wallpaper:change", { mood, seed });
}

/** Paint one still frame of a mood into a small preview canvas. */
export function paintPreview(target, previewMood, previewSeed) {
  const context = target.getContext("2d");
  const preview = MAKERS[previewMood](previewSeed, target.width, target.height, target.width / 1440);
  preview.frame(context, target.width, target.height, 9000, { x: 0.5, y: 0.5, px: -9999, py: -9999 });
}

function build() {
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  scale = SCALE[mood] === 1 ? dpr : SCALE[mood];
  W = Math.max(1, Math.round(innerWidth * scale));
  H = Math.max(1, Math.round(innerHeight * scale));
  canvas.width = W;
  canvas.height = H;
  canvas.dataset.mood = mood;
  scene = MAKERS[mood](seed, W, H, scale);
  render(performance.now());
  schedule();
}

const running = () => animated && !reducedMotion.matches && !document.hidden;

function schedule() {
  cancelAnimationFrame(raf);
  if (scene && running()) raf = requestAnimationFrame(tick);
  else if (scene) render(performance.now());
}

function tick(now) {
  raf = requestAnimationFrame(tick);
  if (now - last < 33) return;
  last = now;
  render(now);
}

function render(now) {
  pointer.x += (pointer.tx - pointer.x) * 0.06;
  pointer.y += (pointer.ty - pointer.y) * 0.06;
  scene.frame(ctx, W, H, now, { x: pointer.x, y: pointer.y, px: pointer.px * scale, py: pointer.py * scale });
}

function layer(width, height) {
  const node = document.createElement("canvas");
  node.width = Math.max(1, Math.round(width));
  node.height = Math.max(1, Math.round(height));
  return node;
}

/* ----- 夜山 Night Mountains: ink-wash ridges, mist, moon and fireflies ----- */

function shanshui(seedValue, W, H, s) {
  const rand = mulberry32(seedValue);
  const noise = makeNoise(seedValue);
  const unit = Math.min(W, H);
  const moon = { x: W * (0.6 + rand() * 0.26), y: H * (0.14 + rand() * 0.1), r: unit * 0.045 };

  const sky = layer(W, H);
  const skyCtx = sky.getContext("2d");
  const gradient = skyCtx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, "#080c19");
  gradient.addColorStop(0.42, "#141d36");
  gradient.addColorStop(0.7, "#2a3150");
  gradient.addColorStop(1, "#141a2a");
  skyCtx.fillStyle = gradient;
  skyCtx.fillRect(0, 0, W, H);
  const halo = skyCtx.createRadialGradient(moon.x, moon.y, moon.r, moon.x, moon.y, moon.r * 9);
  halo.addColorStop(0, "rgba(240, 228, 196, 0.22)");
  halo.addColorStop(1, "rgba(240, 228, 196, 0)");
  skyCtx.fillStyle = halo;
  skyCtx.fillRect(0, 0, W, H);
  skyCtx.fillStyle = "#efe5cb";
  skyCtx.beginPath();
  skyCtx.arc(moon.x, moon.y, moon.r, 0, Math.PI * 2);
  skyCtx.fill();
  skyCtx.fillStyle = "rgba(20, 28, 54, 0.14)";
  for (let i = 0; i < 5; i++) {
    skyCtx.beginPath();
    skyCtx.arc(moon.x + (rand() - 0.5) * moon.r, moon.y + (rand() - 0.5) * moon.r, moon.r * (0.12 + rand() * 0.2), 0, Math.PI * 2);
    skyCtx.fill();
  }

  const stars = Array.from({ length: 150 }, () => ({ x: rand() * W, y: rand() * H * 0.55, r: (0.3 + rand() * 1.1) * s, p: rand() * 6.28, v: 0.4 + rand() * 1.8 }));

  const palette = [
    ["rgba(84, 101, 140, 0.55)", "rgba(42, 52, 82, 0.3)"],
    ["rgba(58, 73, 108, 0.78)", "rgba(28, 36, 60, 0.7)"],
    ["rgba(36, 48, 76, 0.92)", "rgba(18, 25, 44, 0.95)"],
    ["rgba(20, 29, 48, 1)", "rgba(10, 15, 27, 1)"],
    ["rgba(9, 13, 22, 1)", "rgba(4, 6, 11, 1)"]
  ];
  const margin = W * 0.06;
  const layers = palette.map(([top, bottom], i) => {
    const node = layer(W + margin * 2, H);
    const c = node.getContext("2d");
    const base = H * (0.5 + i * 0.095);
    const amp = H * (0.2 - i * 0.022);
    const freq = (1.3 + i * 0.75) / W;
    const ridge = [];
    for (let x = 0; x <= node.width; x += 3) {
      let n = 0;
      let a = 1;
      let f = freq;
      for (let o = 0; o < 5; o++) {
        n += a * (1 - Math.abs(noise(x * f + i * 31.7, i * 7.3 + o * 3.1)));
        a *= 0.5;
        f *= 2.05;
      }
      ridge.push(base - amp * Math.pow(n / 1.94, 1.7) * 1.25);
    }
    const fill = c.createLinearGradient(0, base - amp, 0, H);
    fill.addColorStop(0, top);
    fill.addColorStop(1, bottom);
    c.fillStyle = fill;
    c.beginPath();
    c.moveTo(0, H);
    ridge.forEach((y, index) => c.lineTo(index * 3, y));
    c.lineTo(node.width, H);
    c.closePath();
    c.fill();
    // 皴 texture: short slanted brush marks under the ridge line.
    c.lineCap = "round";
    const marks = Math.round(node.width * 0.4);
    for (let k = 0; k < marks; k++) {
      const index = Math.floor(rand() * ridge.length);
      const x = index * 3;
      const y = ridge[index] + Math.pow(rand(), 1.6) * amp * 0.9;
      const length = (3 + rand() * 12) * s;
      c.strokeStyle = rand() < 0.5 ? `rgba(200, 212, 240, ${0.02 + rand() * 0.05})` : `rgba(0, 0, 0, ${0.08 + rand() * 0.12})`;
      c.lineWidth = (0.6 + rand() * 1.2) * s;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x - length * 0.35, y + length);
      c.stroke();
    }
    return { node, base, amp, i };
  });

  const flies = Array.from({ length: 16 }, () => ({ x: rand() * W, y: H * (0.68 + rand() * 0.26), p: rand() * 6.28, v: 0.3 + rand() * 0.7 }));
  const sealSize = 30 * s;

  return {
    frame(c, w, h, t, p) {
      c.drawImage(sky, 0, 0);
      for (const star of stars) {
        c.globalAlpha = 0.25 + 0.4 * (0.5 + 0.5 * Math.sin(t * 0.001 * star.v + star.p));
        c.fillStyle = "#f4efe0";
        c.fillRect(star.x, star.y, star.r, star.r);
      }
      c.globalAlpha = 1;
      for (const item of layers) {
        const dx = -margin + (0.5 - p.x) * (4 + item.i * 13) * s;
        const dy = (0.5 - p.y) * item.i * 3 * s;
        c.drawImage(item.node, dx, dy);
        if (item.i >= 1 && item.i <= 3) {
          for (let j = 0; j < 3; j++) {
            const span = w * 1.7;
            const x = ((t * 0.000012 * (j + 1) * w + j * w * 0.41 + item.i * w * 0.23) % span) - w * 0.35;
            const y = item.base - item.amp * (0.15 + j * 0.12);
            c.save();
            c.translate(x, y);
            c.scale(1, 0.16);
            const mist = c.createRadialGradient(0, 0, 0, 0, 0, w * 0.32);
            mist.addColorStop(0, "rgba(196, 208, 236, 0.075)");
            mist.addColorStop(1, "rgba(196, 208, 236, 0)");
            c.fillStyle = mist;
            c.fillRect(-w * 0.32, -w * 0.32, w * 0.64, w * 0.64);
            c.restore();
          }
        }
      }
      for (const fly of flies) {
        fly.p += 0.016 * fly.v;
        fly.x += Math.cos(fly.p * 0.7) * 0.35 * s;
        fly.y += Math.sin(fly.p) * 0.25 * s;
        const dx = p.px - fly.x;
        const dy = p.py - fly.y;
        const d = Math.hypot(dx, dy);
        if (d < 240 * s && d > 30 * s) {
          fly.x += (dx / d) * 0.5 * s;
          fly.y += (dy / d) * 0.5 * s;
        }
        if (fly.x < -10) fly.x = w + 10;
        if (fly.x > w + 10) fly.x = -10;
        const glow = 0.35 + 0.65 * Math.max(0, Math.sin(t * 0.0015 * fly.v + fly.p * 3));
        c.fillStyle = `rgba(214, 255, 120, ${0.12 * glow})`;
        c.beginPath();
        c.arc(fly.x, fly.y, 7 * s, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = `rgba(232, 255, 170, ${0.9 * glow})`;
        c.beginPath();
        c.arc(fly.x, fly.y, 1.5 * s, 0, Math.PI * 2);
        c.fill();
      }
      // A cinnabar seal: 本地, "local", the one rule this desktop keeps.
      const sx = w - sealSize - 26 * s;
      const sy = h * 0.58;
      c.fillStyle = "rgba(196, 58, 40, 0.86)";
      c.fillRect(sx, sy, sealSize, sealSize * 1.9);
      c.fillStyle = "rgba(248, 236, 214, 0.92)";
      c.font = `600 ${Math.round(sealSize * 0.72)}px "Noto Serif SC", "Source Han Serif SC", "Songti SC", serif`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("本", sx + sealSize / 2, sy + sealSize * 0.5);
      c.fillText("地", sx + sealSize / 2, sy + sealSize * 1.38);
    }
  };
}

/* ----- 极光 Aurora: curtains of light, painted small and scaled up soft ----- */

function aurora(seedValue, W, H) {
  const rand = mulberry32(seedValue);
  const noise = makeNoise(seedValue + 7);
  const colors = [[200, 255, 61], [110, 180, 255], [176, 132, 255], [61, 224, 192]];
  const ribbons = colors.map((rgb, i) => {
    const sprite = layer(1, 64);
    const c = sprite.getContext("2d");
    const g = c.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, `rgba(${rgb}, 0)`);
    g.addColorStop(0.7, `rgba(${rgb}, 0.55)`);
    g.addColorStop(0.92, `rgba(${rgb}, 0.9)`);
    g.addColorStop(1, `rgba(${rgb}, 0)`);
    c.fillStyle = g;
    c.fillRect(0, 0, 1, 64);
    return { sprite, y: 0.3 + i * 0.09 + rand() * 0.05, f: 0.006 + rand() * 0.006, v: 0.00012 + rand() * 0.0002, ph: rand() * 6.28, amp: 0.05 + rand() * 0.05, k: i * 13.1 };
  });
  const hills = [];
  for (let x = 0; x <= W; x += 2) hills.push(H * (0.86 + noise(x * 0.012, 3.3) * 0.06));
  return {
    frame(c, w, h, t, p) {
      c.globalCompositeOperation = "source-over";
      const sky = c.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#02040a");
      sky.addColorStop(1, "#071419");
      c.fillStyle = sky;
      c.fillRect(0, 0, w, h);
      c.globalCompositeOperation = "lighter";
      for (const r of ribbons) {
        for (let x = 0; x < w; x += 2) {
          const wave = Math.sin(x * r.f + t * r.v + r.ph) + noise(x * 0.01 + r.k, t * 0.00008) * 1.4;
          const y = h * (r.y + wave * r.amp + (p.y - 0.5) * 0.03);
          const curtain = h * (0.16 + 0.1 * (0.5 + 0.5 * Math.sin(x * 0.02 + t * 0.0004 + r.k)));
          c.globalAlpha = 0.35 + 0.25 * Math.sin(x * 0.03 - t * 0.0006 + r.ph);
          c.drawImage(r.sprite, x, y - curtain, 2, curtain * 1.15);
        }
      }
      c.globalAlpha = 1;
      c.globalCompositeOperation = "source-over";
      c.fillStyle = "#010203";
      c.beginPath();
      c.moveTo(0, h);
      hills.forEach((y, index) => c.lineTo(index * 2, y));
      c.lineTo(w, h);
      c.fill();
    }
  };
}

/* ----- 星河 Star River: a milky band, and constellations around the pointer ----- */

function stars(seedValue, W, H, s) {
  const rand = mulberry32(seedValue);
  const sky = layer(W, H);
  const c0 = sky.getContext("2d");
  const base = c0.createLinearGradient(0, 0, W, H);
  base.addColorStop(0, "#03040b");
  base.addColorStop(1, "#0a0f24");
  c0.fillStyle = base;
  c0.fillRect(0, 0, W, H);
  for (let i = 0; i < 8; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const r = (0.2 + rand() * 0.35) * Math.max(W, H);
    const g = c0.createRadialGradient(x, y, 0, x, y, r);
    const hue = 210 + rand() * 90;
    g.addColorStop(0, `hsla(${hue}, 70%, 55%, 0.09)`);
    g.addColorStop(1, `hsla(${hue}, 70%, 55%, 0)`);
    c0.fillStyle = g;
    c0.fillRect(0, 0, W, H);
  }
  const tilt = 0.35 + rand() * 0.3;
  for (let i = 0; i < 2600; i++) {
    const along = rand() * 1.4 - 0.2;
    const spread = (rand() + rand() + rand() - 1.5) * 0.12;
    const x = along * W;
    const y = H * (0.15 + along * tilt + spread);
    c0.fillStyle = `rgba(226, 232, 255, ${0.05 + rand() * 0.3})`;
    const r = (0.4 + rand() * 0.9) * s;
    c0.fillRect(x, y, r, r);
  }
  const points = Array.from({ length: 230 }, () => ({ x: rand() * W, y: rand() * H, r: (0.6 + rand() * 1.6) * s, p: rand() * 6.28, v: 0.5 + rand() * 2, dx: (rand() - 0.5) * 0.04 * s, dy: (rand() - 0.5) * 0.04 * s }));
  let meteor = null;
  let nextMeteor = 3000;
  return {
    frame(c, w, h, t, p) {
      c.drawImage(sky, 0, 0);
      const near = [];
      const reach = 180 * s;
      for (const star of points) {
        star.x = (star.x + star.dx + w) % w;
        star.y = (star.y + star.dy + h) % h;
        const twinkle = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 0.001 * star.v + star.p));
        c.fillStyle = `rgba(240, 244, 255, ${twinkle})`;
        c.beginPath();
        c.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        c.fill();
        if (Math.hypot(star.x - p.px, star.y - p.py) < reach) near.push(star);
      }
      c.lineWidth = 0.8 * s;
      for (let i = 0; i < near.length; i++) {
        for (let j = i + 1; j < near.length; j++) {
          const d = Math.hypot(near[i].x - near[j].x, near[i].y - near[j].y);
          if (d > 95 * s) continue;
          c.strokeStyle = `rgba(200, 255, 61, ${(1 - d / (95 * s)) * 0.55})`;
          c.beginPath();
          c.moveTo(near[i].x, near[i].y);
          c.lineTo(near[j].x, near[j].y);
          c.stroke();
        }
      }
      if (!meteor && t > nextMeteor) {
        meteor = { x: rand() * w * 0.8, y: rand() * h * 0.3, born: t };
        nextMeteor = t + 5000 + rand() * 6000;
      }
      if (meteor) {
        const age = (t - meteor.born) / 900;
        if (age > 1) meteor = null;
        else {
          const x = meteor.x + age * 320 * s;
          const y = meteor.y + age * 150 * s;
          const tail = c.createLinearGradient(x, y, x - 120 * s, y - 56 * s);
          tail.addColorStop(0, `rgba(255, 255, 255, ${1 - age})`);
          tail.addColorStop(1, "rgba(255, 255, 255, 0)");
          c.strokeStyle = tail;
          c.lineWidth = 1.6 * s;
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x - 120 * s, y - 56 * s);
          c.stroke();
        }
      }
    }
  };
}

/* ----- 孔版印刷 Riso Print: Bauhaus shapes in overprinted fluorescent ink ----- */

function riso(seedValue, W, H, s) {
  const rand = mulberry32(seedValue);
  const paper = layer(W, H);
  const c0 = paper.getContext("2d");
  c0.fillStyle = "#121216";
  c0.fillRect(0, 0, W, H);
  for (let i = 0; i < W * H * 0.04; i++) {
    c0.fillStyle = `rgba(255, 255, 255, ${rand() * 0.035})`;
    c0.fillRect(rand() * W, rand() * H, 1, 1);
  }
  const dots = layer(6, 6);
  const dc = dots.getContext("2d");
  dc.fillStyle = "rgba(0, 0, 0, 0.5)";
  dc.beginPath();
  dc.arc(3, 3, 1.25, 0, Math.PI * 2);
  dc.fill();
  const inks = ["#ff48b0", "#ffe800", "#0078bf", "#00a95c", "#ff6c2f"];
  const kinds = ["circle", "half", "quarter", "rect", "tri", "ring"];
  const unit = Math.min(W, H);
  const shapes = Array.from({ length: 11 }, (_, i) => ({
    kind: kinds[i % kinds.length],
    x: rand() * W,
    y: rand() * H,
    size: unit * (0.08 + rand() * 0.2),
    rot: rand() * 6.28,
    vr: (rand() - 0.5) * 0.00012,
    ink: inks[Math.floor(rand() * inks.length)],
    bob: rand() * 6.28,
    ox: 0,
    oy: 0
  }));
  let pattern = null;
  const draw = (c, shape, size) => {
    c.beginPath();
    if (shape.kind === "circle") c.arc(0, 0, size, 0, Math.PI * 2);
    else if (shape.kind === "half") c.arc(0, 0, size, 0, Math.PI);
    else if (shape.kind === "quarter") { c.moveTo(0, 0); c.arc(0, 0, size * 1.3, 0, Math.PI / 2); }
    else if (shape.kind === "rect") c.rect(-size * 0.8, -size * 0.45, size * 1.6, size * 0.9);
    else if (shape.kind === "tri") { c.moveTo(0, -size); c.lineTo(size * 0.9, size * 0.6); c.lineTo(-size * 0.9, size * 0.6); c.closePath(); }
    else { c.arc(0, 0, size, 0, Math.PI * 2); c.arc(0, 0, size * 0.62, 0, Math.PI * 2, true); }
    c.fill();
  };
  return {
    frame(c, w, h, t, p) {
      c.globalCompositeOperation = "source-over";
      c.drawImage(paper, 0, 0);
      c.globalCompositeOperation = "screen";
      for (const shape of shapes) {
        const dx = shape.x - p.px;
        const dy = shape.y - p.py;
        const d = Math.hypot(dx, dy) || 1;
        const push = Math.max(0, 1 - d / (220 * s)) * 30 * s;
        shape.ox += ((dx / d) * push - shape.ox) * 0.08;
        shape.oy += ((dy / d) * push - shape.oy) * 0.08;
        const x = shape.x + shape.ox + Math.sin(t * 0.0003 + shape.bob) * 10 * s;
        const y = shape.y + shape.oy + Math.cos(t * 0.00025 + shape.bob) * 12 * s;
        c.save();
        c.translate(x, y);
        c.rotate(shape.rot + t * shape.vr);
        c.globalAlpha = 0.88;
        c.fillStyle = shape.ink;
        draw(c, shape, shape.size);
        c.restore();
      }
      c.globalAlpha = 1;
      c.globalCompositeOperation = "multiply";
      pattern = pattern || c.createPattern(dots, "repeat");
      c.fillStyle = pattern;
      c.fillRect(0, 0, w, h);
      c.globalCompositeOperation = "source-over";
    }
  };
}

const MAKERS = { shanshui, aurora, stars, riso };
