import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { accentAlt, accentBase, stateColors, surfaceCanvas, surfaceRaised, surfaceRaised2 } from "@/lib/design-tokens";

/**
 * The TS mirror exists because a few values are needed before or outside CSS.
 * A mirror that drifts is worse than no mirror, so this resolves each token
 * through the stylesheet's own alias chain and compares the result.
 */
const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

function declaredValue(name: string): string {
  const match = new RegExp(`^\\s*${name.replace(/[-]/g, "\\-")}:\\s*([^;]+);`, "m").exec(css);
  if (!match) throw new Error(`token ${name} is not declared in globals.css`);
  return match[1].trim();
}

/** Follows `var(--x)` aliases until a literal value is reached. */
function resolve(name: string, depth = 0): string {
  if (depth > 8) throw new Error(`token ${name} does not resolve to a literal`);
  const value = declaredValue(name);
  const alias = /^var\((--[a-z0-9-]+)\)$/.exec(value);
  return alias ? resolve(alias[1], depth + 1) : value;
}

describe("design tokens", () => {
  it.each([
    ["--surface-canvas", surfaceCanvas],
    ["--surface-raised", surfaceRaised],
    ["--surface-raised-2", surfaceRaised2],
    ["--accent-base", accentBase],
    ["--accent-alt", accentAlt],
    ["--state-running", stateColors.running],
    ["--state-starting", stateColors.starting],
    ["--state-stopped", stateColors.stopped],
    ["--state-failed", stateColors.failed],
    ["--state-stale", stateColors.stale],
    ["--state-offline", stateColors.offline]
  ])("%s matches its TypeScript mirror", (token, mirrored) => {
    expect(resolve(token)).toBe(mirrored);
  });

  it("declares every semantic group the design contract requires", () => {
    for (const token of [
      "--surface-canvas",
      "--text-primary",
      "--border-hairline",
      "--accent-base",
      "--state-running",
      "--elevation-1",
      "--radius-tile",
      "--space-4",
      "--type-body",
      "--motion-base",
      "--ease-standard",
      "--blur-panel"
    ]) {
      expect(() => declaredValue(token)).not.toThrow();
    }
  });

  it("routes every motion duration through the reduced-motion switch", () => {
    for (const token of ["--motion-fast", "--motion-base", "--motion-slow"]) {
      expect(declaredValue(token)).toContain("var(--motion-enabled)");
    }
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{\s*--motion-enabled: 0;/);
  });
});
