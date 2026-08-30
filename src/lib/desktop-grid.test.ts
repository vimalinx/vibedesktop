import { describe, expect, it } from "vitest";
import {
  gridSpanIsFree,
  markGridSpan,
  nearestOpenGridSpanPosition,
  nextGridFocusId,
  weatherWidgetGridSpan
} from "@/lib/desktop-grid";

describe("desktop grid helpers", () => {
  it("marks every cell in a multi-cell widget span", () => {
    const taken = new Set<string>();
    markGridSpan(taken, { gridX: 4, gridY: 2 }, weatherWidgetGridSpan);

    expect(gridSpanIsFree(taken, 4, 2, { columns: 1, rows: 1 })).toBe(false);
    expect(gridSpanIsFree(taken, 5, 4, { columns: 1, rows: 1 })).toBe(false);
    expect(gridSpanIsFree(taken, 6, 2, { columns: 1, rows: 1 })).toBe(true);
  });

  it("returns the nearest open cell when the desired target is occupied", () => {
    const taken = new Set<string>();
    markGridSpan(taken, { gridX: 4, gridY: 2 }, weatherWidgetGridSpan);

    expect(nearestOpenGridSpanPosition(taken, { gridX: 4, gridY: 2 }, { columns: 1, rows: 1 }, 8)).toEqual({
      gridX: 3,
      gridY: 2
    });
  });
});

describe("keyboard focus movement", () => {
  //  col:  0      1      2      3
  //  row0  a             b
  //  row1         c
  //  row2  d                    e
  const layout = [
    { id: "a", gridX: 0, gridY: 0 },
    { id: "b", gridX: 2, gridY: 0 },
    { id: "c", gridX: 1, gridY: 1 },
    { id: "d", gridX: 0, gridY: 2 },
    { id: "e", gridX: 3, gridY: 2 }
  ];

  it("crosses a gap to reach the next icon on the row", () => {
    expect(nextGridFocusId(layout, "a", "right")).toBe("b");
  });

  it("stops at the edge instead of wrapping", () => {
    expect(nextGridFocusId(layout, "a", "left")).toBeNull();
    expect(nextGridFocusId(layout, "a", "up")).toBeNull();
    expect(nextGridFocusId(layout, "e", "right")).toBeNull();
  });

  it("keeps the column when one is directly below, skipping the empty cell", () => {
    expect(nextGridFocusId(layout, "a", "down")).toBe("d");
  });

  it("falls to the nearest row when the column below is empty", () => {
    expect(nextGridFocusId(layout, "b", "down")).toBe("c");
    expect(nextGridFocusId(layout, "c", "down")).toBe("d");
  });

  it("moves up out of a lower row", () => {
    expect(nextGridFocusId(layout, "d", "up")).toBe("a");
    expect(nextGridFocusId(layout, "e", "up")).toBe("c");
  });

  it("is stable when two candidates are equally close", () => {
    const tie = [
      { id: "origin", gridX: 1, gridY: 0 },
      { id: "y", gridX: 0, gridY: 1 },
      { id: "x", gridX: 2, gridY: 1 }
    ];
    expect(nextGridFocusId(tie, "origin", "down")).toBe("x");
    expect(nextGridFocusId(tie, "origin", "down")).toBe("x");
  });

  it("falls back to the first item when the current id is unknown", () => {
    expect(nextGridFocusId(layout, "missing", "right")).toBe("a");
    expect(nextGridFocusId([], "missing", "right")).toBeNull();
  });
});
