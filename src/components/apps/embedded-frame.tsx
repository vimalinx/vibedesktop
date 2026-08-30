"use client";

import { useEffect, useState } from "react";
import type { DesktopApp } from "@/lib/contracts";
import { desktopData } from "@/lib/desktop-data";
import {
  displayAppTitle,
  initialsForTitle,
  openExternalUrl,
  readLocalJson,
  writeLocalJson
} from "@/lib/desktop-helpers";
import type { I18nMessages } from "@/lib/i18n";

type EmbedStatus =
  | { kind: "checking" }
  | { kind: "starting" }
  | { kind: "loading_frame" }
  | { kind: "ready" }
  | { kind: "blocked"; message: string };

type EmbedBridgeState = "checking" | "ready" | "unavailable";

const embedBridgeEvent = "vibe-desktop-embed-bridge-ready";

function currentEmbedBridgeState(): EmbedBridgeState {
  if (typeof document === "undefined") return "checking";
  const value = document.documentElement.dataset.vibeEmbedBridge;
  if (value === "ready") return "ready";
  if (value === "unavailable") return "unavailable";
  return "checking";
}

// Browser-safe loopback check (url-safety.ts is server-only — it pulls node:dns).
function isLoopbackUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/\[|\]/g, "").replace(/\.$/, "");
    if (h === "localhost" || h === "localhost.localdomain" || h === "::1") return true;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h) && h.split(".")[0] === "127") return true;
    return false;
  } catch {
    return false;
  }
}

// How many times we retry the iframe load before giving up. Local webapps started
// on demand take a few seconds to bind their port; retrying covers that boot race
// instead of showing "blocked" the moment the connection is refused.
const MAX_LOAD_RETRIES = 6;
const LOAD_RETRY_MS = 3000;

