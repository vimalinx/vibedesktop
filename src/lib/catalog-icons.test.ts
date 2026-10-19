import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { catalogIconDataUrl, catalogIconFileName } from "@/lib/catalog-icons";
import { appDirectory } from "@/lib/seed-data";

describe("offline catalog icon registry", () => {
  it("gives every built-in directory entry a vendored genuine icon", () => {
    expect(appDirectory.length).toBeGreaterThanOrEqual(24);
    for (const app of appDirectory) {
      const fileName = catalogIconFileName(app.id);
      expect(fileName, app.id).toBeTruthy();
      expect(app.iconUrl, app.id).toBe(`/catalog-icons/${fileName}`);
      const absolutePath = path.join(process.cwd(), "public", "catalog-icons", fileName!);
      expect(existsSync(absolutePath), app.id).toBe(true);
      expect(readFileSync(absolutePath).byteLength, app.id).toBeGreaterThan(0);
    }
  });

  it("marks every curated GitHub project as a local-ready WebUI with a valid port", () => {
    const projects = appDirectory.filter((app) => app.catalogKind === "github_app");
    expect(projects.length).toBeGreaterThanOrEqual(16);
    for (const app of projects) {
      expect(app.selfHosted, app.id).toBe(true);
      expect(app.defaultPort, app.id).toBeGreaterThanOrEqual(1);
      expect(app.defaultPort, app.id).toBeLessThanOrEqual(65535);
    }
  });

  it("generates a deterministic escaped fallback icon for custom entries", () => {
    const first = catalogIconDataUrl("custom-id", "<My & App>");
    const second = catalogIconDataUrl("custom-id", "<My & App>");

    expect(first).toBe(second);
    expect(decodeURIComponent(first)).toContain("&lt;My &amp; App&gt;");
    expect(first).not.toContain("<script");
  });
});
