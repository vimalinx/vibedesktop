import type { DesktopApp } from "@/lib/contracts";
import { AppIcon } from "@/components/desktop/desktop-icon";

/**
 * Content for a multi-cell "app" tile. A larger footprint earns more
 * information — title plus the app's description or host — never a scaled-up
 * icon. Falls back to plain text derivation so it renders truthfully even when
 * the app has no description.
 */
export function AppTileContent({ app, localUrl, title }: { app: DesktopApp; localUrl?: string; title: string }) {
  const subtitle = app.description || hostOf(app.url);
  const tall = app.spanRows > 1;
  return (
    <span className={`app-tile ${tall ? "is-tall" : "is-wide"}`}>
      <AppIcon app={app} localUrl={localUrl} />
      <span className="app-tile-text">
        <strong>{title}</strong>
        {subtitle ? <small>{subtitle}</small> : null}
      </span>
    </span>
  );
}

function hostOf(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}
