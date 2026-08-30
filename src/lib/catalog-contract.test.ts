import { describe, expect, it } from "vitest";
import {
  catalogFormatVersion,
  defaultCatalogCategory,
  mergeDirectorySources,
  parseCatalogArtifact
} from "@/lib/catalog-contract";
import type { AppDirectoryItem } from "@/lib/contracts";

const pngIcon = "data:image/png;base64,iVBORw0KGgo=";

function artifact(entries: unknown[]): unknown {
  return { formatVersion: catalogFormatVersion, generatedAt: "2026-08-11T00:00:00.000Z", entries };
}

function validEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "example",
    title: "Example",
    url: "https://example.com",
    description: "An example entry.",
    icon: pngIcon,
    category: "community",
    ...overrides
  };
}

function item(overrides: Partial<AppDirectoryItem> = {}): AppDirectoryItem {
  return {
    id: "seeded",
    title: "Seeded",
    url: "https://seeded.example",
    description: "",
    iconUrl: "",
    openingMode: "external_tab",
    category: "system",
    ...overrides
  };
}

describe("parseCatalogArtifact — whitelist projection", () => {
  it("emits only known keys, so executable fields cannot survive the parse", () => {
    const [entry] = parseCatalogArtifact(
      artifact([
        validEntry({
          command: "docker",
          args: ["compose", "up"],
          cwd: "/home/someone",
          port: 8080,
          env: { TOKEN: "secret" },
          preload: "./evil.js"
        })
      ])
    );

    expect(entry).toBeDefined();
    expect(Object.keys(entry!).sort()).toEqual([
      "catalogKind",
      "category",
      "description",
      "iconUrl",
      "id",
      "openingMode",
      "title",
      "url"
    ]);
    for (const key of ["command", "args", "cwd", "port", "env", "preload"]) {
      expect(entry).not.toHaveProperty(key);
    }
  });

  it("forces external_tab even when the entry asks to be framed into the desktop", () => {
    const [entry] = parseCatalogArtifact(artifact([validEntry({ openingMode: "desktop_window" })]));

    expect(entry!.openingMode).toBe("external_tab");
  });

  it("keeps reviewed GitHub index metadata but still drops executable fields", () => {
    const [entry] = parseCatalogArtifact(artifact([validEntry({
      catalogKind: "github_app",
      repositoryUrl: "https://github.com/example/project",
      stars: 12345,
      language: "TypeScript",
      license: "MIT",
      verifiedAt: "2026-08-29",
      command: "npm run dev"
    })]));

    expect(entry).toMatchObject({
      catalogKind: "github_app",
      repositoryUrl: "https://github.com/example/project",
      stars: 12345,
      language: "TypeScript",
      license: "MIT",
      verifiedAt: "2026-08-29"
    });
    expect(entry).not.toHaveProperty("command");
  });

  it.each([
    "https://gitlab.com/example/project",
    "http://github.com/example/project",
    "https://github.com/example",
    "https://github.com/example/project/issues"
  ])("drops a GitHub application with an invalid repository URL: %s", (repositoryUrl) => {
    expect(parseCatalogArtifact(artifact([validEntry({ catalogKind: "github_app", repositoryUrl })]))).toEqual([]);
  });
});

describe("parseCatalogArtifact — url validation", () => {
  it.each([
    ["javascript:", "javascript:alert(1)"],
    ["file:", "file:///etc/passwd"],
    ["data:", "data:text/html,<script>"],
    ["credentials", "https://user:pass@example.com"],
    ["not a url", "not-a-url"],
    ["empty", ""]
  ])("drops an entry whose url is %s", (_label, url) => {
    const items = parseCatalogArtifact(artifact([validEntry({ id: "bad", url })]));

    expect(items).toEqual([]);
  });

  it("drops only the offending entry and keeps its siblings", () => {
    const items = parseCatalogArtifact(
      artifact([
        validEntry({ id: "good-1" }),
        validEntry({ id: "bad", url: "javascript:alert(1)" }),
        validEntry({ id: "good-2" })
      ])
    );

    expect(items.map((entry) => entry.id)).toEqual(["good-1", "good-2"]);
  });

  it("accepts http as well as https", () => {
    const items = parseCatalogArtifact(artifact([validEntry({ url: "http://example.com/" })]));

    expect(items).toHaveLength(1);
    expect(items[0]!.url).toBe("http://example.com/");
  });
});

describe("parseCatalogArtifact — icons", () => {
  it("keeps an inlined data: icon", () => {
    const [entry] = parseCatalogArtifact(artifact([validEntry({ icon: pngIcon })]));

    expect(entry!.iconUrl).toBe(pngIcon);
  });

  it("accepts the iconUrl field name as well as icon", () => {
    const [entry] = parseCatalogArtifact(artifact([validEntry({ icon: undefined, iconUrl: pngIcon })]));

    expect(entry!.iconUrl).toBe(pngIcon);
  });

  it.each([
    ["https", "https://icons.example.com/a.ico"],
    ["http", "http://icons.example.com/a.ico"],
    ["protocol-relative", "//icons.example.com/a.ico"],
    ["non-image data url", "data:text/html;base64,PHNjcmlwdD4="]
  ])("rejects a %s icon so rendering makes no third-party request", (_label, icon) => {
    const [entry] = parseCatalogArtifact(artifact([validEntry({ icon })]));

    // The entry itself survives — only its icon is refused; the store falls
    // back to rendering initials.
    expect(entry).toBeDefined();
    expect(entry!.iconUrl).toBe("");
  });
});

