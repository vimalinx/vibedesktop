/* Shared helpers for the vibedesktop.online web desktop. Everything renders
   through h()/textContent; no string ever becomes HTML. */

export const bus = new EventTarget();

export function emit(type, detail = {}) {
  bus.dispatchEvent(new CustomEvent(type, { detail }));
}

export function on(type, listener) {
  const handler = (event) => listener(event.detail);
  bus.addEventListener(type, handler);
  return () => bus.removeEventListener(type, handler);
}

export function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "rich") node.append(...rich(value));
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) node.setAttribute(key, "");
    else node.setAttribute(key, String(value));
  }
  appendAll(node, children);
  return node;
}

function appendAll(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
}

const SVG_NS = "http://www.w3.org/2000/svg";

export function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null) node.setAttribute(key, String(value));
  }
  appendAll(node, children);
  return node;
}

/** Our own copy may use `code` and **bold**; both become real elements. */
export function rich(text) {
  const out = [];
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*/g;
  let last = 0;
  let match;
  while ((match = pattern.exec(text))) {
    if (match.index > last) out.push(document.createTextNode(text.slice(last, match.index)));
    out.push(match[1] !== undefined ? h("code", { text: match[1] }) : h("strong", { text: match[2] }));
    last = pattern.lastIndex;
  }
  if (last < text.length) out.push(document.createTextNode(text.slice(last)));
  return out;
}

/* Browser storage holds per-visitor conveniences only, and may be unavailable. */
export const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(`vd.${key}`);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`vd.${key}`, JSON.stringify(value));
    } catch {
      /* private window or blocked storage: the desktop still works */
    }
  }
};

