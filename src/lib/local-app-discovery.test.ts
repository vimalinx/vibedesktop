import { describe, expect, it } from "vitest";
import { discoverLocalWebApps, LocalAppDiscoveryError } from "@/lib/local-app-discovery";

describe("local WebUI discovery bridge", () => {
  it("normalizes scanner output and drops malformed candidates", async () => {
    const candidates = await discoverLocalWebApps("/workspace", async (scriptPath, projectRoot) => {
      expect(scriptPath).toBe("/workspace/.claude/skills/add_app/scan.py");
      expect(projectRoot).toBe("/workspace");
      return JSON.stringify([
        {
          name: "Fixture UI",
          source: "project:/tmp/fixture",
          port: 4321,
          command: "npm",
          args: ["run", "dev"],
          cwd: "/tmp/fixture",
          running: true,
          registerable: true,
          already_registered: false,
          dev: true,
          note: "running"
        },
        { name: "bad", source: "x", note: "bad", port: 70000 }
      ]);
    });

    expect(candidates).toEqual([{
      name: "Fixture UI",
      source: "project:/tmp/fixture",
      port: 4321,
      command: "npm",
      args: ["run", "dev"],
      cwd: "/tmp/fixture",
      running: true,
      registerable: true,
      alreadyRegistered: false,
      dev: true,
      note: "running"
    }]);
  });

  it("fails closed on invalid scanner output", async () => {
    await expect(discoverLocalWebApps("/workspace", async () => "not-json"))
      .rejects.toBeInstanceOf(LocalAppDiscoveryError);
  });
});