describe("parseCatalogArtifact — required and default fields", () => {
  it.each(["id", "title"])("drops an entry missing %s", (field) => {
    expect(parseCatalogArtifact(artifact([validEntry({ [field]: undefined })]))).toEqual([]);
    expect(parseCatalogArtifact(artifact([validEntry({ [field]: "   " })]))).toEqual([]);
  });

  it("defaults a missing description to an empty string", () => {
    const [entry] = parseCatalogArtifact(artifact([validEntry({ description: undefined })]));

    expect(entry!.description).toBe("");
  });

  it("defaults a missing category and passes an unknown one through", () => {
    const [defaulted] = parseCatalogArtifact(artifact([validEntry({ category: undefined })]));
    const [custom] = parseCatalogArtifact(artifact([validEntry({ category: "self-hosted" })]));

    expect(defaulted!.category).toBe(defaultCatalogCategory);
    expect(custom!.category).toBe("self-hosted");
  });

  it("trims surrounding whitespace on text fields", () => {
    const [entry] = parseCatalogArtifact(
      artifact([validEntry({ id: "  spaced  ", title: "  Spaced  ", description: "  Desc  " })])
    );

    expect(entry).toMatchObject({ id: "spaced", title: "Spaced", description: "Desc" });
  });

  it("keeps the first of two entries sharing an id, deterministically", () => {
    const items = parseCatalogArtifact(
      artifact([validEntry({ id: "dup", title: "First" }), validEntry({ id: "dup", title: "Second" })])
    );

    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("First");
  });
});

describe("parseCatalogArtifact — envelope handling", () => {
  it("accepts a bare array, so a hand-written local file needs no ceremony", () => {
    const items = parseCatalogArtifact([validEntry()]);

    expect(items).toHaveLength(1);
  });

  it("accepts an envelope with no formatVersion", () => {
    const items = parseCatalogArtifact({ entries: [validEntry()] });

    expect(items).toHaveLength(1);
  });

  it("refuses an unknown formatVersion rather than guessing its dialect", () => {
    const items = parseCatalogArtifact({ formatVersion: 99, entries: [validEntry()] });

    expect(items).toEqual([]);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "entries"],
    ["a number", 7],
    ["an empty object", {}],
    ["entries as an object", { entries: { id: "x" } }]
  ])("returns an empty list for %s", (_label, input) => {
    expect(parseCatalogArtifact(input)).toEqual([]);
  });

  it("skips non-object entries inside a valid envelope", () => {
    const items = parseCatalogArtifact(artifact([null, "string", 42, [], validEntry()]));

    expect(items.map((entry) => entry.id)).toEqual(["example"]);
  });
});

describe("mergeDirectorySources", () => {
  it("resolves a three-way id collision in favour of local", () => {
    const merged = mergeDirectorySources({
      builtin: [item({ id: "clash", title: "Built-in" })],
      catalog: [item({ id: "clash", title: "Catalog" })],
      local: [item({ id: "clash", title: "Local" })]
    });

    expect(merged).toHaveLength(1);
    expect(merged[0]!.title).toBe("Local");
  });

  it("lets the catalog win over built-in when there is no local entry", () => {
    const merged = mergeDirectorySources({
      builtin: [item({ id: "clash", title: "Built-in" })],
      catalog: [item({ id: "clash", title: "Catalog" })],
      local: []
    });

    expect(merged[0]!.title).toBe("Catalog");
  });

  it("replaces a colliding entry wholly instead of merging it field by field", () => {
    const merged = mergeDirectorySources({
      builtin: [item({ id: "clash", title: "Built-in", description: "seed copy", category: "system" })],
      catalog: [],
      local: [item({ id: "clash", title: "Local", description: "", category: "mine" })]
    });

    expect(merged[0]).toEqual(item({ id: "clash", title: "Local", description: "", category: "mine" }));
  });

  it("keeps every unique id from all three sources", () => {
    const merged = mergeDirectorySources({
      builtin: [item({ id: "a" })],
      catalog: [item({ id: "b" })],
      local: [item({ id: "c" })]
    });

    expect(merged.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });

  it("preserves built-in order at the head, then new ids in first-seen order", () => {
    const merged = mergeDirectorySources({
      builtin: [item({ id: "seed-1" }), item({ id: "seed-2" })],
      catalog: [item({ id: "cat-1" }), item({ id: "seed-1", title: "Overridden" }), item({ id: "cat-2" })],
      local: [item({ id: "local-1" })]
    });

    expect(merged.map((entry) => entry.id)).toEqual(["seed-1", "seed-2", "cat-1", "cat-2", "local-1"]);
    expect(merged[0]!.title).toBe("Overridden");
  });

  it("returns an empty list when every source is empty", () => {
    expect(mergeDirectorySources({ builtin: [], catalog: [], local: [] })).toEqual([]);
  });
});
