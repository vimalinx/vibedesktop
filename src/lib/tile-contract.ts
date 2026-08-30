import { gridSpanIsFree, markGridSpan, type DesktopGridSpan } from "@/lib/desktop-grid";
import type { DesktopApp } from "@/lib/contracts";

/**
 * The tile contract: which sizes each tile variant may occupy.
 *
 * This is the single source of truth consumed by the API validator, the resize
 * UI, the context menu, and the tests. A span outside a variant's whitelist is
 * rejected with a 400 at the API boundary — never silently clamped, because a
 * clamp hides the caller's bug and surprises the user.
 *
 * Sizes are a whitelist rather than free-form because every (variant, size)
 * pair is a layout that has to be designed, translated, and tested; arbitrary
 * spans multiply that surface beyond what can be honestly maintained.
 */
export type TileVariant = "icon" | "app" | "status" | "reading" | "list";

export const TILE_SIZES: Record<TileVariant, readonly DesktopGridSpan[]> = {
  /** Today's behaviour: an icon and a label in one cell. */
  icon: [{ columns: 1, rows: 1 }],
  /** Launcher with title/subtitle and a primary action at larger sizes. */
  app: [
    { columns: 1, rows: 1 },
    { columns: 2, rows: 1 },
    { columns: 2, rows: 2 }
  ],
  /** Local app / device state with controls. */
  status: [
    { columns: 1, rows: 1 },
    { columns: 2, rows: 1 },
    { columns: 2, rows: 2 },
    { columns: 2, rows: 3 }
  ],
  /** A single live reading — the weather widget's shape. */
  reading: [
    { columns: 1, rows: 1 },
    { columns: 2, rows: 1 },
    { columns: 2, rows: 2 },
    { columns: 2, rows: 3 }
  ],
  /** Start-board style list. */
  list: [
    { columns: 1, rows: 1 },
    { columns: 2, rows: 2 },
    { columns: 2, rows: 3 },
    { columns: 3, rows: 2 }
  ]
} as const;

export const tileVariants = Object.keys(TILE_SIZES) as TileVariant[];

export function isTileVariant(value: unknown): value is TileVariant {
  return typeof value === "string" && value in TILE_SIZES;
}

export function isAllowedTileSpan(variant: TileVariant, span: DesktopGridSpan): boolean {
  return TILE_SIZES[variant].some((allowed) => allowed.columns === span.columns && allowed.rows === span.rows);
}

/**
 * The sizes offered to the user for a variant, in display order. Identity of
 * `TILE_SIZES` today, but the indirection keeps callers off the raw table.
 */
export function allowedTileSpans(variant: TileVariant): readonly DesktopGridSpan[] {
  return TILE_SIZES[variant];
}

export class TileValidationError extends Error {
  constructor(
    public readonly code: "unknown_variant" | "unsupported_span" | "overlap",
    message: string
  ) {
    super(message);
    this.name = "TileValidationError";
  }
}

/**
 * Validates a tile mutation against the whitelist and the rest of the desktop.
 * Shared by both persistence adapters so the JSON and PostgreSQL paths cannot
 * disagree about what a legal tile is. Throws — never clamps — because a
 * silent correction hides the caller's bug and surprises the user.
 */
export function assertTileMutationAllowed(
  apps: readonly DesktopApp[],
  appId: string,
  updates: Partial<Pick<DesktopApp, "gridX" | "gridY" | "spanColumns" | "spanRows" | "tileVariant">>
): void {
  const current = apps.find((app) => app.id === appId);
  if (!current) return; // existence is the store's own not-found path

  const touchesTile =
    updates.spanColumns !== undefined || updates.spanRows !== undefined || updates.tileVariant !== undefined;
  const touchesPosition = updates.gridX !== undefined || updates.gridY !== undefined;
  if (!touchesTile && !touchesPosition) return;

  const variant = updates.tileVariant ?? current.tileVariant;
  if (!isTileVariant(variant)) {
    throw new TileValidationError("unknown_variant", `"${variant}" is not a tile variant.`);
  }
  const span: DesktopGridSpan = {
    columns: updates.spanColumns ?? current.spanColumns,
    rows: updates.spanRows ?? current.spanRows
  };
  if (touchesTile && !isAllowedTileSpan(variant, span)) {
    throw new TileValidationError(
      "unsupported_span",
      `${span.columns}x${span.rows} is not a supported size for the "${variant}" variant.`
    );
  }

  const position = { gridX: updates.gridX ?? current.gridX, gridY: updates.gridY ?? current.gridY };
  const taken = new Set<string>();
  for (const app of apps) {
    if (app.id === appId) continue;
    markGridSpan(
      taken,
      { gridX: app.gridX, gridY: app.gridY },
      { columns: Math.max(1, app.spanColumns), rows: Math.max(1, app.spanRows) }
    );
  }
  if (!gridSpanIsFree(taken, position.gridX, position.gridY, span)) {
    throw new TileValidationError("overlap", "That size or position would overlap another item.");
  }
}

/**
 * Nearest allowed span for a variant, by Manhattan distance with a stable
 * first-wins tie-break. Used by the pointer-resize gesture to snap its raw
 * candidate onto the whitelist.
 */
export function nearestAllowedSpan(variant: TileVariant, raw: DesktopGridSpan): DesktopGridSpan {
  let best = TILE_SIZES[variant][0];
  let bestCost = Number.POSITIVE_INFINITY;
  for (const option of TILE_SIZES[variant]) {
    const cost = Math.abs(option.columns - raw.columns) + Math.abs(option.rows - raw.rows);
    if (cost < bestCost) {
      best = option;
      bestCost = cost;
    }
  }
  return best;
}

/**
 * The span to PAINT at the current viewport. Storage keeps the user's intent;
 * layout clamps to the columns that exist right now and restores itself when
 * space returns. Rows are never clamped — vertical space scrolls.
 */
export function renderSpanForViewport(span: DesktopGridSpan, availableColumns: number): DesktopGridSpan {
  return { columns: Math.max(1, Math.min(span.columns, availableColumns)), rows: span.rows };
}
