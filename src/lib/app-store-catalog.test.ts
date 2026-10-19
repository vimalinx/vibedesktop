import { describe, expect, it } from "vitest";
import { catalogBrowseCategory, catalogDeveloper, catalogSearchText, normalizeFollowedDeveloperIds } from "@/lib/app-store-catalog";
import type { AppDirectoryItem } from "@/lib/contracts";

const item: AppDirectoryItem = {
  id: "github-example",
  title: "Example",
  url: "https://example.com",
  description: "A tool",
  iconUrl: "",
  openingMode: "external_tab",
  category: "developer-tools",
  catalogKind: "github_app",
  repositoryUrl: "https://github.com/Example-Org/project",
  trialUrl: "https://try.example.com",
  language: "TypeScript",
  license: "MIT"
};

describe("app store catalog helpers", () => {
  it("derives a stable developer identity from a reviewed GitHub repository", () => {
    expect(catalogDeveloper(item)).toEqual({
      id: "example-org",
      label: "Example-Org",
      url: "https://github.com/Example-Org"
    });
  });

  it("includes developer and official trial metadata in search", () => {
    const text = catalogSearchText(item, "Localized title", "Localized description");
    expect(text).toContain("example-org");
    expect(text).toContain("try.example.com");
    expect(text).toContain("localized title");
  });

  it("normalizes local followed-developer state", () => {
    expect(normalizeFollowedDeveloperIds([" Example-Org ", "example-org", 3, "Other"])).toEqual([
      "example-org",
      "other"
    ]);
  });

  it.each([
    ["global-ai", "technology"],
    ["developer-tools", "technology"],
    ["design", "creative"],
    ["media", "creative"],
    ["documents", "daily"],
    ["notes", "daily"],
    ["finance", "finance"],
    ["community-special", "other"]
  ])("maps the detailed %s tag into the broad %s department", (category, expected) => {
    expect(catalogBrowseCategory({ category })).toBe(expected);
  });
});
