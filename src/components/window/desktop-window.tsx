"use client";

import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { DesktopApp } from "@/lib/contracts";
import { displayAppTitle } from "@/lib/desktop-helpers";
import type { I18nMessages } from "@/lib/i18n";

export type WindowMode = "open" | "minimized";

export interface AppWindowState {
  id: string;
  app: DesktopApp;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  mode: WindowMode;
  maximized?: boolean;
}

export function DesktopWindow({
  state,
  children,
  onFocus,
  onPatch,
  onClose,
  t
}: {
  state: AppWindowState;
  children: React.ReactNode;
  onFocus: () => void;
  onPatch: (updates: Partial<AppWindowState>) => void;
  onClose: () => void;
  t: I18nMessages;
}) {
  const dragRef = useRef<{ startX: number; startY: number; x: number; y: number } | null>(null);

  if (state.mode === "minimized") {
    return null;
  }

  return (
    <section
      className={`app-window${state.maximized ? " is-maximized" : ""}`}
      style={
        state.maximized
          ? { left: 0, top: 0, width: "100%", height: "100%", zIndex: state.z }
          : {
              left: state.x,
              top: state.y,
              width: state.width,
              height: `min(${state.height}px, calc(100dvh - ${state.y}px - 82px))`,
              zIndex: state.z
            }
      }
      onPointerDown={onFocus}
    >
      <header
        className="window-titlebar"
        onPointerDown={(event: ReactPointerEvent) => {
          if (state.maximized) return;
          dragRef.current = {
            startX: event.clientX,
            startY: event.clientY,
            x: state.x,
            y: state.y
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event: ReactPointerEvent) => {
          if (!dragRef.current) return;
          onPatch({
            x: Math.max(12, dragRef.current.x + event.clientX - dragRef.current.startX),
            y: Math.max(12, dragRef.current.y + event.clientY - dragRef.current.startY)
          });
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
      >
        <span>{displayAppTitle(state.app, t)}</span>
        <div>
          {state.app.url ? (
            <a
              href={state.app.url}
              target="_blank"
              rel="noreferrer"
              aria-label={t.window.external}
              title={t.window.external}
              onPointerDown={(event) => event.stopPropagation()}
            >
              ↗
            </a>
          ) : null}
          <button
            aria-label={t.window.minimize}
            title={t.window.minimize}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onPatch({ mode: "minimized" });
            }}
          >
            –
          </button>
          <button
            aria-label={state.maximized ? t.window.restore : t.window.maximize}
            title={state.maximized ? t.window.restore : t.window.maximize}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onPatch({ maximized: !state.maximized });
            }}
          >
            {state.maximized ? "❐" : "□"}
          </button>
          <button
            className="window-close"
            aria-label={t.window.close}
            title={t.window.close}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
          >
            ✕
          </button>
        </div>
      </header>
      <div className="window-body">{children}</div>
      <button
        className="window-resize"
        aria-label={t.app.resizeWindow}
        onPointerDown={(event) => {
          event.stopPropagation();
          if (state.maximized) return;
          const start = {
            x: event.clientX,
            y: event.clientY,
            width: state.width,
            height: state.height
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          const target = event.currentTarget;
          target.onpointermove = (moveEvent) => {
            const availableHeight = Math.max(320, window.innerHeight - state.y - 82);
            onPatch({
              width: Math.max(420, start.width + moveEvent.clientX - start.x),
              height: Math.min(availableHeight, Math.max(320, start.height + moveEvent.clientY - start.y))
            });
          };
          target.onpointerup = () => {
            target.onpointermove = null;
            target.onpointerup = null;
          };
        }}
      />
    </section>
  );
}
