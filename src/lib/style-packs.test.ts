import { describe, expect, it } from "vitest";
import { desktopThemes } from "@/lib/theme-data";
import { packDataAttributes, resolveStylePack, stylePacks } from "@/lib/style-packs";

describe("style packs", () => {
  it("absorbs every shipped theme so no stored themeId resets", () => {
    for (const theme of desktopThemes) {
      const pack = resolveStylePack(theme.id);
      expect(pack.themeId).toBe(theme.id);
      expect(pack.backgroundCss).toBe(theme.backgroundCss);
    }
  });

  it("reproduces exactly the accent pair the shell used to apply inline", () => {
    for (const theme of desktopThemes) {
      const pack = resolveStylePack(theme.id);
      expect(pack.tokens["--theme-accent"]).toBe(theme.swatches[2] ?? "#c8ff3d");
      expect(pack.tokens["--theme-accent-2"]).toBe(theme.swatches[3] ?? "#e8dfcc");
    }
  });

  it("falls back to the first pack for an unknown id instead of throwing", () => {
    expect(resolveStylePack("nonexistent").id).toBe(stylePacks[0].id);
  });

  it("only sets semantic/token names — no pack smuggles component CSS", () => {
    for (const pack of stylePacks) {
      for (const name of Object.keys(pack.tokens)) {
        expect(name.startsWith("--")).toBe(true);
      }
    }
  });

  it("stamps the enumerated switches as data attributes", () => {
    const attrs = packDataAttributes(stylePacks[0], "glass");
    expect(attrs["data-icon-shape"]).toBe("squircle");
    expect(attrs["data-window-chrome"]).toBe("glass");
    expect(attrs["data-density"]).toBe("regular");
    expect(attrs["data-motion"]).toBe("full");
    expect(attrs["data-shell"]).toBe("glass");
  });
});
