"use client";

import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowUpRight, Minus, Square, Copy, X } from "lucide-react";
import { WindowVisible } from "./window-visibility";
import { splitBounds } from "@/lib/window-layout";
import {
  displayAppTitle,
  dragStartThreshold,
  isLocalAppsApp,
  restoredWindowDragOrigin,
  windowEdgeInset
} from "@/lib/desktop-helpers";
import type { I18nMessages } from "@/lib/i18n";

import type { AppWindowState } from "@/protocol/shell/v1";
export type { AppWindowState, WindowMode } from "@/protocol/shell/v1";

interface WindowDragState {
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
  maximized: boolean;
  horizontalGrabRatio: number;
  verticalGrabOffset: number;
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
  const dragRef = useRef<WindowDragState | null>(null);
  const isTopDrawer = isLocalAppsApp(state.app) && !state.tiled;

  return (
    <section
      className={`app-window${state.maximized ? " is-maximized" : ""}${isTopDrawer ? " is-top-drawer" : ""}`}
      hidden={state.mode === "minimized"}
      inert={state.mode === "minimized"}
      data-presentation={isTopDrawer ? "top-drawer" : "window"}
      style={{ display: state.mode === "minimized" ? "none" : undefined, ...(
        isTopDrawer
          ? {
              left: "50%",
              top: 0,
              width: "min(1360px, calc(100% - 64px))",
              height: "calc(100dvh - 86px)",
              maxHeight: "none",
              zIndex: state.z
            }
          : state.maximized
          ? { left: 0, top: 0, width: "100%", height: "100%", zIndex: state.z }
          : {
              left: state.x,
              top: state.y,
              width: state.width,
              height: `min(${state.height}px, calc(100dvh - ${state.y}px - 82px))`,
              zIndex: state.z
            }
      ) }}
      onPointerDown={onFocus}
    >
      <header
        className="window-titlebar"
        onPointerDown={(event: ReactPointerEvent) => {
          if (event.button !== 0 || isTopDrawer) return;
          const titlebarBounds = event.currentTarget.getBoundingClientRect();
          dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            x: state.x,
            y: state.y,
            active: !state.maximized,
            maximized: Boolean(state.maximized),
            horizontalGrabRatio: (event.clientX - titlebarBounds.left) / Math.max(1, titlebarBounds.width),
            verticalGrabOffset: state.maximized ? event.clientY - titlebarBounds.top : 0
          };
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // Synthetic test events may not have an active pointer target.
          }
        }}
        onPointerMove={(event: ReactPointerEvent) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;

          if (drag.maximized && !drag.active) {
            const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
            if (distance < dragStartThreshold) return;

            const origin = restoredWindowDragOrigin({
              pointerX: event.clientX,
              pointerY: event.clientY,
              horizontalGrabRatio: drag.horizontalGrabRatio,
              verticalGrabOffset: drag.verticalGrabOffset,
              restoredWidth: state.width,
              viewportWidth: window.innerWidth
            });
            dragRef.current = {
              ...drag,
              startX: event.clientX,
              startY: event.clientY,
              x: origin.x,
              y: origin.y,
              active: true,
              maximized: false
            };
            onPatch({ maximized: false, ...origin });
            return;
          }

          onPatch({
            x: Math.max(windowEdgeInset, drag.x + event.clientX - drag.startX),
            y: Math.max(windowEdgeInset, drag.y + event.clientY - drag.startY)
          });
        }}
        onPointerUp={(event) => {
          if (dragRef.current?.pointerId === event.pointerId) {
            if (Math.hypot(event.clientX - dragRef.current.startX, event.clientY - dragRef.current.startY) > dragStartThreshold && window.innerWidth >= 640) {
              if (event.clientX < 24) onPatch(splitBounds("left", window.innerWidth, window.innerHeight));
              else if (event.clientX > window.innerWidth - 24) onPatch(splitBounds("right", window.innerWidth, window.innerHeight));
            }
            dragRef.current = null;
          }
        }}
        onPointerCancel={(event) => {
          if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
        }}
        onLostPointerCapture={() => {
          dragRef.current = null;
        }}
        onDoubleClick={(event) => {
          if (isTopDrawer || (event.target as HTMLElement).closest("button, a")) return;
          dragRef.current = null;
          onPatch({ maximized: !state.maximized });
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
              <ArrowUpRight size={15} aria-hidden="true" />
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
            <Minus size={15} aria-hidden="true" />
          </button>
          {!isTopDrawer ? (
            <button
              aria-label={state.maximized ? t.window.restore : t.window.maximize}
              title={state.maximized ? t.window.restore : t.window.maximize}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onPatch({ maximized: !state.maximized });
              }}
            >
              {state.maximized ? <Copy size={13} aria-hidden="true" /> : <Square size={13} aria-hidden="true" />}
            </button>
          ) : null}
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
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className="window-body"><WindowVisible.Provider value={state.mode === "open"}>{children}</WindowVisible.Provider></div>
      {!isTopDrawer ? (
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
      ) : null}
    </section>
  );
}
