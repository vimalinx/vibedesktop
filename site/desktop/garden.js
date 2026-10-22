/* 声之花园 Sound Garden: a circular sequencer. Angle is time, distance is pitch
   (pentatonic, so every garden sounds in tune). Audio starts on first touch. */
import { emit, glyph, h } from "./util.js";
import { t } from "./i18n.js";

const RINGS = 10;
const SCALE = [0, 2, 4, 7, 9];
const HUES = [338, 18, 44, 76, 150, 178, 200, 222, 256, 290];

export function mountGarden(body) {
  const canvas = h("canvas", { class: "garden-canvas", "aria-label": t("garden.hint") });
  const ctx = canvas.getContext("2d");
  let seeds = [];
  let loop = 8000;
  let playing = true;
  let audio = null;
  let raf = 0;
  let sweep = 0;
  let lastTime = performance.now();
  let dpr = 1;
  let planted = false;

  const playButton = h("button", { type: "button", class: "tool-button", onClick: togglePlay });
  const tempoValue = h("output", { class: "tempo-value" });
  const tempo = h("input", { type: "range", min: "4", max: "14", step: "1", value: "8", "aria-label": t("garden.tempo") });
  tempo.addEventListener("input", () => {
    loop = Number(tempo.value) * 1000;
    tempoValue.textContent = t("garden.seconds", { n: tempo.value });
  });
  tempoValue.textContent = t("garden.seconds", { n: 8 });
  const tools = h("div", { class: "garden-tools" },
    playButton,
    h("button", { type: "button", class: "tool-button", onClick: randomTune }, glyph("sparkle"), t("garden.random")),
    h("button", { type: "button", class: "tool-button", onClick: () => { seeds = []; } }, glyph("trash"), t("garden.clear")),
    h("label", { class: "tempo" }, h("span", { text: t("garden.tempo") }), tempo, tempoValue)
  );
  const hint = h("p", { class: "garden-hint", text: t("garden.hint") });
  const soundChip = h("button", { type: "button", class: "garden-sound", onClick: () => ensureAudio() }, glyph("music"), t("garden.soundOn"));
  const stage = h("div", { class: "garden-stage" }, canvas, soundChip);
  body.append(tools, stage, hint);
  renderPlay();

  function renderPlay() {
    playButton.replaceChildren(glyph(playing ? "pause" : "play"), playing ? t("garden.pause") : t("garden.play"));
  }

  function togglePlay() {
    playing = !playing;
    renderPlay();
    ensureAudio();
  }

  function ensureAudio() {
    soundChip.hidden = true;
    if (audio) {
      if (audio.ctx.state === "suspended") void audio.ctx.resume();
      return;
    }
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    const context = new Context();
    const master = context.createGain();
    master.gain.value = 0.22;
    const delay = context.createDelay(1);
    delay.delayTime.value = 0.28;
    const feedback = context.createGain();
    feedback.gain.value = 0.32;
    const wet = context.createGain();
    wet.gain.value = 0.35;
    delay.connect(feedback).connect(delay);
    master.connect(context.destination);
    master.connect(delay);
    delay.connect(wet).connect(context.destination);
    audio = { ctx: context, master };
  }

  function sing(ring) {
    if (!audio || audio.ctx.state !== "running") return;
    const { ctx: context, master } = audio;
    const step = SCALE[ring % SCALE.length] + 12 * Math.floor(ring / SCALE.length);
    const frequency = 220 * Math.pow(2, (step + 3) / 12);
    const now = context.currentTime;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.5, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
    gain.connect(master);
    for (const [type, detune, level] of [["sine", 0, 1], ["triangle", 7, 0.35]]) {
      const osc = context.createOscillator();
      const oscGain = context.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      osc.detune.value = detune;
      oscGain.gain.value = level;
      osc.connect(oscGain).connect(gain);
      osc.start(now);
      osc.stop(now + 1.7);
    }
  }

  function geometry() {
    const w = canvas.width;
    const hh = canvas.height;
    const radius = Math.min(w, hh) * 0.44;
    return { cx: w / 2, cy: hh / 2, inner: radius * 0.16, radius };
  }

  canvas.addEventListener("pointerdown", (event) => {
    ensureAudio();
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * dpr;
    const y = (event.clientY - rect.top) * dpr;
    const { cx, cy, inner, radius } = geometry();
    const hit = seeds.findIndex((seed) => {
      const [sx, sy] = position(seed);
      return Math.hypot(sx - x, sy - y) < 14 * dpr;
    });
    if (hit >= 0) {
      seeds.splice(hit, 1);
      return;
    }
    const d = Math.hypot(x - cx, y - cy);
    if (d < inner * 0.6 || d > radius * 1.08) return;
    const ring = Math.max(0, Math.min(RINGS - 1, Math.round(((d - inner) / (radius - inner)) * (RINGS - 1))));
    const angle = (Math.atan2(y - cy, x - cx) + Math.PI * 2.5) % (Math.PI * 2);
    seeds.push({ angle, ring, bloom: performance.now() });
    sing(ring);
    if (!planted) {
      planted = true;
      emit("garden:plant", {});
    }
  });

  function position(seed) {
    const { cx, cy, inner, radius } = geometry();
    const r = inner + ((radius - inner) * seed.ring) / (RINGS - 1);
    const a = seed.angle - Math.PI / 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  }

  function randomTune(event) {
    if (event) ensureAudio();
    seeds = [];
    const steps = 16;
    let ring = 4;
    for (let i = 0; i < steps; i++) {
      if (Math.random() < 0.3) continue;
      ring = Math.max(0, Math.min(RINGS - 1, ring + Math.round((Math.random() - 0.5) * 4)));
      seeds.push({ angle: (i / steps) * Math.PI * 2 + 0.02, ring, bloom: 0 });
      if (Math.random() < 0.25) seeds.push({ angle: (i / steps) * Math.PI * 2 + 0.02, ring: Math.max(0, ring - 3), bloom: 0 });
    }
    if (!playing) {
      playing = true;
      renderPlay();
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = now - lastTime;
    lastTime = now;
    const before = sweep;
    if (playing) sweep = (sweep + (dt / loop) * Math.PI * 2) % (Math.PI * 2);
    const wrapped = sweep < before;
    if (playing) {
      for (const seed of seeds) {
        const crossed = wrapped ? seed.angle > before || seed.angle <= sweep : seed.angle > before && seed.angle <= sweep;
        if (crossed) {
          seed.bloom = now;
          sing(seed.ring);
        }
      }
    }
    draw(now);
  }

  function draw(now) {
    const { cx, cy, inner, radius } = geometry();
    ctx.fillStyle = "#08090f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < RINGS; i++) {
      const r = inner + ((radius - inner) * i) / (RINGS - 1);
      ctx.strokeStyle = `hsla(${HUES[i]}, 70%, 70%, 0.12)`;
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
      ctx.strokeStyle = i % 4 === 0 ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.04)";
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
      ctx.stroke();
    }
    const a = sweep - Math.PI / 2;
    const trail = ctx.createConicGradient ? ctx.createConicGradient(a - 0.6, cx, cy) : null;
    if (trail) {
      trail.addColorStop(0, "rgba(200, 255, 61, 0)");
      trail.addColorStop(0.095, "rgba(200, 255, 61, 0.18)");
      trail.addColorStop(0.0955, "rgba(200, 255, 61, 0)");
      ctx.fillStyle = trail;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(200, 255, 61, 0.85)";
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    ctx.stroke();

    for (const seed of seeds) {
      const [x, y] = position(seed);
      const hue = HUES[seed.ring];
      const age = (now - seed.bloom) / 900;
      if (age >= 0 && age < 1) {
        const petals = 6;
        const reach = (10 + 26 * age) * dpr;
        ctx.strokeStyle = `hsla(${hue}, 90%, 72%, ${1 - age})`;
        ctx.lineWidth = 2 * dpr * (1 - age) + 0.5;
        for (let p = 0; p < petals; p++) {
          const pa = (p / petals) * Math.PI * 2 + seed.angle;
          ctx.beginPath();
          ctx.ellipse(x + Math.cos(pa) * reach * 0.5, y + Math.sin(pa) * reach * 0.5, reach * 0.5, reach * 0.18, pa, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      const glow = age >= 0 && age < 1 ? 1 - age : 0;
      ctx.fillStyle = `hsla(${hue}, 85%, ${62 + glow * 20}%, 1)`;
      ctx.beginPath();
      ctx.arc(x, y, (5 + glow * 4) * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(200, 255, 61, 0.9)";
    ctx.beginPath();
    ctx.arc(cx, cy, inner * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  function fit() {
    const rect = stage.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }

  const observer = new ResizeObserver(fit);
  observer.observe(stage);
  requestAnimationFrame(() => {
    fit();
    randomTune();
    raf = requestAnimationFrame(frame);
  });

  return {
    unmount() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      if (audio) void audio.ctx.close();
    }
  };
}
