import type { DesktopTheme, ShellStyle, ThemeId } from "@/lib/contracts";
import { desktopThemes } from "@/lib/theme-data";

/**
 * A style pack is data over the semantic token layer: token overrides plus a
 * handful of enumerated switches the shell reads as root data attributes. A
 * pack may not ship component CSS — anything a pack cannot express is a
 * missing token, and the fix is in the token layer.
 */
export interface StylePack {
  id: string;
  /** The legacy theme this pack absorbs; stored `themeId`s keep working. */
  themeId: ThemeId;
  tokens: Record<string, string>;
  backgroundCss: string;
  iconShape: "squircle" | "circle" | "square" | "sheet";
  windowChrome: "glass" | "solid" | "outline" | "minimal";
  density: "comfortable" | "regular" | "compact";
  motion: "full" | "subtle" | "none";
  preview: { swatches: string[] };
}

/**
 * First generation: one pack per shipped theme, derived from the theme table
 * so the two cannot drift while both exist. Every pack reproduces today's
 * appearance exactly — the switches all sit at their current values, and the
 * tokens carry what the shell already applied inline (accent pair +
 * background). Distinct-character packs land on top of this mapping, not
 * beside it.
 */
/** Per-pack switch overrides: where a pack's character diverges from the
    absorbed-theme default. Everything else stays at today's values. */
const SWITCHES: Partial<Record<string, Pick<StylePack, "iconShape" | "windowChrome" | "density" | "motion">>> = {
  "studio-airy": { iconShape: "circle", windowChrome: "outline", density: "comfortable", motion: "subtle" },
  "noir-dense": { iconShape: "square", windowChrome: "solid", density: "compact", motion: "none" }
};

export const stylePacks: readonly StylePack[] = desktopThemes.map((theme: DesktopTheme) => ({
  id: theme.id,
  themeId: theme.id,
  tokens: {
    "--theme-accent": theme.swatches[2] ?? "#c8ff3d",
    "--theme-accent-2": theme.swatches[3] ?? "#e8dfcc"
  },
  backgroundCss: theme.backgroundCss,
  iconShape: "squircle",
  windowChrome: "glass",
  density: "regular",
  motion: "full",
  ...SWITCHES[theme.id],
  preview: { swatches: theme.swatches }
}));

export function resolveStylePack(themeId: string): StylePack {
  return stylePacks.find((pack) => pack.themeId === themeId) ?? stylePacks[0];
}

/** Root data attributes the shell stamps so CSS can react per switch. */
export function packDataAttributes(pack: StylePack, shellStyle: ShellStyle): Record<string, string> {
  return {
    "data-style-pack": pack.id,
    "data-icon-shape": pack.iconShape,
    "data-window-chrome": pack.windowChrome,
    "data-density": pack.density,
    "data-motion": pack.motion,
    "data-shell": shellStyle
  };
}

/** Fonts users may choose — ids resolved to declared stacks, never free text. */
export const fontOptions: Record<string, string> = {
  geist: '"Geist", "Helvetica Neue", sans-serif',
  system: "system-ui, sans-serif",
  mono: '"Geist Mono", "SF Mono", monospace'
};

export class StyleOverrideError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StyleOverrideError";
  }
}

function luminance(hex: string): number {
  const int = parseInt(hex.slice(1), 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel((int >> 16) & 255) + 0.7152 * channel((int >> 8) & 255) + 0.0722 * channel(int & 255);
}

/**
 * Server-side validation for user style overrides. An accent must be a 6-digit
 * hex and keep 3:1 against the dark canvas, where it carries non-text meaning
 * (focus ring, signals) — a failing value is rejected with the measured ratio,
 * never silently corrected. Fonts must be a known id.
 */
export function validateStyleOverrides(input: { accentOverride?: string | null; fontOverride?: string | null }): void {
  if (input.accentOverride != null) {
    if (!/^#[0-9a-fA-F]{6}$/.test(input.accentOverride)) {
      throw new StyleOverrideError("Accent must be a 6-digit hex colour.");
    }
    const canvas = luminance("#13110f");
    const accent = luminance(input.accentOverride);
    const [hi, lo] = accent > canvas ? [accent, canvas] : [canvas, accent];
    const ratio = (hi + 0.05) / (lo + 0.05);
    if (ratio < 3) {
      throw new StyleOverrideError(`Accent contrast on the desktop is ${ratio.toFixed(2)}:1; at least 3:1 is required.`);
    }
  }
  if (input.fontOverride != null && !(input.fontOverride in fontOptions)) {
    throw new StyleOverrideError("Unknown font choice.");
  }
}
