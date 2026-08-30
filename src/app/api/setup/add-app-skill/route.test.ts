import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/setup/add-app-skill/route";

describe("GET /api/setup/add-app-skill", () => {
  it("serves a self-contained local installer without cache or path leakage", async () => {
    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/x-shellscript");
    expect(body).toContain("VIBEDESKTOP_ADD_APP_INSTALLER");
    expect(body).toContain('Path.home() / ".claude" / "skills" / "add_app"');
    expect(body).toContain('Path.home() / ".codex" / "skills" / "add-app"');
    expect(body).toContain("managed-bundles.md");
    expect(body).not.toContain(process.cwd());
  });
});
