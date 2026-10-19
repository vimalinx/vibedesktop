import type { AppWindowState } from "@/protocol/shell/v1";
export function splitBounds(
  side: "left" | "right",
  width: number,
  height: number,
) {
  const w = Math.max(1, (width - 24) / 2);
  return {
    x: side === "left" ? 8 : 16 + w,
    y: 80,
    width: w,
    height: Math.max(1, height - 170),
    maximized: false,
    tiled: true,
  };
}
export function tileWindows(
  windows: AppWindowState[],
  width: number,
  height: number,
): AppWindowState[] {
  const open = windows.filter((w) => w.mode === "open");
  const cols = width < 640 ? 1 : Math.max(1, Math.ceil(Math.sqrt(open.length)));
  const rows = Math.max(1, Math.ceil(open.length / cols));
  const w = Math.max(1, (width - 8 * (cols + 1)) / cols),
    h = Math.max(1, (height - 162 - 8 * rows) / rows);
  let i = 0;
  return windows.map((win) =>
    win.mode !== "open"
      ? win
      : {
          ...win,
          x: 8 + (i % cols) * (w + 8),
          y: 80 + Math.floor(i++ / cols) * (h + 8),
          width: w,
          height: h,
          maximized: width < 640,
          tiled: true,
        },
  );
}
