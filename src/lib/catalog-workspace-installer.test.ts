import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import recipes from "../../catalog/installers/recipes.json";
import { buildCatalogAgentInstallInstruction, buildDockerDataPurgeArgs, catalogDataRoot, catalogWorkspaceRoot, promoteWorkspace, readWorkspaceStatus, restorePreviousWorkspace, trustedWorkspaceRecipe } from "@/lib/catalog-workspace-installer";
import type { LocalAppView } from "@/lib/contracts";

const originalWorkspaceOverride = process.env.VIBE_WORKSPACES_DIR;
const originalCatalogStateOverride = process.env.VIBE_CATALOG_STATE_DIR;
const originalStateHome = process.env.XDG_STATE_HOME;

afterEach(() => {
  if (originalWorkspaceOverride === undefined) delete process.env.VIBE_WORKSPACES_DIR;
  else process.env.VIBE_WORKSPACES_DIR = originalWorkspaceOverride;
  if (originalCatalogStateOverride === undefined) delete process.env.VIBE_CATALOG_STATE_DIR;
  else process.env.VIBE_CATALOG_STATE_DIR = originalCatalogStateOverride;
  if (originalStateHome === undefined) delete process.env.XDG_STATE_HOME;
  else process.env.XDG_STATE_HOME = originalStateHome;
});

