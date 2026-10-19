import { describe, it, expect } from "vitest";
import { restoreWindows, windowSession } from "./window-session";
import * as core from "./desktop-core";
const store = core.createEmptyStore();
const user = core.getOrCreateUser(store, { identityIssuer: "test", identitySubject: "test", email: "t@local", displayName: "T", emailVerified: false, avatarUrl: null });
const payload = core.getDesktopPayload(store, user);

describe("window sessions", () => {
  it("restores geometry, minimized state and order without reviving deleted apps", () => {
    const windows = payload.apps.slice(0, 2).map((app, i) => ({ id: String(i), app, x: 8000, y: 9000, width: 900, height: 600, z: 12 - i, mode: "minimized" as const, maximized: true }));
    const restored = restoreWindows(windowSession(payload.desktop.id, windows), payload.desktop.id, [payload.apps[0]], 640, 480);
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({ mode: "minimized", maximized: true, width: 624, height: 380 });
    expect(restored[0].x + restored[0].width).toBeLessThanOrEqual(640);
    expect(restored[0].y).toBeLessThan(480);
  });
  it("rejects another desktop, invalid data and duplicate apps", () => {
    expect(restoreWindows(null, payload.desktop.id, payload.apps, 1000, 800)).toEqual([]);
    expect(restoreWindows({ desktopId: "other", windows: [] }, payload.desktop.id, payload.apps, 1000, 800)).toEqual([]);
    const saved = { desktopId: payload.desktop.id, windows: [null, { appId: payload.apps[0].id, width: Infinity }, { appId: payload.apps[0].id }] };
    expect(restoreWindows(saved, payload.desktop.id, payload.apps, 1000, 800)).toHaveLength(1);
  });
});
