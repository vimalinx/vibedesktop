"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, Ref } from "react";
import type { DesktopApp } from "@/lib/contracts";
import { nextGridFocusId, type DesktopGridSpan, type GridFocusDirection } from "@/lib/desktop-grid";
import { allowedTileSpans, isTileVariant, nearestAllowedSpan, renderSpanForViewport } from "@/lib/tile-contract";
import {
  cellHeight,
  cellWidth,
  desktopCellMetrics,
  desktopGridLayoutForWidth,
  desktopIconPaintWidth,
  desktopInset,
  displayAppTitle,
  isWeatherApp,
  layoutDesktopAppsForViewport,
  type DesktopCellMetrics,
  type LocalAppStatus,
  type WeatherReading
} from "@/lib/desktop-helpers";
import type { I18nMessages } from "@/lib/i18n";
import { AppIcon } from "./desktop-icon";
import { AppTileContent } from "./tiles/app-tile";
import { StatusTileContent } from "./tiles/status-tile";
import { DesktopWeatherWidget } from "./weather-widget";

export interface DesktopDragTarget {
  gridX: number;
  gridY: number;
  desiredGridX: number;
  desiredGridY: number;
  span: { columns: number; rows: number };
  adjusted: boolean;
}

function desktopGridTargetStyle(target: DesktopDragTarget, metrics: DesktopCellMetrics): CSSProperties {
  const width = target.span.columns === 1 ? 88 : target.span.columns * metrics.cellWidth;
  const height = target.span.rows === 1 ? 96 : target.span.rows * metrics.cellHeight;
  return {
    left: metrics.desktopInset + target.gridX * metrics.cellWidth,
    top: metrics.desktopInset + target.gridY * metrics.cellHeight,
    width,
    height
  };
}

export interface DesktopCanvasProps {
  apps: DesktopApp[];
  localAssets: Record<string, string>;
  activeDragAppId: string | null;
  dragTarget: DesktopDragTarget | null;
  weatherCity: string;
  weather: WeatherReading | null;
  weatherStatus: string;
  t: I18nMessages;
  statusByApp?: Record<string, LocalAppStatus>;
  iconPlaneRef: Ref<HTMLElement>;
  onIconPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, app: DesktopApp) => void;
  onIconDoubleClick: (app: DesktopApp) => void;
  onIconContextMenu: (event: React.MouseEvent<HTMLButtonElement>, app: DesktopApp) => void;
  onIconClick: (event: React.MouseEvent<HTMLButtonElement>, app: DesktopApp) => void;
  onTileResize: (app: DesktopApp, span: DesktopGridSpan) => void;
  localAppViewById?: Map<string, import("@/lib/contracts").LocalAppView>;
  onLocalAppControl?: (view: import("@/lib/contracts").LocalAppView, action: "start" | "stop") => void;
}

