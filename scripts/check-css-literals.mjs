#!/usr/bin/env node
// @ts-check
/**
 * Literal guard for the design system.
 *
 * Component rules must express colour, motion, shape and blur through the
 * semantic tokens in `src/app/globals.css`. This check counts the literals that
 * remain and fails when a category grows past its recorded budget, so the debt
 * can only shrink.
 *
 * Two contexts are budgeted separately on purpose:
 *
 *   - Plain declarations. A colour or duration here is a design decision that a
 *     style pack must be able to change, so the budget is meant to reach zero.
 *   - Shadow and gradient values. These are per-component depth and texture
 *     built from many stops; tokenizing each stop would create a hundred
 *     meaningless names. Elevation tokens cover the shared cases; the rest is
 *     recorded debt, not a licence to add more.
 *
 * Usage: node scripts/check-css-literals.mjs [--report]
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const explicitPath = process.argv.slice(2).find((argument) => argument.endsWith(".css"));
const cssPath = explicitPath ? path.resolve(explicitPath) : path.join(process.cwd(), "src/app/globals.css");
const source = readFileSync(cssPath, "utf8");

/** Budgets recorded 2026-07-26 after the token migration. Lower them, never raise. */
const BUDGETS = {
  "color:plain": 82,
  "color:depth": 63,
  "duration:plain": 11,
  "duration:animation": 22,
  "easing:plain": 0,
  "blur:plain": 1,
  "radius:plain": 8,
  "font-family:plain": 0,
  /* Component rules must reach the semantic tier, not the raw palette: a style
     pack overrides semantics, so a rule bound to a primitive is a rule a pack
     cannot restyle. */
  "primitive-reference": 0
};

/** Strip comments so prose examples never trip the guard. */
function withoutComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** The @theme block is the primitive tier: literals belong there. */
function withoutThemeBlock(text) {
  const start = text.indexOf("@theme");
  if (start === -1) return text;
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(0, start) + text.slice(i + 1);
    }
  }
  return text;
}

const body = withoutThemeBlock(withoutComments(source));

const counts = Object.fromEntries(Object.keys(BUDGETS).map((key) => [key, 0]));
const samples = {};

for (const raw of body.split(";")) {
  const declaration = raw.trim();
  const colon = declaration.indexOf(":");
  if (colon === -1) continue;
  const property = declaration.slice(0, colon).split(/[{}\n]/).pop().trim().toLowerCase();
  const value = declaration.slice(colon + 1);
  if (property.startsWith("--")) continue; // the token tier itself
  if (!property || property.startsWith("@")) continue;

  const isDepth = /shadow/.test(property) || /gradient\(/.test(value);
  const isAnimation = property === "animation" || property.startsWith("animation-");
  const bucket = (kind) =>
    kind === "color" ? (isDepth ? "color:depth" : "color:plain")
    : kind === "duration" ? (isAnimation ? "duration:animation" : "duration:plain")
    : `${kind}:plain`;

  const found = [
    ["color", value.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g)],
    ["duration", value.match(/(?<![\w-])\d+(?:\.\d+)?m?s(?![\w-])/g)],
    ["easing", value.match(/(?<![-\w(])(?:ease-in-out|ease-out|ease-in|ease)(?![-\w])|cubic-bezier\([^)]*\)/g)],
    ["blur", value.match(/blur\(\s*\d/g)],
    ["font-family", property === "font-family" ? value.match(/"[^"]+"/g) : null]
  ];

  for (const [kind, matches] of found) {
    if (!matches) continue;
    const key = bucket(kind);
    counts[key] += matches.length;
    if (!samples[key]) samples[key] = `${property}:${value.trim().slice(0, 60)}`;
  }

  const primitives = value.match(/var\(\s*--color-[a-z0-9-]+/g);
  if (primitives) {
    counts["primitive-reference"] += primitives.length;
    samples["primitive-reference"] ??= `${property}:${value.trim().slice(0, 60)}`;
  }

  if (property === "border-radius" && /(?<![\w-])\d+px/.test(value)) {
    counts["radius:plain"] += (value.match(/(?<![\w-])\d+px/g) || []).length;
    samples["radius:plain"] ??= `${property}:${value.trim().slice(0, 60)}`;
  }
}

let failed = false;
const report = [];
for (const [key, budget] of Object.entries(BUDGETS)) {
  const actual = counts[key];
  const status = actual > budget ? "OVER" : actual < budget ? "STALE" : "at";
  report.push(`${key.padEnd(20)} ${String(actual).padStart(4)} / ${String(budget).padEnd(4)} ${status}`);
  if (actual > budget) {
    failed = true;
    console.error(
      `CSS literal budget exceeded: ${key} is ${actual}, budget ${budget}.\n` +
      `  Use a semantic token from the token layer instead of a literal.\n` +
      `  Example of this category: ${samples[key] ?? "(none)"}`
    );
  }
  // A budget with slack is a budget that stops catching the next literal, so
  // the ratchet is enforced in both directions: improve the sheet, lower the
  // number in the same commit. It only applies to the product stylesheet —
  // budgets describe that file, not an arbitrary path passed for a test.
  if (actual < budget && !explicitPath) {
    failed = true;
    console.error(`CSS literal budget is stale: ${key} is now ${actual}. Lower its budget from ${budget} to ${actual}.`);
  }
}

if (process.argv.includes("--report") || failed) {
  console.log(report.join("\n"));
}

if (failed) {
  console.error("\nIf a literal is genuinely unavoidable, add the token instead and lower the budget.");
  process.exit(1);
}
