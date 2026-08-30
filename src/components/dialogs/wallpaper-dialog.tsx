"use client";

import type { DesktopPayload } from "@/lib/contracts";
import { desktopData } from "@/lib/desktop-data";
import { localizedWallpaperName, markWallpaperChosen } from "@/lib/desktop-helpers";
import type { I18nMessages } from "@/lib/i18n";
import { Dialog } from "./dialog";

export function WallpaperDialog({
  payload,
  t,
  onClose,
  onSaved,
  onLocalWallpaper
}: {
  payload: DesktopPayload;
  t: I18nMessages;
  onClose: () => void;
  onSaved: (payload: DesktopPayload) => void;
  onLocalWallpaper: (file: File) => Promise<void>;
}) {
  async function chooseWallpaper(wallpaperId: string) {
    try {
      const next = await desktopData().updateDesktop({
        wallpaperKind: "builtin",
        wallpaperBuiltinId: wallpaperId
      });
      markWallpaperChosen();
      onSaved(next);
    } catch {
      // Keep the current wallpaper; the picker stays open for another try.
    }
  }

  async function uploadWallpaper(file: File) {
    await onLocalWallpaper(file);
    try {
      const next = await desktopData().updateDesktop({ wallpaperKind: "custom_local" });
      markWallpaperChosen();
      onSaved(next);
    } catch {
      // The bytes are stored locally either way; the desktop keeps its wallpaper.
    }
  }

  return (
    <Dialog title={t.dialogs.wallpaperTitle} t={t} onClose={onClose}>
      <div className="wallpaper-grid">
        {payload.wallpapers.map((wallpaper) => (
          <button
            key={wallpaper.id}
            className={payload.desktop.wallpaperBuiltinId === wallpaper.id ? "selected" : ""}
            style={{ backgroundImage: wallpaper.cssValue }}
            onClick={() => void chooseWallpaper(wallpaper.id)}
          >
            <span>{localizedWallpaperName(wallpaper, t)}</span>
          </button>
        ))}
      </div>
      <label>
        {t.dialogs.uploadWallpaper}
        <input
          type="file"
          accept="image/*"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadWallpaper(file);
          }}
        />
      </label>
      <p className="form-status">{t.dialogs.wallpaperLocalOnly}</p>
    </Dialog>
  );
}