export function EmbeddedWebAppFrame({
  app,
  t
}: {
  app: DesktopApp;
  t: I18nMessages;
}) {
  const source = desktopData();
  const localApps = source.localApps;
  const urlMetadata = source.urlMetadata;
  const [status, setStatus] = useState<EmbedStatus>({ kind: "checking" });
  const [retries, setRetries] = useState(0);
  const [iframeKey, setIframeKey] = useState(0);
  const [bridgeState, setBridgeState] = useState<EmbedBridgeState>(currentEmbedBridgeState);
  const zoomKey = `vd:zoom:${app.id}`;
  const [zoom, setZoom] = useState<number>(() => readLocalJson<number>(zoomKey, 1));

  useEffect(() => {
    const sync = () => setBridgeState(currentEmbedBridgeState());
    sync();
    window.addEventListener(embedBridgeEvent, sync);
    const timeout = window.setTimeout(() => {
      setBridgeState((current) => current === "checking" ? "unavailable" : current);
    }, 500);
    return () => {
      window.removeEventListener(embedBridgeEvent, sync);
      window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    writeLocalJson(zoomKey, zoom);
  }, [zoom, zoomKey]);

  function adjustZoom(delta: number) {
    setZoom((current) => Math.min(1.75, Math.max(0.5, Math.round((current + delta) * 100) / 100)));
  }

  const isLoopback = isLoopbackUrl(app.url ?? "");

  useEffect(() => {
    if (!app.url) return;
    const url = app.url;
    let cancelled = false;
    setRetries(0);

    if (isLoopback) {
      // Local app started on demand: show "starting" until the port is really
      // serving, then mount the iframe. Gate on the daemon's `healthy` flag
      // (a server-side probe — reliable) for local-app windows; fall back to a
      // no-cors port probe for any other loopback URL.
      setStatus({ kind: "starting" });
      const daemonId = app.id.startsWith("local-app:") ? app.id.slice("local-app:".length) : null;
      let elapsed = 0;
      const tick = async () => {
        if (cancelled) return;
        let up = false;
        try {
          if (daemonId && localApps) {
            up = (await localApps.get(daemonId)).status.healthy;
          } else {
            const ctrl = new AbortController();
            const to = setTimeout(() => ctrl.abort(), 1500);
            await fetch(url, { mode: "no-cors", signal: ctrl.signal });
            clearTimeout(to);
            up = true;
          }
        } catch {
          up = false;
        }
        if (cancelled) return;
        if (up) {
          // Mount the frame immediately — the common case is an embeddable app,
          // and making it wait for a header probe would add latency for
          // everyone. In parallel, ask the server whether the app actually
          // allows being framed: Chromium fires `onLoad` even on a frame it
          // refused to render, so the browser alone would report a blank pane
          // as ready. A refusal flips the window to the fallback whenever it
          // arrives, before or after that load event.
          setStatus({ kind: "loading_frame" });
          if (daemonId && localApps) {
            void localApps.checkEmbeddable(daemonId).then((verdict) => {
              if (!cancelled && verdict === false) {
                setStatus({ kind: "blocked", message: t.embed.cannotEmbed });
              }
            });
          }
          return;
        }
        elapsed += daemonId ? 1000 : 600;
        if (elapsed >= 30000) {
          setStatus({ kind: "blocked", message: t.embed.loadTimeout });
        } else {
          window.setTimeout(tick, daemonId ? 1000 : 600);
        }
      };
      const timer = window.setTimeout(tick, 300);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }

    // The dedicated Chromium companion installs a session-only, tab-scoped
    // response-header rule before declaring itself ready. In that environment
    // mount the original site directly so its origin, cookies, storage and
    // sign-in session all remain intact.
    if (bridgeState === "checking") {
      setStatus({ kind: "checking" });
      return () => {
        cancelled = true;
      };
    }
    if (bridgeState === "ready") {
      setStatus({ kind: "loading_frame" });
      return () => {
        cancelled = true;
      };
    }

    // Ordinary browsers still use the honest policy check: if a site allows
    // framing it works normally; if it refuses, explain how to launch the
    // dedicated desktop browser instead of pretending a blank frame is ready.
    if (!urlMetadata) {
      setStatus({ kind: "loading_frame" });
      return () => {
        cancelled = true;
      };
    }

    setStatus({ kind: "checking" });
    urlMetadata
      .checkEmbeddable(url)
      .then((result) => {
        if (cancelled) return;
        if (!result.embeddable) {
          setStatus({ kind: "blocked", message: result.message ?? t.embed.cannotEmbed });
          return;
        }
        setStatus({ kind: "loading_frame" });
      })
      .catch(() => {
        if (!cancelled) setStatus({ kind: "blocked", message: t.embed.checkCouldNotRun });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- localApps/urlMetadata are stable module singletons
  }, [app.id, app.url, bridgeState, isLoopback, t.embed.cannotEmbed, t.embed.checkCouldNotRun, t.embed.checkFailed, t.embed.loadTimeout]);

  useEffect(() => {
    if (status.kind !== "loading_frame") return;
    const timer = window.setTimeout(() => {
      if (retries < MAX_LOAD_RETRIES) {
        // Port not listening yet (typical for a just-started local app) — remount
        // the iframe and try again.
        setRetries((r) => r + 1);
        setIframeKey((k) => k + 1);
      } else {
        setStatus({ kind: "blocked", message: t.embed.loadTimeout });
      }
    }, LOAD_RETRY_MS);
    return () => window.clearTimeout(timer);
  }, [status.kind, retries, app.url, t.embed.loadTimeout]);

  if (!app.url) return null;

  const appUrl = app.url;
  const appTitle = displayAppTitle(app, t);

  const shouldMountFrame = status.kind === "loading_frame" || status.kind === "ready";

  return (
    <div className="embed-shell">
      {shouldMountFrame ? (
        <>
          <iframe
            key={iframeKey}
            className={`app-frame ${status.kind === "ready" ? "" : "is-loading"}`}
            scrolling="yes"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
              width: `${100 / zoom}%`,
              height: `${100 / zoom}%`
            }}
            src={appUrl}
            title={appTitle}
            allow="camera; clipboard-read; clipboard-write; fullscreen; microphone"
            sandbox="allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts allow-top-navigation-by-user-activation"
            onLoad={() => setStatus((current) => (
              current.kind === "blocked" ? current : { kind: "ready" }
            ))}
            onError={() => {
              if (retries < MAX_LOAD_RETRIES) {
                setRetries((r) => r + 1);
                setIframeKey((k) => k + 1);
              } else {
                setStatus({ kind: "blocked", message: t.embed.loadError });
              }
            }}
          />
          <div className="embed-zoom" onPointerDown={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => adjustZoom(-0.1)} aria-label="Zoom out">
              −
            </button>
            <span className="embed-zoom-pct" onClick={() => setZoom(1)} title="Reset zoom">
              {Math.round(zoom * 100)}%
            </span>
            <button type="button" onClick={() => adjustZoom(0.1)} aria-label="Zoom in">
              +
            </button>
          </div>
        </>
      ) : null}
      {status.kind !== "ready" ? (
        <div className="embed-fallback">
          {status.kind === "blocked" ? (
            <i>{initialsForTitle(app.title)}</i>
          ) : (
            <span className="embed-spinner" role="status" aria-live="polite">
              <i>{initialsForTitle(app.title)}</i>
              <span className="embed-ring" />
              <span className="embed-ring" />
              <span className="embed-ring" />
            </span>
          )}
          <h2>{appTitle}</h2>
          <p>
            {status.kind === "checking"
              ? t.embed.checking
              : status.kind === "starting"
                ? t.embed.starting
                : status.kind === "loading_frame"
                  ? t.embed.loading
                  : `${status.message}${!isLoopback && bridgeState !== "ready" ? ` ${t.embed.bridgeRequired}` : ""}`}
          </p>
          {status.kind === "blocked" ? (
            <div>
              <button className="primary-action" onClick={() => openExternalUrl(appUrl)}>
                {t.embed.openExternal}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
