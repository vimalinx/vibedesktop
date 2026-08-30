"use client";

/* eslint-disable @next/next/no-img-element -- Preview icons may be user-provided favicon URLs. */

import { useState } from "react";
import type { DesktopApp, DesktopPayload, IconKind, OpeningMode } from "@/lib/contracts";
import { desktopData, type DesktopAppPatch } from "@/lib/desktop-data";
import { initialsForTitle, normalizeHttpUrlInput } from "@/lib/desktop-helpers";
import type { I18nMessages } from "@/lib/i18n";
import { Dialog } from "./dialog";

export function EditAppDialog({
  app,
  t,
  onClose,
  onSaved,
  onLocalIcon
}: {
  app: DesktopApp;
  t: I18nMessages;
  onClose: () => void;
  onSaved: (payload: DesktopPayload) => void;
  onLocalIcon: (file: File) => Promise<void>;
}) {
  const [title, setTitle] = useState(app.title);
  const [url, setUrl] = useState(app.url ?? "");
  const [description, setDescription] = useState(app.description ?? "");
  const [iconUrl, setIconUrl] = useState(app.iconKind === "favicon" ? app.iconUrl ?? "" : "");
  const [openingMode, setOpeningMode] = useState<OpeningMode>(app.openingMode);
  const [status, setStatus] = useState("");

  async function save(iconPatch?: { iconKind: IconKind; iconUrl: string | null }) {
    setStatus(t.dialogs.saving);
    const normalizedUrl = app.kind === "url" ? normalizeHttpUrlInput(url) : app.url;
    const patch: DesktopAppPatch = {
      title: title.trim() || app.title,
      url: normalizedUrl,
      description: description.trim() || null,
      openingMode
    };

    if (iconPatch) {
      patch.iconKind = iconPatch.iconKind;
      patch.iconUrl = iconPatch.iconUrl;
    } else if (app.iconKind !== "custom_local") {
      patch.iconKind = iconUrl.trim() ? "favicon" : "fallback";
      patch.iconUrl = iconUrl.trim() || null;
    }

    try {
      onSaved(await desktopData().updateApp(app.id, patch));
    } catch {
      setStatus(t.dialogs.changesSaveFailed);
    }
  }

  return (
    <Dialog title={t.dialogs.editAppTitle} t={t} onClose={onClose}>
      <div className="app-preview-card">
        {iconUrl ? <img src={iconUrl} alt="" /> : <span>{initialsForTitle(title)}</span>}
        <div>
          <strong>{title || app.title}</strong>
          <p>{description || app.description || t.dialogs.desktopShortcut}</p>
        </div>
      </div>
      <label>
        {t.dialogs.name}
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      {app.kind === "url" ? (
        <label>
          {t.dialogs.url}
          <input value={url} onChange={(event) => setUrl(event.target.value)} />
        </label>
      ) : null}
      <label>
        {t.dialogs.description}
        <input value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      {app.kind === "url" ? (
        <label>
          {t.dialogs.iconUrl}
          <input
            value={iconUrl}
            onChange={(event) => setIconUrl(event.target.value)}
            placeholder="https://example.com/favicon.ico"
          />
        </label>
      ) : null}
      <label>
        {t.dialogs.openMode}
        <select value={openingMode} onChange={(event) => setOpeningMode(event.target.value as OpeningMode)}>
          <option value="desktop_window">{t.dialogs.desktopWindow}</option>
          <option value="external_tab">{t.dialogs.externalTab}</option>
        </select>
      </label>
      <label>
        {t.dialogs.customIcon}
        <input
          type="file"
          accept="image/*"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            await onLocalIcon(file);
            await save({ iconKind: "custom_local", iconUrl: null });
          }}
        />
      </label>
      {status ? <p className="form-status">{status}</p> : null}
      <div className="dialog-actions">
        {app.kind === "url" ? (
          <button
            onClick={() => void save({ iconKind: iconUrl.trim() ? "favicon" : "fallback", iconUrl: iconUrl.trim() || null })}
          >
            {t.dialogs.useIconUrl}
          </button>
        ) : null}
        <button onClick={onClose}>{t.dialogs.cancel}</button>
        <button className="primary-action" onClick={() => void save()}>
          {t.dialogs.saveChanges}
        </button>
      </div>
    </Dialog>
  );
}
