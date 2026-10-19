import { NextResponse } from "next/server";
import { apiError, rejectCrossOriginMutation } from "@/lib/api-response";
import { requireCurrentUser } from "@/lib/auth";
import { withStore } from "@/lib/store";
import * as core from "@/lib/desktop-core";
import {
  firstOpenGridSpanPosition,
  gridSpanIsFree,
  markGridSpan,
  desktopGridMinColumns,
} from "@/lib/desktop-grid";
import { desktopGridSpanForApp } from "@/lib/desktop-helpers";
import { validateSnapshot } from "@/lib/desktop-backup-contract";
export async function POST(request: Request) {
  const denied = rejectCrossOriginMutation(request);
  if (denied) return denied;
  try {
    const raw = await request.text();
    if (raw.length > 8 * 1024 * 1024)
      return apiError(413, "too_large", "Request exceeds 8 MB.");
    const input = JSON.parse(raw);
    if (input.action !== "delete" && input.action !== "undo")
      throw new Error("Invalid batch action.");
    if (
      !Array.isArray(input.ids) ||
      input.ids.length > 500 ||
      input.ids.some((id: unknown) => typeof id !== "string")
    )
      throw new Error("Invalid app IDs.");
    const snapshot =
      input.action === "undo" ? validateSnapshot(input.snapshot) : null;
    const user = await requireCurrentUser();
    return NextResponse.json(
      await withStore((store) => {
        const current = core.getDesktopPayload(store, user);
        const ids = new Set(input.ids);
        if (snapshot) {
          if (snapshot.desktop.id !== current.desktop.id)
            throw new Error("Desktop changed; reload before undo.");
          const existing = new Set(store.apps.map((a) => a.id));
          const taken = new Set<string>();
          for (const app of current.apps)
            markGridSpan(taken, app, desktopGridSpanForApp(app));
          for (const app of snapshot.apps.filter(
            (a) => ids.has(a.id) && a.kind !== "builtin" && !existing.has(a.id),
          )) {
            const span = desktopGridSpanForApp(app);
            const position = gridSpanIsFree(taken, app.gridX, app.gridY, span)
              ? { gridX: app.gridX, gridY: app.gridY }
              : firstOpenGridSpanPosition(taken, span, desktopGridMinColumns);
            store.apps.push({ ...app, ...position });
            markGridSpan(taken, position, span);
          }
        } else {
          store.apps = store.apps.filter(
            (a) =>
              a.desktopId !== current.desktop.id ||
              a.kind === "builtin" ||
              !ids.has(a.id),
          );
          if (
            current.desktop.startAppId &&
            ids.has(current.desktop.startAppId) &&
            !store.apps.some((a) => a.id === current.desktop.startAppId)
          )
            current.desktop.startAppId = null;
        }
        return core.getDesktopPayload(store, user);
      }),
    );
  } catch (error) {
    return apiError(
      400,
      "invalid_batch",
      error instanceof Error ? error.message : "Invalid request.",
    );
  }
}
