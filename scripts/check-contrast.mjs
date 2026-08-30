#!/usr/bin/env node
// @ts-check
/**
 * Contrast check for the design system.
 *
 * Reads the semantic token layer out of `src/app/globals.css`, resolves each
 * token through its alias chain to a literal colour, composites any translucent
 * value over its declared backdrop, and reports the WCAG 2.2 contrast ratio for
 * every declared pair.
 *
 * The pairs are declared here rather than discovered, because only a human
 * knows which foreground is meant to sit on which surface. A pair that is not
 * declared is not checked — so adding a surface means adding its pairs.
 *
 * Usage: node scripts/check-contrast.mjs [--report] [path/to/globals.css]
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const explicitPath = process.argv.slice(2).find((argument) => argument.endsWith(".css"));
const cssPath = explicitPath ? path.resolve(explicitPath) : path.join(process.cwd(), "src/app/globals.css");
const css = readFileSync(cssPath, "utf8");

/**
 * Declared pairs. `min` follows WCAG 2.2: 4.5 for body text, 3 for large text
 * and for non-text UI that carries meaning (status dots, focus rings, borders
 * that are the only affordance).
 */
const PAIRS = [
  { fg: "--text-primary", bg: "--surface-raised", min: 4.5, what: "panel body text" },
  { fg: "--text-primary", bg: "--surface-raised-2", min: 4.5, what: "panel text on the secondary surface" },
  { fg: "--text-secondary", bg: "--surface-raised", min: 4.5, what: "secondary panel text" },
  { fg: "--text-faint", bg: "--surface-raised", min: 3, what: "faint panel text (large / decorative only)" },
  { fg: "--text-on-canvas", bg: "--surface-canvas", min: 4.5, what: "desktop text on the canvas" },
  { fg: "--text-on-canvas-muted", bg: "--surface-canvas", min: 4.5, what: "muted desktop text" },
  { fg: "--text-on-accent", bg: "--accent-base", min: 4.5, what: "label on an accent button" },
  { fg: "--accent-base", bg: "--surface-canvas", min: 3, what: "accent as a non-text signal on the canvas" },
  { fg: "--accent-alt", bg: "--surface-canvas", min: 3, what: "alert accent on the canvas" },
  { fg: "--state-running", bg: "--surface-canvas", min: 3, what: "running status dot" },
  { fg: "--state-starting", bg: "--surface-canvas", min: 3, what: "starting status dot" },
  { fg: "--state-stopped", bg: "--surface-canvas", min: 3, what: "stopped status dot" },
  { fg: "--state-failed", bg: "--surface-canvas", min: 3, what: "failed status dot" },
  { fg: "--state-stale", bg: "--surface-canvas", min: 3, what: "stale status dot" },
  { fg: "--border-focus", bg: "--surface-canvas", min: 3, what: "focus ring on the canvas" },
  { fg: "--border-focus-raised", bg: "--surface-raised", min: 3, what: "focus ring on a paper panel" },
  { fg: "--border-focus-raised", bg: "--surface-raised-2", min: 3, what: "focus ring on the secondary panel surface" }
];

function declaredValue(name) {
  const match = new RegExp(`^\\s*${name}:\\s*([^;]+);`, "m").exec(css);
  if (!match) throw new Error(`token ${name} is not declared`);
  return match[1].trim();
}

function resolve(name, depth = 0) {
  if (depth > 8) throw new Error(`token ${name} does not resolve to a literal colour`);
  const value = declaredValue(name);
  const alias = /^var\((--[a-z0-9-]+)\)$/.exec(value);
  return alias ? resolve(alias[1], depth + 1) : value;
}

/** @returns {[number, number, number, number]} r,g,b,a with channels 0-255 */
function parseColor(value) {
  const hex = /^#([0-9a-f]{3,8})$/i.exec(value.trim());
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3) digits = digits.split("").map((d) => d + d).join("");
    const int = parseInt(digits.slice(0, 6), 16);
    const alpha = digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1;
    return [(int >> 16) & 255, (int >> 8) & 255, int & 255, alpha];
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(value.trim());
  if (rgb) {
    const parts = rgb[1].split(",").map((part) => Number(part.trim()));
    return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
  }
  throw new Error(`cannot parse colour: ${value}`);
}

