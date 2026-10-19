import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import path from "node:path";
import { it, expect } from "vitest";
import { verifyAgentSource } from "./catalog-workspace-installer";
const exec = promisify(execFile);
it("verifies actual repository and commit, tracked content and saved installer", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vd-agent-source-"));
  const source = path.join(root, "source"); await mkdir(source);
  const git = async (...args: string[]) => (await exec("git", ["-C", source, ...args])).stdout.trim();
  try {
    await git("init", "-q"); await git("config", "user.name", "Fixture"); await git("config", "user.email", "fixture@localhost");
    await git("remote", "add", "origin", "https://example.com/reviewed.git");
    await writeFile(path.join(source, "app.txt"), "reviewed"); await git("add", "app.txt"); await git("-c", "commit.gpgsign=false", "commit", "-qm", "fixture");
    const sourceRef = await git("rev-parse", "HEAD");
    const recipe = { repositoryUrl: "https://example.com/reviewed", sourceRef };
    await expect(verifyAgentSource(source, recipe)).rejects.toMatchObject({ code: "agent_source_unverified" });
    await mkdir(path.join(root, "agent")); await writeFile(path.join(root, "agent", "install.sh"), "#!/bin/sh\n");
    expect(await verifyAgentSource(source, recipe)).toBe(sourceRef);
    await expect(verifyAgentSource(source, { ...recipe, sourceRef: "0".repeat(40) })).rejects.toMatchObject({ code: "agent_source_unverified" });
    await expect(verifyAgentSource(source, { ...recipe, repositoryUrl: "https://example.com/other" })).rejects.toMatchObject({ code: "agent_source_unverified" });
    await writeFile(path.join(source, "app.txt"), "modified");
    await expect(verifyAgentSource(source, recipe)).rejects.toMatchObject({ code: "agent_source_unverified" });
  } finally { await rm(root, { recursive: true, force: true }); }
});
