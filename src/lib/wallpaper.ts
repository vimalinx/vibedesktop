export const maxWallpaperFileSize = 20 * 1024 * 1024;

const acceptedWallpaperTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export function wallpaperFileError(file: { size: number; type: string }): "invalid" | "too_large" | null {
  if (!acceptedWallpaperTypes.has(file.type)) return "invalid";
  if (file.size > maxWallpaperFileSize) return "too_large";
  return null;
}
