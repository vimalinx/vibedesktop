import { describe, expect, it } from "vitest";
import type { DesktopApp } from "@/lib/contracts";
import {
  assertTileMutationAllowed,
  isAllowedTileSpan,
  isTileVariant,
  nearestAllowedSpan,
  renderSpanForViewport,
  TILE_SIZES,
  TileValidationError,
  tileVariants
} from "@/lib/tile-contract";

function app(overrides: Partial<DesktopApp>): DesktopApp {
  return {
    id: "a",
    desktopId: "d",
    kind: "url",
    source: "user",
    title: "App",
    url: "https://example.com",
    description: null,
    openingMode: "desktop_window",
    iconKind: "fallback",
    iconUrl: null,
    gridX: 0,
    gridY: 0,
    spanColumns: 1,
    spanRows: 1,
    tileVariant: "icon",
    sortOrder: 0,
    metadata: {},
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

describe("tile contract", () => {
  it("whitelists 1x1 for every variant so any tile can shrink back to an icon footprint", () => {
    for (const variant of tileVariants) {
      expect(isAllowedTileSpan(variant, { columns: 1, rows: 1 })).toBe(true);
    }
  });

  it("keeps the icon variant single-cell only", () => {
    expect(TILE_SIZES.icon).toHaveLength(1);
    expect(isAllowedTileSpan("icon", { columns: 2, rows: 1 })).toBe(false);
  });

  it("accepts the weather widget's historical 2x3 as a reading tile", () => {
    expect(isAllowedTileSpan("reading", { columns: 2, rows: 3 })).toBe(true);
  });

  it("rejects unknown variants", () => {
    expect(isTileVariant("banner")).toBe(false);
    expect(() =>
      assertTileMutationAllowed([app({})], "a", { tileVariant: "banner" })
    ).toThrowError(TileValidationError);
  });

  it("rejects a span the variant does not support instead of clamping", () => {
    expect(() =>
      assertTileMutationAllowed([app({ tileVariant: "status" })], "a", { spanColumns: 3, spanRows: 3 })
    ).toThrow(/not a supported size/);
  });

  it("rejects a resize that would overlap a neighbour, naming the reason", () => {
    const apps = [
      app({ id: "a", tileVariant: "status", gridX: 0, gridY: 0 }),
      app({ id: "b", gridX: 1, gridY: 0 })
    ];
    expect(() => assertTileMutationAllowed(apps, "a", { spanColumns: 2, spanRows: 1 })).toThrow(/overlap/);
  });

  it("allows the same resize once the neighbour is out of the footprint", () => {
    const apps = [
      app({ id: "a", tileVariant: "status", gridX: 0, gridY: 0 }),
      app({ id: "b", gridX: 3, gridY: 0 })
    ];
    expect(() => assertTileMutationAllowed(apps, "a", { spanColumns: 2, spanRows: 2 })).not.toThrow();
  });

  it("rejects a move that lands a multi-cell tile on an occupied cell", () => {
    const apps = [
      app({ id: "w", tileVariant: "reading", spanColumns: 2, spanRows: 3, gridX: 0, gridY: 0 }),
      app({ id: "b", gridX: 3, gridY: 1 })
    ];
    expect(() => assertTileMutationAllowed(apps, "w", { gridX: 2, gridY: 0 })).toThrow(/overlap/);
  });

  it("ignores non-tile updates entirely", () => {
    expect(() => assertTileMutationAllowed([app({})], "a", {})).not.toThrow();
  });
});

describe("resize gesture helpers", () => {
  it("snaps a raw candidate to the variant's nearest allowed span", () => {
    expect(nearestAllowedSpan("app", { columns: 2, rows: 2 })).toEqual({ columns: 2, rows: 2 });
    expect(nearestAllowedSpan("app", { columns: 3, rows: 3 })).toEqual({ columns: 2, rows: 2 });
    expect(nearestAllowedSpan("app", { columns: 1, rows: 2 })).toEqual({ columns: 1, rows: 1 });
    expect(nearestAllowedSpan("icon", { columns: 4, rows: 4 })).toEqual({ columns: 1, rows: 1 });
  });

  it("clamps the painted span to available columns without touching rows", () => {
    expect(renderSpanForViewport({ columns: 3, rows: 2 }, 2)).toEqual({ columns: 2, rows: 2 });
    expect(renderSpanForViewport({ columns: 2, rows: 3 }, 8)).toEqual({ columns: 2, rows: 3 });
    expect(renderSpanForViewport({ columns: 2, rows: 1 }, 0)).toEqual({ columns: 1, rows: 1 });
  });
});
