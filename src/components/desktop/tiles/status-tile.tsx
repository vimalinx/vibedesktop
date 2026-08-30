import type { DesktopApp, LocalAppView } from "@/lib/contracts";
import { localAppStatus, type LocalAppStatus } from "@/lib/desktop-helpers";
import type { I18nMessages } from "@/lib/i18n";
import { AppIcon } from "@/components/desktop/desktop-icon";

/**
 * Content for a multi-cell `status` tile: a daemon-managed local app with its
 * live state and, from 2×2 up, its start/stop control. State colours come from
 * the shared `--state-*` vocabulary; data comes from the desktop's existing
 * poll, so a tile adds no request of its own. Without a live view (daemon
 * gone) the caller falls back to the icon presentation — this component never
 * renders a guess.
 */
export function StatusTileContent({
  app,
  view,
  localUrl,
  title,
  t,
  onControl
}: {
  app: DesktopApp;
  view: LocalAppView;
  localUrl?: string;
  title: string;
  t: I18nMessages;
  onControl: (view: LocalAppView, action: "start" | "stop") => void;
}) {
  const status = localAppStatus(view);
  const stateLabel: Record<LocalAppStatus, string> = {
    running: t.localApps.statusRunning,
    booting: t.localApps.statusBooting,
    stopped: t.localApps.statusStopped,
    error: t.localApps.statusError
  };
  const showControls = app.spanRows >= 2;

  return (
    <span className={`status-tile ${app.spanRows >= 2 ? "is-tall" : "is-wide"}`}>
      <AppIcon app={app} localUrl={localUrl} />
      <span className="status-tile-text">
        <strong>{title}</strong>
        <span className={`status-tile-state is-${status}`}>
          <i aria-hidden="true" />
          {stateLabel[status]}
          {view.port ? <small>:{view.port}</small> : null}
        </span>
      </span>
      {showControls ? (
        /* Not a <button>: the tile itself is one, and button-in-button is
           invalid HTML the parser breaks apart. A span with the button role
           keeps the DOM legal and the parent from swallowing the click. */
        <span
          role="button"
          tabIndex={0}
          className="status-tile-action"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onControl(view, status === "running" || status === "booting" ? "stop" : "start");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              onControl(view, status === "running" || status === "booting" ? "stop" : "start");
            }
          }}
        >
          {status === "running" || status === "booting" ? t.contextMenu.stop : t.contextMenu.start}
        </span>
      ) : null}
    </span>
  );
}
