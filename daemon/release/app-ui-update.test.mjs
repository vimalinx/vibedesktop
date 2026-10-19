import { afterEach, describe, it, expect, vi } from "vitest";
import { mkdtemp, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
vi.mock("./app-lifecycle.mjs", () => ({
  updateApp: vi.fn(),
  rollbackApp: vi.fn(),
}));
import { updateApp, rollbackApp } from "./app-lifecycle.mjs";
import { runUiUpdate } from "./app-ui-update.mjs";
const dirs = [];
afterEach(async () => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  await Promise.all(
    dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});
async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "vibe-ui-update-"));
  dirs.push(dir);
  const dataFile = path.join(dir, "desktop.json");
  await writeFile(dataFile, '{"saved":true}');
  return {
    action: "update",
    appRoot: path.join(dir, "app"),
    stateFile: path.join(dir, "state.json"),
    origin: "http://127.0.0.1:3002",
    repo: "file:///fixture",
    dataFile,
  };
}
describe("independent app update worker", () => {
  it("backs up desktop data and reports successful verified installation", async () => {
    const options = await fixture();
    updateApp.mockResolvedValue({ from: "old", to: "new", rolledBack: false });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    await runUiUpdate(options);
    expect(JSON.parse(await readFile(options.stateFile, "utf8")).state).toBe(
      "success",
    );
    const backups = await readdir(
      path.join(path.dirname(options.dataFile), "backups"),
    );
    expect(
      await readFile(
        path.join(
          path.dirname(options.dataFile),
          "backups",
          backups[0],
          "vibedesktop.json",
        ),
        "utf8",
      ),
    ).toBe('{"saved":true}');
    expect(updateApp).toHaveBeenCalledWith(
      expect.objectContaining({
        unit: "vibedesktop-app.service",
        origin: options.origin,
      }),
    );
  });
  it("reports automatic rollback as an unsuccessful update", async () => {
    const options = await fixture();
    updateApp.mockResolvedValue({ from: "old", to: "old", rolledBack: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    await runUiUpdate(options);
    expect(JSON.parse(await readFile(options.stateFile, "utf8")).state).toBe(
      "error",
    );
  });
  it("does not claim success when rollback health fails", async () => {
    const options = await fixture();
    rollbackApp.mockResolvedValue({ from: "new", to: "old" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(
      runUiUpdate({ ...options, action: "rollback" }),
    ).rejects.toThrow("health");
    expect(JSON.parse(await readFile(options.stateFile, "utf8")).state).toBe(
      "error",
    );
  });
});
