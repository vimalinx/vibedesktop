"use client";

import { useState } from "react";
import { ImagePlus, Monitor, RotateCcw } from "lucide-react";
import type { DesktopPayload, WallpaperFit } from "@/lib/contracts";
import { desktopData } from "@/lib/desktop-data";
import { localizedWallpaperName, markWallpaperChosen } from "@/lib/desktop-helpers";
import { wallpaperFitStyle } from "@/lib/desktop-style";
import type { I18nMessages } from "@/lib/i18n";
import { wallpaperFileError } from "@/lib/wallpaper";
import { Dialog } from "./dialog";

export function WallpaperDialog({
  payload,
  t,
  onClose,
  onSaved,
  onLocalWallpaper,
  localWallpaper
}: {
  payload: DesktopPayload;
  t: I18nMessages;
  onClose: () => void;
  onSaved: (payload: DesktopPayload) => void;
  onLocalWallpaper: (file: File) => Promise<void>;
  localWallpaper?: string;
}) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const customActive = payload.desktop.wallpaperKind === "custom_local" && Boolean(localWallpaper);
  const activeBuiltin = payload.wallpapers.find((wallpaper) => wallpaper.id === payload.desktop.wallpaperBuiltinId) ?? payload.wallpapers[0];
  const previewBackground = customActive && localWallpaper ? `url(${localWallpaper})` : activeBuiltin.cssValue;

  async function chooseWallpaper(wallpaperId: string) {
    setBusy(true);
    setStatus("");
    try {
      const next = await desktopData().updateDesktop({
        wallpaperKind: "builtin",
        wallpaperBuiltinId: wallpaperId
      });
      markWallpaperChosen();
      onSaved(next);
      setStatus(t.dialogs.wallpaperSaved);
    } catch {
      setStatus(t.dialogs.wallpaperSaveFailed);
    } finally {
      setBusy(false);
    }
  }

  async function uploadWallpaper(file: File) {
    const fileError = wallpaperFileError(file);
    if (fileError) {
      setStatus(fileError === "too_large" ? t.dialogs.wallpaperTooLarge : t.dialogs.wallpaperInvalid);
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      await onLocalWallpaper(file);
      const next = await desktopData().updateDesktop({ wallpaperKind: "custom_local", wallpaperFit: "cover" });
      markWallpaperChosen();
      onSaved(next);
      setStatus(t.dialogs.wallpaperSaved);
    } catch {
      setStatus(t.dialogs.wallpaperSaveFailed);
    } finally {
      setBusy(false);
    }
  }

  async function selectCustomWallpaper() {
    if (!localWallpaper) return;
    setBusy(true);
    setStatus("");
    try {
      const next = await desktopData().updateDesktop({ wallpaperKind: "custom_local" });
      markWallpaperChosen();
      onSaved(next);
      setStatus(t.dialogs.wallpaperSaved);
    } catch {
      setStatus(t.dialogs.wallpaperSaveFailed);
    } finally {
      setBusy(false);
    }
  }

  async function chooseFit(wallpaperFit: WallpaperFit) {
    setBusy(true);
    setStatus("");
    try {
      const next = await desktopData().updateDesktop({ wallpaperFit });
      onSaved(next);
      setStatus(t.dialogs.wallpaperSaved);
    } catch {
      setStatus(t.dialogs.wallpaperSaveFailed);
    } finally {
      setBusy(false);
    }
  }

  async function restoreDefault() {
    setBusy(true);
    setStatus("");
    try {
      const next = await desktopData().updateDesktop({
        wallpaperKind: "builtin",
        wallpaperBuiltinId: "noir-dawn",
        wallpaperFit: "cover"
      });
      markWallpaperChosen();
      onSaved(next);
      setStatus(t.dialogs.wallpaperSaved);
    } catch {
      setStatus(t.dialogs.wallpaperSaveFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={t.dialogs.wallpaperTitle}
      t={t}
      onClose={onClose}
      className="personalization-dialog"
      initialFocusSelector=".wallpaper-grid button.selected"
    >
      <div className="personalization-panel">
        <section className="wallpaper-desktop-preview" aria-label={t.dialogs.currentWallpaper} style={{ backgroundImage: previewBackground, ...(customActive ? wallpaperFitStyle(payload.desktop.wallpaperFit) : {}) }}>
          <div className="wallpaper-preview-icons" aria-hidden="true"><i /><i /><i /></div>
          <div className="wallpaper-preview-dock" aria-hidden="true"><i /><i /><i /><i /></div>
          <span><Monitor size={14} aria-hidden="true" /> {t.dialogs.currentWallpaper}</span>
        </section>

        <section className="personalization-section">
          <div className="personalization-section-heading">
            <div><span>{t.dialogs.builtinWallpapers}</span><strong>{customActive ? t.dialogs.customWallpaper : localizedWallpaperName(activeBuiltin, t)}</strong></div>
            <button className="personalization-reset" disabled={busy} onClick={() => void restoreDefault()}>
              <RotateCcw size={14} aria-hidden="true" /> {t.dialogs.restoreDefaultWallpaper}
            </button>
          </div>
          <div className="wallpaper-grid">
            {localWallpaper ? (
              <button
                className={customActive ? "selected" : ""}
                style={{ backgroundImage: `url(${localWallpaper})` }}
                aria-pressed={customActive}
                disabled={busy}
                onClick={() => void selectCustomWallpaper()}
              >
                <span>{t.dialogs.customWallpaper}</span>
              </button>
            ) : null}
            {payload.wallpapers.map((wallpaper) => (
              <button
                key={wallpaper.id}
                className={!customActive && payload.desktop.wallpaperBuiltinId === wallpaper.id ? "selected" : ""}
                style={{ backgroundImage: wallpaper.cssValue }}
                aria-pressed={!customActive && payload.desktop.wallpaperBuiltinId === wallpaper.id}
                disabled={busy}
                onClick={() => void chooseWallpaper(wallpaper.id)}
              >
                <span>{localizedWallpaperName(wallpaper, t)}</span>
              </button>
            ))}
          </div>
        </section>

        <section className={`personalization-controls ${customActive ? "" : "is-single"}`.trim()}>
          <label className="personalization-upload">
            <ImagePlus size={18} aria-hidden="true" />
            <span><strong>{t.dialogs.chooseLocalImage}</strong><small>{t.dialogs.wallpaperFileHint}</small></span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadWallpaper(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
          {customActive ? <div className="wallpaper-fit-control" role="group" aria-label={t.dialogs.wallpaperFit}>
            <span>{t.dialogs.wallpaperFit}</span>
            <div>
              {(["cover", "contain", "stretch", "center"] as const).map((fit) => (
                <button
                  key={fit}
                  aria-pressed={customActive && payload.desktop.wallpaperFit === fit}
                  disabled={busy}
                  onClick={() => void chooseFit(fit)}
                >
                  {t.dialogs.wallpaperFits[fit]}
                </button>
              ))}
            </div>
          </div> : null}
        </section>
      </div>
      <output className="form-status" aria-live="polite">{status || t.dialogs.wallpaperLocalOnly}</output>
    </Dialog>
  );
}
