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
          note: "running",
          icon_kind: "favicon",
          icon: "data:image/png;base64,ZmFrZQ=="
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
      note: "running",
      iconKind: "favicon",
      iconUrl: "data:image/png;base64,ZmFrZQ=="
    }]);
  });

  it("drops a remote discovery icon without dropping the app", async () => {
    const [candidate] = await discoverLocalWebApps("/workspace", async () => JSON.stringify([{
      name: "No icon",
      source: "project:/tmp/no-icon",
      port: 4322,
      command: "npm",
      args: ["run", "dev"],
      cwd: "/tmp/no-icon",
      running: false,
      registerable: true,
      already_registered: false,
      dev: true,
      note: "stopped",
      icon_kind: "favicon",
      icon: "https://tracker.example/icon.png"
    }]));

    expect(candidate).not.toHaveProperty("iconUrl");
    expect(candidate).not.toHaveProperty("iconKind");
  });

  it("fails closed on invalid scanner output", async () => {
    await expect(discoverLocalWebApps("/workspace", async () => "not-json"))
      .rejects.toBeInstanceOf(LocalAppDiscoveryError);
  });
});