export function DesktopCanvas({
  apps,
  localAssets,
  activeDragAppId,
  dragTarget,
  weatherCity,
  weather,
  weatherStatus,
  t,
  statusByApp,
  iconPlaneRef,
  onIconPointerDown,
  onIconDoubleClick,
  onIconContextMenu,
  onIconClick,
  onTileResize,
  localAppViewById,
  onLocalAppControl
}: DesktopCanvasProps) {
  /* Roving focus: the icon plane is one tab stop, and arrows move between icons
     inside it. Tabbing through twenty absolutely positioned icons in DOM order
     is neither fast nor spatially meaningful. */
  const [activeIconId, setActiveIconId] = useState<string | null>(null);

  /* Grid geometry comes from the CSS tokens; the compact breakpoint changes
     them, so re-read on resize to keep painted positions and drag math in the
     same cell system. SSR uses the constant fallbacks and the first client
     render corrects itself if the breakpoint differs. */
  const [gridLayout, setGridLayout] = useState(() => ({
    columns: 8,
    metrics: { cellWidth, cellHeight, desktopInset },
    fitted: false
  }));
  const metrics = gridLayout.metrics;
  useEffect(() => {
    const update = () => {
      const base = desktopCellMetrics();
      const plane = (iconPlaneRef as React.RefObject<HTMLElement>).current;
      const visibleWidth = plane?.clientWidth || plane?.getBoundingClientRect().width || 0;
      const next = desktopGridLayoutForWidth(visibleWidth, base, desktopIconPaintWidth());
      setGridLayout((current) =>
        current.columns === next.columns &&
        current.fitted === next.fitted &&
        current.metrics.cellWidth === next.metrics.cellWidth &&
        current.metrics.cellHeight === next.metrics.cellHeight &&
        current.metrics.desktopInset === next.metrics.desktopInset
          ? current
          : next
      );
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [iconPlaneRef]);

  const renderedPositions = useMemo(
    () => layoutDesktopAppsForViewport(apps, gridLayout.columns),
    [apps, gridLayout.columns]
  );
  const focusItems = useMemo(
    () =>
      apps.map((app) => ({
        id: app.id,
        ...(renderedPositions.get(app.id) ?? { gridX: app.gridX, gridY: app.gridY })
      })),
    [apps, renderedPositions]
  );

  useEffect(() => {
    // Keep the tab stop on a real icon after add, delete, or rearrange.
    if (apps.length === 0) {
      setActiveIconId(null);
      return;
    }
    setActiveIconId((current) => (current && apps.some((app) => app.id === current) ? current : apps[0].id));
  }, [apps]);

  function moveFocus(direction: GridFocusDirection, fromId: string): boolean {
    const nextId = nextGridFocusId(focusItems, fromId, direction);
    if (!nextId || nextId === fromId) return false;
    setActiveIconId(nextId);
    const next = document.querySelector<HTMLButtonElement>(`.desktop-icon[data-app-id="${CSS.escape(nextId)}"]`);
    next?.focus();
    return true;
  }

  function handleIconKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, app: DesktopApp) {
    const directions: Record<string, GridFocusDirection> = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down"
    };
    const direction = directions[event.key];
    if (direction) {
      if (moveFocus(direction, app.id)) event.preventDefault();
      return;
    }
    // The menu key and Shift+F10 are the keyboard equivalents of right-click.
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      const bounds = event.currentTarget.getBoundingClientRect();
      onIconContextMenu(
        {
          preventDefault: () => {},
          stopPropagation: () => {},
          clientX: Math.round(bounds.left + bounds.width / 2),
          clientY: Math.round(bounds.top + bounds.height / 2)
        } as unknown as React.MouseEvent<HTMLButtonElement>,
        app
      );
    }
  }

  /* Pointer resize: the handle owns its own pointer capture, so starting a
     resize can never also start a drag — the two gestures live on different
     elements. Preview reuses the same grid-target treatment as dragging; the
     candidate snaps to the variant's nearest allowed span. */
  const [resizePreview, setResizePreview] = useState<
    { app: DesktopApp; position: { gridX: number; gridY: number }; span: DesktopGridSpan; adjusted: boolean } | null
  >(null);

  function beginResize(
    event: ReactPointerEvent<HTMLElement>,
    app: DesktopApp,
    position: { gridX: number; gridY: number }
  ) {
    event.stopPropagation();
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    let latest: DesktopGridSpan | null = null;
    const move = (raw: PointerEvent) => {
      const plane = (handle.closest(".icon-plane") as HTMLElement | null)?.getBoundingClientRect();
      if (!plane) return;
      const rawSpan = {
        columns: Math.max(1, Math.round((raw.clientX - plane.left - metrics.desktopInset - position.gridX * metrics.cellWidth) / metrics.cellWidth + 0.5)),
        rows: Math.max(1, Math.round((raw.clientY - plane.top - metrics.desktopInset - position.gridY * metrics.cellHeight) / metrics.cellHeight + 0.5))
      };
      const snapped = nearestAllowedSpan(isTileVariant(app.tileVariant) ? app.tileVariant : "icon", rawSpan);
      latest = snapped;
      setResizePreview({
        app,
        position,
        span: snapped,
        adjusted: snapped.columns !== rawSpan.columns || snapped.rows !== rawSpan.rows
      });
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", cancel);
      setResizePreview(null);
      // Side effect outside the state updater: StrictMode double-invokes
      // updaters, which would send the PATCH twice.
      if (latest && (latest.columns !== app.spanColumns || latest.rows !== app.spanRows)) {
        onTileResize(app, latest);
      }
    };
    const cancel = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", cancel);
      setResizePreview(null);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", cancel);
  }

  // Rows exist for assistive technology only: icons are absolutely positioned,
  // so each row is a zero-size wrapper that reports the grid structure without
  // taking part in layout.
  const rows = useMemo(() => {
    const grouped = new Map<number, Array<{ app: DesktopApp; position: { gridX: number; gridY: number } }>>();
    for (const app of apps) {
      const position = renderedPositions.get(app.id) ?? { gridX: app.gridX, gridY: app.gridY };
      const row = grouped.get(position.gridY);
      if (row) row.push({ app, position });
      else grouped.set(position.gridY, [{ app, position }]);
    }
    return [...grouped.entries()].sort(([a], [b]) => a - b);
  }, [apps, renderedPositions]);

  return (
    <section
      ref={iconPlaneRef}
      className="icon-plane"
      role="grid"
      aria-label={t.app.desktopAria}
      aria-colcount={gridLayout.columns}
      aria-rowcount={rows.length}
      onDragStartCapture={(event) => event.preventDefault()}
    >
      {resizePreview ? (
        <div
          className={`desktop-grid-target is-widget ${resizePreview.adjusted ? "is-adjusted" : ""}`}
          style={desktopGridTargetStyle(
            {
              gridX: resizePreview.position.gridX,
              gridY: resizePreview.position.gridY,
              desiredGridX: resizePreview.position.gridX,
              desiredGridY: resizePreview.position.gridY,
              span: resizePreview.span,
              adjusted: resizePreview.adjusted
            },
            metrics
          )}
          aria-hidden="true"
        />
      ) : null}

      {dragTarget ? (
        <div
          className={`desktop-grid-target ${dragTarget.adjusted ? "is-adjusted" : ""} ${
            dragTarget.span.columns > 1 || dragTarget.span.rows > 1 ? "is-widget" : ""
          }`}
          style={desktopGridTargetStyle(dragTarget, metrics)}
          aria-hidden="true"
        />
      ) : null}

      {rows.map(([gridY, rowApps], rowIndex) => (
        <div
          key={gridY}
          role="row"
          aria-rowindex={rowIndex + 1}
          className="icon-row"
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          {rowApps.map(({ app, position }) => {
            const draggingThis = activeDragAppId === app.id;
            const left = metrics.desktopInset + position.gridX * metrics.cellWidth;
            const top = metrics.desktopInset + position.gridY * metrics.cellHeight;
            const weatherWidget = app.tileVariant === "reading" && isWeatherApp(app);
            const multiCell = !weatherWidget && (app.spanColumns > 1 || app.spanRows > 1);
            // Storage keeps the user's intent; painting clamps to the columns
            // this viewport actually has and restores when space returns.
            const availableColumns = Math.max(
              1,
              gridLayout.columns - position.gridX
            );
            const painted = renderSpanForViewport(
              { columns: app.spanColumns, rows: app.spanRows },
              availableColumns
            );
            const tileSize = multiCell
              ? {
                  width: painted.columns * metrics.cellWidth - 20,
                  minHeight: painted.rows * metrics.cellHeight - 22
                }
              : undefined;
            const fittedWeatherSize = weatherWidget && gridLayout.fitted
              ? { width: app.spanColumns * metrics.cellWidth }
              : undefined;
            const appTitle = displayAppTitle(app, t);
            const status = statusByApp?.[app.id];

            return (
              <div
                key={app.id}
                role="gridcell"
                aria-colindex={position.gridX + 1}
                aria-colspan={app.spanColumns > 1 ? app.spanColumns : undefined}
                aria-rowspan={app.spanRows > 1 ? app.spanRows : undefined}
                style={{ display: "contents" }}
              >
                <button
                  className={`desktop-icon ${weatherWidget ? "desktop-widget weather-desktop-widget" : ""} ${
                    multiCell ? "is-tile" : ""
                  } ${draggingThis ? "is-dragging" : ""}${status ? ` has-status is-${status}` : ""}${
                    app.source === "local" ? " is-local" : ""
                  }`}
                  style={{ left, top, pointerEvents: "auto", ...fittedWeatherSize, ...tileSize }}
                  draggable={false}
                  data-app-id={app.id}
                  tabIndex={activeIconId === app.id ? 0 : -1}
                  aria-label={weatherWidget ? t.app.openWeather : t.app.openApp(appTitle)}
                  onDragStart={(event) => event.preventDefault()}
                  onDoubleClick={() => onIconDoubleClick(app)}
                  onClick={(event) => onIconClick(event, app)}
                  onPointerDown={(event) => onIconPointerDown(event, app)}
                  onContextMenu={(event) => onIconContextMenu(event, app)}
                  onKeyDown={(event) => handleIconKeyDown(event, app)}
                  onFocus={() => setActiveIconId(app.id)}
                >
                  {!weatherWidget && isTileVariant(app.tileVariant) && allowedTileSpans(app.tileVariant).length > 1 ? (
                    <i
                      className="tile-resize-handle"
                      aria-hidden="true"
                      onPointerDown={(event) => beginResize(event, app, position)}
                    />
                  ) : null}
                  {weatherWidget ? (
                    <DesktopWeatherWidget t={t} city={weatherCity} weather={weather} status={weatherStatus} />
                  ) : multiCell && app.tileVariant === "status" && localAppViewById?.get(app.id) && onLocalAppControl ? (
                    <StatusTileContent
                      app={app}
                      view={localAppViewById.get(app.id)!}
                      localUrl={localAssets[`app:${app.id}:icon`]}
                      title={appTitle}
                      t={t}
                      onControl={onLocalAppControl}
                    />
                  ) : multiCell ? (
                    <AppTileContent app={app} localUrl={localAssets[`app:${app.id}:icon`]} title={appTitle} />
                  ) : (
                    <>
                      <AppIcon app={app} localUrl={localAssets[`app:${app.id}:icon`]} />
                      <span>{appTitle}</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