describe("catalog workspace installer", () => {
  it("matches all 16 reviewed built-in entries to an official pinned recipe", () => {
    expect(recipes.recipes).toHaveLength(16);
    for (const recipe of recipes.recipes) {
      expect(trustedWorkspaceRecipe(recipe.id)).toMatchObject({
        id: recipe.id,
        repositoryUrl: recipe.repositoryUrl,
        sourceRef: recipe.sourceRef,
        port: recipe.port
      });
    }
    expect(trustedWorkspaceRecipe("chatgpt")).toBeNull();
    expect(trustedWorkspaceRecipe("unknown-project")).toBeNull();
  });

  it("uses one deterministic, operator-overridable workspace root", () => {
    process.env.VIBE_WORKSPACES_DIR = "/tmp/vibedesktop-workspaces-test";
    expect(catalogWorkspaceRoot()).toBe("/tmp/vibedesktop-workspaces-test");
  });

  it("puts persistent catalog application data under XDG_STATE_HOME", () => {
    delete process.env.VIBE_CATALOG_STATE_DIR;
    process.env.XDG_STATE_HOME = "/tmp/vibedesktop-state-test";
    expect(catalogDataRoot()).toBe("/tmp/vibedesktop-state-test/vibedesktop/apps");
    process.env.VIBE_CATALOG_STATE_DIR = "/tmp/vibedesktop-catalog-state-override";
    expect(catalogDataRoot()).toBe("/tmp/vibedesktop-catalog-state-override");
  });

  it("builds a network-isolated cleanup for container-owned XDG state", () => {
    const dataPath = "/tmp/vibedesktop-state-test/vibedesktop/apps/memos";
    const image = "neosmemo/memos@sha256:71a5b4738d1bed96e92112004054f0888e92791b64eb78afd79077c96e6f9327";
    expect(buildDockerDataPurgeArgs(dataPath, image)).toEqual([
      "run", "--rm", "--network", "none", "--user", "0:0", "--entrypoint", "/bin/sh",
      "--volume", `${dataPath}:/vibedesktop-purge:rw`, image,
      "-c", "find /vibedesktop-purge -mindepth 1 -depth -delete"
    ]);
    expect(() => buildDockerDataPurgeArgs("relative/data", image)).toThrow("absolute data path");
    expect(() => buildDockerDataPurgeArgs(dataPath, "neosmemo/memos:stable")).toThrow("immutable image digest");
  });

  it("builds a bounded Agent installation task without rerunning the official endpoint", async () => {
    process.env.VIBE_WORKSPACES_DIR = "/tmp/vibedesktop-agent-workspaces";
    const result = await buildCatalogAgentInstallInstruction("github-memos", "http://127.0.0.1:3999");
    expect(result).toMatchObject({
      itemId: "github-memos",
      repositoryUrl: "https://github.com/usememos/memos",
      workspacePath: "/tmp/vibedesktop-agent-workspaces/memos"
    });
    expect(result.instruction).toContain("de843f658a8d06badb87784e6b70ea32c6a6ee03");
    expect(result.instruction).toContain("/tmp/vibedesktop-agent-workspaces/memos/agent/install.sh");
    expect(result.instruction).toContain("/vibedesktop/apps/memos");
    expect(result.instruction).toContain("/api/catalog-installs/github-memos/agent-complete");
    expect(result.instruction).toContain("$SKILL_DIR/add.py");
    expect(result.instruction).toContain("running=true、healthy=true");
    expect(result.instruction).toContain("用户已在 Vibe Desktop 的安装方式面板中明确选择由本地 Agent 安装");
    expect(result.instruction).not.toMatch(/Bearer|daemon\.token/);
    expect(result.instruction).not.toContain("'http://127.0.0.1:3999/api/catalog-installs/github-memos'\n");
  });

  it("recognizes a legacy registered install as updateable even when it is stopped", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "vibedesktop-legacy-catalog-"));
    process.env.VIBE_WORKSPACES_DIR = root;
    const workspace = path.join(root, "memos");
    const source = path.join(workspace, "source");
    await mkdir(path.join(workspace, "data"), { recursive: true });
    await mkdir(source, { recursive: true });
    await writeFile(path.join(workspace, ".vibedesktop-workspace.json"), JSON.stringify({
      schemaVersion: 1,
      itemId: "github-memos",
      title: "Memos",
      state: "installed",
      message: "legacy install",
      workspacePath: workspace,
      updatedAt: "2026-01-01T00:00:00.000Z",
      appId: "legacy-memos",
      port: 5230,
      repositoryUrl: "https://github.com/usememos/memos",
      sourcePath: source
    }));
    const recipe = trustedWorkspaceRecipe("github-memos")!;
    const apps = [{ id: "legacy-memos", cwd: source, status: { running: false, healthy: false } }] as unknown as LocalAppView[];
    const status = await readWorkspaceStatus(recipe, apps);
    expect(status).toMatchObject({
      state: "update_available",
      running: false,
      healthy: false,
      dataPath: path.join(workspace, "data")
    });
    await rm(root, { recursive: true, force: true });
  });

  it("does not copy an untrusted Host header into Agent shell instructions", async () => {
    const result = await buildCatalogAgentInstallInstruction("github-memos", "https://evil.example");
    expect(result.instruction).toContain("http://127.0.0.1:3002/api/catalog-installs/github-memos/agent-complete");
    expect(result.instruction).not.toContain("evil.example");
  });

  it("preserves user data while promoting and rolling back an installer workspace", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "vibedesktop-promotion-test-"));
    const staging = path.join(root, "app.staging");
    const target = path.join(root, "app");
    try {
      await mkdir(path.join(staging, "data", "new-empty"), { recursive: true });
      await mkdir(path.join(staging, "source"), { recursive: true });
      await writeFile(path.join(staging, "source", "version"), "new");
      await mkdir(path.join(target, "data"), { recursive: true });
      await mkdir(path.join(target, "source"), { recursive: true });
      await writeFile(path.join(target, "data", "user.db"), "keep-me");
      await writeFile(path.join(target, "source", "version"), "old");

      const promotion = await promoteWorkspace(staging, target);
      expect(promotion).not.toBeNull();
      expect(await readFile(path.join(target, "data", "user.db"), "utf8")).toBe("keep-me");
      expect(await readFile(path.join(target, "source", "version"), "utf8")).toBe("new");

      await restorePreviousWorkspace(target, promotion!);
      expect(await readFile(path.join(target, "data", "user.db"), "utf8")).toBe("keep-me");
      expect(await readFile(path.join(target, "source", "version"), "utf8")).toBe("old");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
