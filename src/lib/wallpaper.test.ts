import { describe, expect, it } from "vitest";
import { maxWallpaperFileSize, wallpaperFileError } from "@/lib/wallpaper";

describe("wallpaper file validation", () => {
  it.each(["image/jpeg", "image/png", "image/webp", "image/avif"])("accepts %s within the local limit", (type) => {
    expect(wallpaperFileError({ type, size: maxWallpaperFileSize })).toBeNull();
  });

  it("rejects executable or animated formats outside the first release boundary", () => {
    expect(wallpaperFileError({ type: "image/svg+xml", size: 1024 })).toBe("invalid");
    expect(wallpaperFileError({ type: "image/gif", size: 1024 })).toBe("invalid");
  });

  it("rejects images above 20 MB", () => {
    expect(wallpaperFileError({ type: "image/png", size: maxWallpaperFileSize + 1 })).toBe("too_large");
  });
});
