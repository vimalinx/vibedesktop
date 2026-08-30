import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { buildAddAppSkillInstallCommand } from "@/lib/add-app-skill-contract";
import {
  buildAddAppSkillInstaller,
  listAddAppSkillFileNames
} from "@/lib/add-app-skill-installer";

describe("add_app skill installer", () => {
  it("embeds the canonical bundle in an atomic cross-agent installer", () => {
    const files = Object.fromEntries(
      listAddAppSkillFileNames().map((name) => [name, Buffer.from(`body:${name}`)])
    ) as Parameters<typeof buildAddAppSkillInstaller>[0];
    const installer = buildAddAppSkillInstaller(files);

    expect(listAddAppSkillFileNames()).toEqual([
      "SKILL.md", "add.py", "scan.py", "manager.py",
      "references/managed-bundles.md", "agents/openai.yaml"
    ]);
    expect(installer).toContain(Buffer.from("body:SKILL.md").toString("base64"));
    expect(installer).toContain("os.replace(temporary, target)");
    expect(installer).toContain('Path.home() / ".claude" / "skills" / "add_app"');
    expect(installer).toContain('Path.home() / ".codex" / "skills" / "add-app"');
    expect(installer).toContain('Path.home() / ".agents" / "skills" / "add-app"');
    expect(installer).not.toContain("__pycache__");
  });

  it("builds a same-origin command for the hosted installer", () => {
    expect(buildAddAppSkillInstallCommand("https://vibedesktop.example/api/setup/copy-skills")).toBe(
      "curl -fsSL 'https://vibedesktop.example/api/setup/add-app-skill' | sh"
    );
  });
});
