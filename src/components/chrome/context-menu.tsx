import { useEffect, useRef } from "react";
import type { DesktopApp, LocalAppView } from "@/lib/contracts";
import type { DesktopGridSpan } from "@/lib/desktop-grid";
import { allowedTileSpans, isTileVariant } from "@/lib/tile-contract";
import type { I18nMessages } from "@/lib/i18n";

export type ContextMenuState =
  | { kind: "desktop"; x: number; y: number }
  | { kind: "app"; x: number; y: number; app: DesktopApp }
  | { kind: "local-app"; x: number; y: number; app: LocalAppView; projected?: DesktopApp }
  | null;

function TileSizeGroup({
  app,
  t,
  onResize
}: {
  app: DesktopApp;
  t: I18nMessages;
  onResize: (app: DesktopApp, span: DesktopGridSpan) => void;
}) {
  if (!isTileVariant(app.tileVariant) || allowedTileSpans(app.tileVariant).length <= 1) return null;
  return (
    <div className="context-menu-sizes" role="group" aria-label={t.contextMenu.tileSize}>
      <span>{t.contextMenu.tileSize}</span>
      {allowedTileSpans(app.tileVariant).map((span) => {
        const active = span.columns === app.spanColumns && span.rows === app.spanRows;
        return (
          <button
            key={`${span.columns}x${span.rows}`}
            role="menuitemradio"
            aria-checked={active}
            onClick={() => onResize(app, span)}
          >
            {span.columns}×{span.rows}
            {active ? " ·" : ""}
          </button>
        );
      })}
    </div>
  );
}

export function ContextMenu({
  state,
  t,
  onAdd,
  onAutoArrange,
  onWallpaper,
  onOpen,
  onEdit,
  onRemove,
  onOpenLocalApp,
  onToggleLocalApp,
  onResize,
  onDismiss
}: {
  state: Exclude<ContextMenuState, null>;
  t: I18nMessages;
  onDismiss: () => void;
  onAdd: () => void;
  onAutoArrange: () => void;
  onWallpaper: () => void;
  onOpen: (app: DesktopApp) => void;
  onEdit: (app: DesktopApp) => void;
  onRemove: (app: DesktopApp) => void;
  onOpenLocalApp: (app: LocalAppView) => void;
  onToggleLocalApp: (app: LocalAppView) => void;
  onResize: (app: DesktopApp, span: DesktopGridSpan) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  /* A menu opened from the keyboard has to be usable and dismissable from the
     keyboard: focus moves in on open, Escape closes it, and focus goes back to
     whatever opened it. The menu owns both halves of that round trip — the
     desktop should not have to remember who was focused. Without this the menu
     was a trap for anyone not using a mouse. */
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, [state]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onDismiss();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    items[(index + step + items.length) % items.length].focus();
  }

  // Clamp inside viewport so the menu never overflows on small screens.
  const style = {
    left: Math.min(state.x, typeof window !== "undefined" ? window.innerWidth - 220 : state.x),
    top: Math.min(state.y, typeof window !== "undefined" ? window.innerHeight - 220 : state.y)
  };

  return (
    <div
      ref={menuRef}
      className="context-menu"
      role="menu"
      aria-label={t.contextMenu.open}
      style={style}
      onKeyDown={handleKeyDown}
      onClick={(event) => event.stopPropagation()}
    >
      {state.kind === "desktop" ? (
        <>
          <button role="menuitem" onClick={onAdd}>
            <span aria-hidden="true">+</span>
            {t.contextMenu.addApp}
          </button>
          <button role="menuitem" onClick={onAutoArrange}>{t.contextMenu.autoArrange}</button>
          <button role="menuitem" onClick={onWallpaper}>{t.contextMenu.changeWallpaper}</button>
        </>
      ) : state.kind === "local-app" ? (
        <>
          <button role="menuitem" onClick={() => onOpenLocalApp(state.app)}>{t.contextMenu.open}</button>
          <button role="menuitem" onClick={() => onToggleLocalApp(state.app)}>
            {state.app.status.running ? t.contextMenu.stop : t.contextMenu.start}
          </button>
          {state.projected ? <TileSizeGroup app={state.projected} t={t} onResize={onResize} /> : null}
        </>
      ) : (
        <>
          <button role="menuitem" onClick={() => onOpen(state.app)}>{t.contextMenu.open}</button>
          <TileSizeGroup app={state.app} t={t} onResize={onResize} />
          <button role="menuitem" onClick={() => onEdit(state.app)}>{t.contextMenu.edit}</button>
          <button role="menuitem" onClick={() => onEdit(state.app)}>{t.contextMenu.changeIcon}</button>
          <button className="danger" onClick={() => onRemove(state.app)}>
            {t.contextMenu.remove}
          </button>
        </>
      )}
    </div>
  );
}
