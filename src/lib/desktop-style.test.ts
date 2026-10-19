import { describe, expect, it } from "vitest";
import { wallpaperFitStyle } from "@/lib/desktop-style";

describe("wallpaper fit styles", () => {
  it.each([
    ["cover", "cover"],
    ["contain", "contain"],
    ["stretch", "100% 100%"],
    ["center", "auto"]
  ] as const)("maps %s to a non-repeating desktop background", (fit, backgroundSize) => {
    expect(wallpaperFitStyle(fit)).toEqual({
      backgroundSize,
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat"
    });
  });
});