/** Flattens a translucent foreground over its backdrop. */
function composite(fg, bg) {
  const [fr, fgn, fb, fa] = fg;
  const [br, bgn, bb] = bg;
  return [fr * fa + br * (1 - fa), fgn * fa + bgn * (1 - fa), fb * fa + bb * (1 - fa), 1];
}

function relativeLuminance([r, g, b]) {
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(fg, bg) {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Per-theme check for desktop icon labels.
 *
 * Labels do not sit on a token: they sit on a translucent label pill
 * (`rgba(19, 17, 15, 0.42)` in the `.desktop-icon > span` rule) over whatever
 * the active theme's wallpaper paints. The honest worst case per theme is the
 * lightest stop of its gradient, so the check composites the pill over that
 * stop and measures the label text against the result. The vignette scrims are
 * ignored — they fade to transparent mid-canvas, so only the pill is a layer a
 * label can rely on everywhere.
 */
function themeLabelChecks() {
  const themeSource = readFileSync(path.join(process.cwd(), "src/lib/theme-data.ts"), "utf8");
  // There are two `.desktop-icon > span` rules; the pill is the one whose own
  // block declares a background. Search block-locally so the match cannot leak
  // into an unrelated later rule.
  let pill = null;
  for (const match of css.matchAll(/\.desktop-icon > span \{([^}]*)\}/g)) {
    const background = /background:\s*(rgba?\([^)]+\))/.exec(match[1]);
    if (background) pill = parseColor(background[1]);
  }
  if (!pill) throw new Error("cannot find the icon label pill background in globals.css");
  const label = parseColor(resolve("--text-on-canvas"));

  const checks = [];
  for (const block of themeSource.split(/\n\s*\{\n/).slice(1)) {
    const id = /id:\s*"([^"]+)"/.exec(block)?.[1];
    const background = /backgroundCss:\s*\n?\s*"([^"]*)"/.exec(block)?.[1];
    if (!id || !background) continue;
    const stops = background.match(/#[0-9a-fA-F]{6}\b/g);
    if (!stops) continue;

    let lightest = parseColor(stops[0]);
    for (const stop of stops.slice(1)) {
      const rgb = parseColor(stop);
      if (relativeLuminance(rgb) > relativeLuminance(lightest)) lightest = rgb;
    }
    const backdrop = composite(pill, lightest);
    checks.push({
      what: `icon label on theme "${id}" (pill over its lightest stop)`,
      ratio: contrast(label, backdrop),
      min: 4.5
    });
  }
  if (checks.length === 0) throw new Error("no themes found in theme-data.ts");
  return checks;
}

const rows = [];
let failed = false;

for (const pair of PAIRS) {
  const backdrop = parseColor(resolve(pair.bg));
  const flatBackdrop = backdrop[3] < 1 ? composite(backdrop, [0, 0, 0, 1]) : backdrop;
  const foreground = parseColor(resolve(pair.fg));
  const flatForeground = foreground[3] < 1 ? composite(foreground, flatBackdrop) : foreground;
  const ratio = contrast(flatForeground, flatBackdrop);
  const ok = ratio >= pair.min;
  if (!ok) failed = true;
  rows.push(
    `${ok ? "pass" : "FAIL"}  ${ratio.toFixed(2).padStart(6)} : 1  (min ${pair.min})  ` +
    `${pair.fg} on ${pair.bg} — ${pair.what}`
  );
}

for (const check of themeLabelChecks()) {
  const ok = check.ratio >= check.min;
  if (!ok) failed = true;
  rows.push(`${ok ? "pass" : "FAIL"}  ${check.ratio.toFixed(2).padStart(6)} : 1  (min ${check.min})  ${check.what}`);
}

if (process.argv.includes("--report") || failed) console.log(rows.join("\n"));

if (failed) {
  console.error("\nContrast below the declared minimum. Fix the token, not the check.");
  process.exit(1);
}
