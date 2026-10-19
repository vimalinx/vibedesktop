import { describe, expect, it } from "vitest";
import { expandRecipeValue, loadRecipes, validateComposeConfig } from "../../catalog/installers/official-installer.mjs";

describe("official catalog installer recipes", () => {
  it("pins all reviewed source commits and direct container images", async () => {
    const recipes = await loadRecipes();
    expect(recipes).toHaveLength(16);
    expect(new Set(recipes.map((recipe) => recipe.id)).size).toBe(16);
    for (const recipe of recipes) {
      expect(recipe.sourceRef).toMatch(/^[a-f0-9]{40}$/);
      if (recipe.kind === "container") expect(recipe.image).toMatch(/@sha256:[a-f0-9]{64}$/);
    }
    expect(recipes.filter((recipe) => recipe.kind === "container")).toHaveLength(10);
    expect(recipes.filter((recipe) => recipe.kind === "compose")).toHaveLength(4);
    expect(recipes.filter((recipe) => recipe.kind === "python")).toHaveLength(2);
  });

  it("reuses named secrets across cooperating services", () => {
    const secrets = new Map();
    const context = { target: "/tmp/target", port: 9001 };
    const first = expandRecipeValue("$SECRET_PENPOT", context, secrets);
    const second = expandRecipeValue("$SECRET_PENPOT", context, secrets);
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("accepts loopback-only workspace binds", () => {
    expect(() => validateComposeConfig({ services: { web: {
      ports: [{ host_ip: "127.0.0.1", published: "9000", target: 80 }],
      volumes: [{ type: "bind", source: "/tmp/staging/data", target: "/data" }]
    } } }, "/tmp/staging", "/tmp/target")).not.toThrow();
  });

  it("expands and permits an explicit XDG state data root", () => {
    const context = { target: "/tmp/target", data: "/tmp/state/vibedesktop/apps/demo", port: 9001 };
    expect(expandRecipeValue("$DATA/files", context)).toBe("/tmp/state/vibedesktop/apps/demo/files");
    expect(() => validateComposeConfig({ services: { web: {
      ports: [{ host_ip: "127.0.0.1", published: "9001", target: 80 }],
      volumes: [{ type: "bind", source: "/tmp/state/vibedesktop/apps/demo/files", target: "/data" }]
    } } }, "/tmp/staging", "/tmp/target", context.data)).not.toThrow();
  });

  it("fails closed on LAN ports, named volumes, and outside host paths", () => {
    expect(() => validateComposeConfig({ services: { web: { ports: [{ published: "9000", target: 80 }] } } }, "/tmp/staging", "/tmp/target")).toThrow(/non-loopback/);
    expect(() => validateComposeConfig({ services: { web: { volumes: [{ type: "volume", source: "database", target: "/data" }] } } }, "/tmp/staging", "/tmp/target")).toThrow(/named volume/);
    expect(() => validateComposeConfig({ services: { web: { volumes: [{ type: "bind", source: "/home/user", target: "/data" }] } } }, "/tmp/staging", "/tmp/target")).toThrow(/outside its workspace/);
  });
});