export const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const compactQuery = matchMedia("(max-width: 760px), (max-height: 520px)");
export const isCompact = () => compactQuery.matches;
export const onCompactChange = (listener) => compactQuery.addEventListener("change", listener);

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = h("a", { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded 2D Perlin noise in roughly [-1, 1]. */
export function makeNoise(seed) {
  const random = mulberry32(seed);
  const p = Array.from({ length: 256 }, (_, index) => index);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;
  const grad = (hash, x, y) => {
    const g = hash & 7;
    const u = g < 4 ? x : y;
    const v = g < 4 ? y : x;
    return ((g & 1) ? -u : u) + ((g & 2) ? -v : v);
  };
  return (x, y) => {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = fade(x);
    const v = fade(y);
    const a = perm[X] + Y;
    const b = perm[X + 1] + Y;
    return lerp(
      lerp(grad(perm[a], x, y), grad(perm[b], x - 1, y), u),
      lerp(grad(perm[a + 1], x, y - 1), grad(perm[b + 1], x - 1, y - 1), u),
      v
    );
  };
}

/* ----- Glyphs: 24×24 stroke icons drawn for this site ----- */

const GLYPHS = {
  star: "M12 3.5l2.5 5.3 5.8.7-4.3 4 1.1 5.7L12 16.4l-5.1 2.8 1.1-5.7-4.3-4 5.8-.7z",
  bag: "M5 8h14l-1.2 12H6.2zM9 8V6.5a3 3 0 016 0V8",
  download: "M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14",
  brush: "M14.5 4.5l5 5-7.8 7.8-5-5zM6.7 12.3c-2.2.4-3.2 2.2-3.2 4.2 0 1.4-.5 2.4-1 3 3.6.4 6.7-.7 7.4-2.4",
  flower: "M12 13.5a2 2 0 100-4 2 2 0 000 4zM12 9.5c-1-3 0-5.5 0-5.5s1 2.5 0 5.5zM14 11.5c3-1 5.5 0 5.5 0s-2.5 1-5.5 0zM12 13.5c1 3 0 5.5 0 5.5s-1-2.5 0-5.5zM10 11.5c-3 1-5.5 0-5.5 0s2.5-1 5.5 0z",
  image: "M4 5h16v14H4zM4 15.5l4.5-4.5 4 4 2.5-2.5 5 5M15.5 9.5a1.2 1.2 0 100-.1",
  grid: "M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6zM13.5 13.5h6v6h-6z",
  globe: "M12 20.5a8.5 8.5 0 100-17 8.5 8.5 0 000 17zM3.5 12h17M12 3.5c2.4 2.4 3.4 5.2 3.4 8.5s-1 6.1-3.4 8.5c-2.4-2.4-3.4-5.2-3.4-8.5s1-6.1 3.4-8.5z",
  code: "M8.5 7.5L4 12l4.5 4.5M15.5 7.5L20 12l-4.5 4.5M13.5 5l-3 14",
  branch: "M7 4.5v15M7 9.5c0 3 10 2 10 6.5M17 8.5a2 2 0 100-4 2 2 0 000 4zM7 21.5a2 2 0 100-4 2 2 0 000 4z",
  spiral: "M12 12c0-1 1.5-1.4 2-.4.8 1.6-1 3.4-2.8 2.9-2.6-.8-2.6-4.4-.4-5.6 3.1-1.7 6.7.9 6.4 4.3-.4 4.4-5.6 6.4-9 4.2C3.9 15 4.2 8.5 8.6 6.2c4.8-2.5 11 .4 11.6 6",
  wind: "M3.5 9h11a2.5 2.5 0 10-2.5-2.5M3.5 13h15a2.5 2.5 0 11-2.5 2.5M3.5 17h7",
  pen: "M4.5 19.5l1-4.5L16 4.5 19.5 8 9 18.5zM13.5 7l3.5 3.5",
  book: "M5 4.5h5.5a2 2 0 012 2v13a2 2 0 00-2-2H5zM19 4.5h-5.5a2 2 0 00-1 .3M19 4.5v13h-5.5a2 2 0 00-1 .3",
  play: "M8 5.5v13l10.5-6.5z",
  pause: "M8 5.5v13M16 5.5v13",
  close: "M6 6l12 12M18 6L6 18",
  minimize: "M6 12.5h12",
  maximize: "M6 6h12v12H6z",
  restore: "M8.5 8.5h9.5v9.5H8.5zM6 15.5V6h9.5",
  external: "M13.5 5H19v5.5M19 5l-8.5 8.5M17 14v5H5V7h5",
  refresh: "M19 12a7 7 0 11-2.1-5M19 4.5V9h-4.5",
  search: "M10.5 17a6.5 6.5 0 100-13 6.5 6.5 0 000 13zM15.5 15.5L20 20",
  plus: "M12 5v14M5 12h14",
  check: "M5 12.5l4.5 4.5L19 7",
  trash: "M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7",
  save: "M5 4.5h11.5L19.5 7.5v12H5zM8 4.5v5h7v-5M8 19.5v-6h8v6",
  sparkle: "M12 3c.6 4.3 2.7 6.4 7 7-4.3.6-6.4 2.7-7 7-.6-4.3-2.7-6.4-7-7 4.3-.6 6.4-2.7 7-7zM18.5 15.5c.3 1.6 1 2.3 2.5 2.5-1.6.3-2.3 1-2.5 2.5-.3-1.6-1-2.3-2.5-2.5 1.6-.3 2.3-1 2.5-2.5z",
  folder: "M3.5 6.5h6l2 2h9v10.5h-17z",
  terminal: "M4 5h16v14H4zM7.5 9.5l3 2.5-3 2.5M12.5 15h4",
  shield: "M12 3.5l7 2.5v5.5c0 4.6-3 7.8-7 9-4-1.2-7-4.4-7-9V6z",
  layers: "M12 4l8.5 4.5L12 13 3.5 8.5zM3.5 12.5L12 17l8.5-4.5M3.5 16.5L12 21l8.5-4.5",
  windows: "M3.5 5.5h11v9h-11zM9.5 9.5h11v9h-11z",
  info: "M12 20.5a8.5 8.5 0 100-17 8.5 8.5 0 000 17zM12 11v5.5M12 7.6v.1",
  music: "M9 17.5V5.5l10-2v12M9 17.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM19 15.5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z",
  sand: "M5 19.5h14M7 19.5c1-4 3-5.5 5-5.5s4 1.5 5 5.5M12 4v2M8 6.5l1 1.5M16 6.5l-1 1.5M12 9.5v1",
  keys: "M3.5 7h17v10h-17zM7 10.5h.1M10.5 10.5h.1M14 10.5h.1M17.5 10.5h.1M8 14h8",
  map: "M3.5 6.5l5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2zM9 4.5v13M15 6.5v13",
  calc: "M5.5 3.5h13v17h-13zM8.5 7h7M8.5 11h.1M12 11h.1M15.5 11h.1M8.5 14.5h.1M12 14.5h.1M15.5 14.5h.1M8.5 18h.1M12 18h3.5",
  wave: "M3 12c2-5 4-5 6 0s4 5 6 0 4-5 6 0",
  tv: "M4 7h16v11H4zM8.5 3.5L12 7l3.5-3.5M9 21h6",
  scroll: "M7 4.5h11v13a2.5 2.5 0 01-2.5 2.5H6.5A2.5 2.5 0 014 17.5V16h11v1.5a2.5 2.5 0 002.5 2.5M7 4.5A2.5 2.5 0 004.5 7v1H7M10 9h5M10 12.5h5",
  lang: "M4 6h9M8.5 4v2M6 6c.5 3 2.5 5.5 5.5 6.5M11 6c-.5 3-2.5 5.5-6 7M13 20l3.5-8 3.5 8M14 17.5h5"
};

export function glyph(name, className = "glyph") {
  return svg(
    "svg",
    { class: className, viewBox: "0 0 24 24", "aria-hidden": "true", focusable: "false" },
    svg("path", { d: GLYPHS[name] || GLYPHS.sparkle })
  );
}

/** An app tile: gradient square plus glyph, colours from a CSS tint class. */
export function tile(glyphName, tint, className = "vd-tile") {
  return h("span", { class: `${className} tint-${tint}`, "aria-hidden": "true" }, glyph(glyphName));
}
