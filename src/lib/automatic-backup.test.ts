import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/desktop-helpers", () => ({ readLocalJson: vi.fn() }));
vi.mock("@/lib/browser-local-assets", () => ({
  appendBackupHistory: vi.fn(),
  loadBackupHistory: vi.fn(),
}));
vi.mock("@/lib/desktop-backup", () => ({ createDesktopBackup: vi.fn() }));
vi.mock("@/lib/desktop-activity", () => ({
  runActivity: (_title: string, work: () => Promise<unknown>) => work(),
}));
import { readLocalJson } from "./desktop-helpers";
import { appendBackupHistory, loadBackupHistory } from "./browser-local-assets";
import { createDesktopBackup } from "./desktop-backup";
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubGlobal("document", { hidden: false });
  vi.stubGlobal("navigator", {});
  vi.mocked(readLocalJson).mockReturnValue({ hours: 24, retain: 3 });
  vi.mocked(loadBackupHistory).mockResolvedValue([]);
  vi.mocked(createDesktopBackup).mockResolvedValue({
    createdAt: new Date().toISOString(),
  } as Awaited<ReturnType<typeof createDesktopBackup>>);
});
describe("automatic snapshots", () => {
  it("saves a due snapshot once when ticks overlap", async () => {
    const { automaticBackupTick } = await import("./automatic-backup");
    await Promise.all([automaticBackupTick(), automaticBackupTick()]);
    expect(appendBackupHistory).toHaveBeenCalledTimes(1);
    expect(appendBackupHistory).toHaveBeenCalledWith(expect.anything(), 3);
  });
  it("skips hidden desktops and recent snapshots", async () => {
    const { automaticBackupTick } = await import("./automatic-backup");
    vi.stubGlobal("document", { hidden: true });
    await automaticBackupTick();
    expect(loadBackupHistory).not.toHaveBeenCalled();
    vi.stubGlobal("document", { hidden: false });
    vi.mocked(loadBackupHistory).mockResolvedValue([
      {
        id: "recent",
        backup: { createdAt: new Date().toISOString() } as Awaited<
          ReturnType<typeof createDesktopBackup>
        >,
      },
    ]);
    await automaticBackupTick();
    expect(appendBackupHistory).not.toHaveBeenCalled();
  });
  it("backs off after a storage failure rather than repeatedly copying assets", async () => {
    const { automaticBackupTick } = await import("./automatic-backup");
    vi.mocked(appendBackupHistory).mockRejectedValue(Error("Storage full"));
    await expect(automaticBackupTick()).rejects.toThrow("Storage full");
    await automaticBackupTick();
    expect(createDesktopBackup).toHaveBeenCalledTimes(1);
  });
});

afterEach(() => vi.unstubAllGlobals());
