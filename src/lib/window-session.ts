import type { DesktopApp } from "@/lib/contracts";
import type { AppWindowState } from "@/protocol/shell/v1";

export const windowSessionKey = "vd:windows:v1";

/** Resolve saved IDs against today's apps; never resurrect deleted shortcuts. */
export function restoreWindows(value: unknown, desktopId: string, apps: DesktopApp[], width: number, height: number): AppWindowState[] {
  if (!value || typeof value !== "object" || !("desktopId" in value) || value.desktopId !== desktopId ||
      !("windows" in value) || !Array.isArray(value.windows)) return [];
  const seen = new Set<string>();
  return value.windows.slice(0, 50).flatMap((saved) => {
    if (!saved || typeof saved !== "object" || typeof saved.appId !== "string" || seen.has(saved.appId)) return [];
    const app = apps.find((candidate) => candidate.id === saved.appId);
    if (!app) return [];
    seen.add(app.id);
    const finite = (v: unknown, fallback: number) => typeof v === "number" && Number.isFinite(v) ? v : fallback;
    const w = Math.min(Math.max(280, finite(saved.width, 800)), Math.max(280, width - 16));
    const h = Math.min(Math.max(200, finite(saved.height, 600)), Math.max(200, height - 100));
    return [{ id: crypto.randomUUID(), app, width: w, height: h,
      x: Math.max(8, Math.min(finite(saved.x, 32), Math.max(8, width - w))),
      y: Math.max(8, Math.min(finite(saved.y, 32), Math.max(8, height - h - 82))),
      z: 10 + seen.size, mode: saved.mode === "minimized" ? "minimized" as const : "open" as const,
      maximized: saved.maximized === true, tiled: saved.tiled === true }];
  });
}

export function windowSession(desktopId: string, windows: AppWindowState[]) {
  return { desktopId, windows: [...windows].sort((a, b) => a.z - b.z).map(({ app, x, y, width, height, mode, maximized, tiled }) =>
    ({ appId: app.id, x, y, width, height, mode, maximized, tiled })) };
}
