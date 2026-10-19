import { describe, it, expect } from "vitest";
import { splitBounds, tileWindows } from "./window-layout";
import type { AppWindowState } from "@/protocol/shell/v1";
describe("window layout", () => {
  it("leaves a gutter between halves and space for the dock", () => {
    const left = splitBounds("left", 1440, 1000),
      right = splitBounds("right", 1440, 1000);
    expect(left.x + left.width).toBeLessThan(right.x);
    expect(right.x + right.width).toBeLessThan(1440);
    expect(left.y + left.height).toBeLessThan(920);
  });
  it("tiles visible windows without restoring minimized windows", () => {
    const wins = [
      { id: "a", mode: "open" },
      { id: "b", mode: "open" },
      { id: "c", mode: "minimized" },
    ] as AppWindowState[];
    const tiled = tileWindows(wins, 1440, 1000);
    expect(tiled[2]).toBe(wins[2]);
    expect(tiled[0].x + tiled[0].width).toBeLessThan(tiled[1].x);
    expect(tileWindows(wins, 390, 844)[0].maximized).toBe(true);
  });
});
