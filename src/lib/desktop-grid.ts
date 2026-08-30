export interface DesktopGridSpan {
  columns: number;
  rows: number;
}

export interface DesktopGridPosition {
  gridX: number;
  gridY: number;
}

export const desktopGridMinColumns = 8;
export const desktopGridMaxColumns = 24;

export const weatherWidgetGridSpan: DesktopGridSpan = {
  columns: 2,
  rows: 3
};

export function maxGridXForSpan(columnCount: number, span: DesktopGridSpan): number {
  return Math.max(0, columnCount - span.columns);
}

export type GridFocusDirection = "left" | "right" | "up" | "down";

export interface GridFocusItem extends DesktopGridPosition {
  id: string;
}

/**
 * The next item a keyboard arrow should move focus to.
 *
 * Desktop icons sit at sparse, arbitrary positions, so "the next one" cannot be
 * DOM order: pressing Right from an icon with a gap beside it must reach the
 * next icon on that row, and pressing Down from the last row must not wrap into
 * nonsense.
 *
 * Candidates are the items strictly in the pressed direction. An item on the
 * same line — same row when moving sideways, same column when moving up or
 * down — always wins, so an empty cell is skipped rather than deflecting focus
 * diagonally. Otherwise the winner is the closest along the axis, then the
 * closest across it, then the lowest id so the choice is stable.
 *
 * Returns null when there is nothing in that direction — the caller keeps focus
 * where it is rather than wrapping, which is what a spatial grid should do.
 */
export function nextGridFocusId(
  items: GridFocusItem[],
  currentId: string,
  direction: GridFocusDirection
): string | null {
  const current = items.find((item) => item.id === currentId);
  if (!current) return items[0]?.id ?? null;

  const horizontal = direction === "left" || direction === "right";
  const forward = direction === "right" || direction === "down";

  const primary = (item: GridFocusItem) => (horizontal ? item.gridX : item.gridY);
  const cross = (item: GridFocusItem) => (horizontal ? item.gridY : item.gridX);

  let best: { item: GridFocusItem; along: number; across: number } | null = null;

  for (const item of items) {
    if (item.id === currentId) continue;
    const along = (primary(item) - primary(current)) * (forward ? 1 : -1);
    if (along <= 0) continue;
    const across = Math.abs(cross(item) - cross(current));
    const onLine = across === 0;
    const bestOnLine = best?.across === 0;
    const better =
      !best ||
      (onLine && !bestOnLine) ||
      (onLine === bestOnLine &&
        (along < best.along ||
          (along === best.along && across < best.across) ||
          (along === best.along && across === best.across && item.id < best.item.id)));
    if (better) best = { item, along, across };
  }

  return best?.item.id ?? null;
}

export function firstOpenGridSpanPosition(
  taken: Set<string>,
  span: DesktopGridSpan,
  gridColumns: number,
  maxRows = 24
): DesktopGridPosition {
  for (let y = 0; y < maxRows; y += 1) {
    for (let x = 0; x <= maxGridXForSpan(gridColumns, span); x += 1) {
      if (gridSpanIsFree(taken, x, y, span)) {
        return { gridX: x, gridY: y };
      }
    }
  }

  return { gridX: 0, gridY: maxRows };
}

export function nearestOpenGridSpanPosition(
  taken: Set<string>,
  desired: DesktopGridPosition,
  span: DesktopGridSpan,
  gridColumns: number,
  maxRows = 48
): DesktopGridPosition {
  let best: { position: DesktopGridPosition; score: number; rowDistance: number; columnDistance: number } | null = null;
  const maxGridX = maxGridXForSpan(gridColumns, span);

  for (let y = 0; y < maxRows; y += 1) {
    for (let x = 0; x <= maxGridX; x += 1) {
      if (!gridSpanIsFree(taken, x, y, span)) {
        continue;
      }

      const dx = x - desired.gridX;
      const dy = y - desired.gridY;
      const score = dx * dx + dy * dy;
      const rowDistance = Math.abs(dy);
      const columnDistance = Math.abs(dx);

      if (
        !best ||
        score < best.score ||
        (score === best.score &&
          (rowDistance < best.rowDistance ||
            (rowDistance === best.rowDistance &&
              (columnDistance < best.columnDistance ||
                (columnDistance === best.columnDistance && (y < best.position.gridY || (y === best.position.gridY && x < best.position.gridX)))))))
      ) {
        best = { position: { gridX: x, gridY: y }, score, rowDistance, columnDistance };
      }
    }
  }

  return best?.position ?? firstOpenGridSpanPosition(taken, span, gridColumns, maxRows);
}

export function gridSpanIsFree(taken: Set<string>, gridX: number, gridY: number, span: DesktopGridSpan): boolean {
  for (let y = gridY; y < gridY + span.rows; y += 1) {
    for (let x = gridX; x < gridX + span.columns; x += 1) {
      if (taken.has(`${x}:${y}`)) {
        return false;
      }
    }
  }

  return true;
}

export function markGridSpan(taken: Set<string>, position: DesktopGridPosition, span: DesktopGridSpan): void {
  for (let y = position.gridY; y < position.gridY + span.rows; y += 1) {
    for (let x = position.gridX; x < position.gridX + span.columns; x += 1) {
      taken.add(`${x}:${y}`);
    }
  }
}
