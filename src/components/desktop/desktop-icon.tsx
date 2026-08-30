/* eslint-disable @next/next/no-img-element -- App icons may be user-uploaded data URLs, loopback favicons, or arbitrary favicon providers. */

import { useEffect, useState } from "react";
import type { DesktopApp } from "@/lib/contracts";
import { iconImageCandidates, initialsForTitle, isWeatherApp } from "@/lib/desktop-helpers";

export function AppIcon({ app, localUrl }: { app: DesktopApp; localUrl?: string }) {
  const imageCandidates = iconImageCandidates(app, localUrl);
  const [imageIndex, setImageIndex] = useState(0);
  const imageUrl = imageCandidates[imageIndex] ?? null;

  useEffect(() => {
    setImageIndex(0);
  }, [app.id, app.iconKind, app.iconUrl, app.url, localUrl]);

  if (app.iconKind === "builtin") {
    return <BuiltinIcon app={app} />;
  }

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        draggable={false}
        onError={() => setImageIndex((current) => current + 1)}
        // Reset index when the underlying candidate list changes — handled via key below.
        key={`${app.id}:${app.iconUrl ?? ""}:${localUrl ?? ""}`}
      />
    );
  }

  return <FallbackIcon title={app.title} />;
}

export function BuiltinIcon({ app }: { app: DesktopApp }) {
  if (app.iconUrl === "vd://icon/weather") {
    return <i className="built-in-icon weather-icon" aria-hidden="true" />;
  }
  if (app.iconUrl === "vd://icon/start-board") {
    return <i className="built-in-icon start-board-icon" aria-hidden="true" />;
  }
  if (app.iconUrl === "vd://icon/app-store") {
    return <i className="built-in-icon app-store-icon" aria-hidden="true" />;
  }
  if (app.iconUrl === "vd://icon/webui-import") {
    return <i className="built-in-icon webui-import-icon" aria-hidden="true" />;
  }
  if (app.iconUrl === "vd://icon/local-apps") {
    return <i className="built-in-icon local-apps-icon" aria-hidden="true" />;
  }
  if (app.iconUrl === "vd://icon/settings") {
    return <i className="built-in-icon settings-icon" aria-hidden="true" />;
  }
  return <FallbackIcon title={app.title} />;
}

export function FallbackIcon({ title }: { title: string }) {
  return <i>{initialsForTitle(title)}</i>;
}

/**
 * DesktopWeatherIconMarker — when an app is the weather app but rendered as a
 * tiny widget inside the icon grid, the parent renders the weather widget
 * directly. This helper lets the icon-plane detect that case without needing
 * to import the weather-app predicate from contracts.
 */
export function isWeatherWidgetApp(app: DesktopApp): boolean {
  return isWeatherApp(app);
}
