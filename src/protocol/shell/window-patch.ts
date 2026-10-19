import type { WindowPatch } from "./package";
/** The shell may change geometry and presentation, never window identity or app data. */
export function normalizeWindowPatch(value: unknown): WindowPatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const patch: WindowPatch = {};
  for (const key of ["x", "y", "width", "height"] as const) {
    if (typeof input[key] === "number" && Number.isFinite(input[key])) patch[key] = Math.max(key === "width" ? 280 : key === "height" ? 160 : 0, Math.min(100_000, input[key]));
  }
  if (input.mode === "open" || input.mode === "minimized") patch.mode = input.mode;
  for (const key of ["maximized", "tiled"] as const) if (typeof input[key] === "boolean") patch[key] = input[key];
  return patch;
}
