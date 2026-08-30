import type { CSSProperties } from "react";
import type { Desktop, DesktopPayload } from "@/lib/contracts";
import { accentBase, surfaceRaised2 } from "@/lib/design-tokens";
import {
  readLocalJson,
  resolveWallpaper,
  wallpaperDrivesBackground
} from "@/lib/desktop-helpers";
import { fontOptions, packDataAttributes, resolveStylePack } from "@/lib/style-packs";

/**
 * The one place desktop styling is resolved and applied.
 *
 * This is the seam the style-pack work plugs into: the shell asks for a class
 * list and a style object, and how those are derived — theme, shell style,
 * wallpaper source, future pack and per-user overrides — stays in here. The
 * customization child replaces the localStorage overrides below with
 * server-persisted ones without touching the shell.
 */

export interface DesktopStyleResolution {
  className: string;
  style: CSSProperties;
  dataAttributes: Record<string, string>;
}

export function resolveDesktopStyle(
  payload: DesktopPayload,
  localWallpaper: string | undefined
): DesktopStyleResolution {
  const desktop: Desktop = payload.desktop;
  const wallpaper = resolveWallpaper(payload.wallpapers, desktop.wallpaperBuiltinId);
  const pack = resolveStylePack(desktop.themeId);
  const background =
    desktop.wallpaperKind === "custom_local" && localWallpaper
      ? `url(${localWallpaper})`
      : wallpaperDrivesBackground(desktop)
        ? wallpaper.cssValue
        : (pack.backgroundCss ?? wallpaper.cssValue);

  return {
    className: `desktop theme-${desktop.themeId} shell-${desktop.shellStyle} grain-overlay`,
    style: {
      backgroundImage: background,
      "--theme-accent": pack.tokens["--theme-accent"] ?? accentBase,
      "--theme-accent-2": pack.tokens["--theme-accent-2"] ?? surfaceRaised2,
      ...pack.tokens,
      ...(desktop.accentOverride ? { "--theme-accent": desktop.accentOverride } : {}),
      ...(desktop.fontOverride && fontOptions[desktop.fontOverride]
        ? { "--font-sans": fontOptions[desktop.fontOverride] }
        : {})
    } as CSSProperties,
    dataAttributes: packDataAttributes(pack, desktop.shellStyle)
  };
}

/**
 * Client-only overrides the settings panel writes today (font, accent). They
 * are browser-local and therefore lost on another machine — a known gap owned
 * by the style-customization child, which moves them server-side. Kept here so
 * the only writer of document-level style is this module.
 */
export function applyLocalStyleOverrides(): void {
  const customFont = readLocalJson<string>("vd:custom-font", "");
  if (customFont) document.documentElement.style.setProperty("--font-sans", customFont);
  const customAccent = readLocalJson<string>("vd:custom-accent", "");
  if (customAccent) document.documentElement.style.setProperty("--theme-accent", customAccent);
}
