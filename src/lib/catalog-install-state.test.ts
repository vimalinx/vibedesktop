import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { EventEmitter } from "node:events";
vi.mock("@/lib/daemon-client", () => ({ listLocalApps: vi.fn(), getLocalApp: vi.fn(), controlLocalApp: vi.fn(), createLocalApp: vi.fn(), deleteLocalApp: vi.fn(), updateLocalApp: vi.fn() }));
vi.mock("node:child_process", async (original) => ({ ...await original<typeof import("node:child_process")>(), spawn: vi.fn(() => {
  const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), kill: vi.fn() });
  queueMicrotask(() => child.emit("exit", 1)); return child;
}) }));
import { listLocalApps } from "@/lib/daemon-client";
import { listCatalogWorkspaceInstalls, startCatalogWorkspaceInstall, trustedWorkspaceRecipe } from "./catalog-workspace-installer";
let root = "";
afterEach(async () => { await vi.waitFor(() => expect(runtime().jobs.size === 0 || [...runtime().jobs.values()].every((s: { state: string }) => s.state === "needs_agent" || s.state === "installed")).toBe(true)); runtime().jobs.clear(); if (root) await rm(root, { recursive: true, force: true }); vi.unstubAllEnvs(); vi.clearAllMocks(); });
function runtime() { return (globalThis as typeof globalThis & { __vibedesktopCatalogInstallRuntime: { jobs: Map<string, any> } }).__vibedesktopCatalogInstallRuntime; } // eslint-disable-line @typescript-eslint/no-explicit-any
async function fixture() {
  root = await mkdtemp(path.join(os.tmpdir(), "vd-catalog-state-")); vi.stubEnv("VIBE_WORKSPACES_DIR", root); vi.stubEnv("VIBE_CATALOG_STATE_DIR", path.join(root, "state"));
  const recipe = trustedWorkspaceRecipe("github-memos")!; const workspace = path.join(root, "memos"); await mkdir(workspace);
  const manifest = { schemaVersion: 3, itemId: recipe.id, title: recipe.title, state: "installed", message: "installed", workspacePath: workspace, sourcePath: path.join(workspace, "source"), repositoryUrl: recipe.repositoryUrl, sourceRef: recipe.sourceRef, appId: "gone", running: true, healthy: true };
  await writeFile(path.join(workspace, ".vibedesktop-workspace.json"), JSON.stringify(manifest)); return manifest;
}
describe("catalog live state and repair", () => {
  it("ignores completed job cache and reports missing registration", async () => {
    const manifest = await fixture(); runtime().jobs.set(manifest.itemId, manifest); vi.mocked(listLocalApps).mockResolvedValue([]);
    expect((await listCatalogWorkspaceInstalls()).find(s => s.itemId === manifest.itemId)).toMatchObject({ state: "needs_agent", running: false, healthy: false });
  });
  it("reports unknown health when the daemon is unreachable", async () => {
    const manifest = await fixture(); vi.mocked(listLocalApps).mockRejectedValue(new Error("offline"));
    expect((await listCatalogWorkspaceInstalls()).find(s => s.itemId === manifest.itemId)).toMatchObject({ state: "installed", running: undefined, healthy: undefined });
  });
  it("starts one repair for simultaneous requests after registration disappears", async () => {
    await fixture(); vi.mocked(listLocalApps).mockResolvedValue([]);
    const statuses = await Promise.all([startCatalogWorkspaceInstall("github-memos"), startCatalogWorkspaceInstall("github-memos")]);
    expect(statuses.map(s => s.state)).toEqual(["queued", "queued"]);
    expect(listLocalApps).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(runtime().jobs.get("github-memos")?.state).toBe("needs_agent"));
  });
});
