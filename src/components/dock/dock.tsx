import { useState } from "react";
import type { DesktopApp, VibeUser } from "@/lib/contracts";
import { desktopGridMinColumns, displayAppTitle, readLocalJson, writeLocalJson } from "@/lib/desktop-helpers";
import type { I18nMessages } from "@/lib/i18n";
import type { AppWindowState } from "@/protocol/shell/v1";

export function Dock({
  user,
  windows,
  clock,
  t,
  onAdd,
  onFocus
}: {
  user: VibeUser;
  windows: AppWindowState[];
  clock: string;
  t: I18nMessages;
  onAdd: () => void;
  onFocus: (id: string) => void;
}) {
  // Pinned (visible) by default; the user can switch to auto-hide via the lock icon.
  const [pinned, setPinned] = useState<boolean>(() => readLocalJson<boolean>("vd:dock-pinned", true));

  function togglePinned() {
    setPinned((current) => {
      const next = !current;
      writeLocalJson("vd:dock-pinned", next);
      return next;
    });
  }

  return (
    <div className="dock-region">
      <nav className={`dock${pinned ? "" : " dock-autohide"}`} aria-label={t.dock.aria}>
        <button className="dock-add" onClick={onAdd}>
          <PlusIcon />
          {t.dock.addApp}
        </button>
        <div className="dock-windows">
          {windows.length === 0 ? (
            <span className="dock-empty">
              {t.app.personalWebDesktop}
            </span>
          ) : null}
          {windows.map((windowState) => (
            <button key={windowState.id} className={windowState.mode === "minimized" ? "is-minimized" : "is-open"} onClick={() => onFocus(windowState.id)}>
              <i className="dock-window-indicator" aria-hidden="true" />
              <span>{displayAppTitle(windowState.app, t)}</span>
            </button>
          ))}
        </div>
        <div className="dock-user">
          <span>{user.displayName}</span>
          <strong>{clock}</strong>
          <button
            className="dock-pin"
            onClick={togglePinned}
            aria-label={pinned ? t.dock.unpin : t.dock.pin}
            title={pinned ? t.dock.unpin : t.dock.pin}
          >
            <DockLockIcon locked={pinned} />
          </button>
        </div>
      </nav>
      {pinned ? null : <div className="dock-handle" aria-hidden="true" />}
    </div>
  );
}

function DockLockIcon({ locked }: { locked: boolean }) {
  // Closed padlock = pinned (always visible); open padlock = auto-hide.
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="2.6" y="6.6" width="8.8" height="5.6" rx="1.3" stroke="currentColor" strokeWidth="1.3" />
      {locked ? (
        <path
          d="M4.6 6.6V4.6A2.4 2.4 0 0 1 9.4 4.6v2"
          stroke="currentColor"
          strokeWidth="1.3"
          fill="none"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M4.6 6.6V4.6A2.4 2.4 0 0 1 9 2.4"
          stroke="currentColor"
          strokeWidth="1.3"
          fill="none"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// Re-export so consumers can build drag targets without importing orchestrator internals.
export { desktopGridMinColumns };
export type { DesktopApp };
