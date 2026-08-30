"use client";

/* eslint-disable @next/next/no-img-element -- Preview icons may be user-selected object URLs or arbitrary favicon URLs. */

import { useEffect, useState } from "react";
import type { DesktopPayload, IconKind, OpeningMode } from "@/lib/contracts";
import { desktopData } from "@/lib/desktop-data";
import {
  findCreatedApp,
  initialsForTitle,
  normalizeHttpUrlInput,
  titleFromUrl
} from "@/lib/desktop-helpers";
import { saveLocalAsset } from "@/lib/browser-local-assets";
import type { I18nMessages } from "@/lib/i18n";
import { Dialog } from "./dialog";

export function AddAppDialog({
  t,
  onClose,
  onSaved
}: {
  t: I18nMessages;
  onClose: () => void;
  onSaved: (payload: DesktopPayload, localIcon?: { appId: string; url: string }) => void;
}) {
  const source = desktopData();
  const urlMetadata = source.urlMetadata;

  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [openingMode, setOpeningMode] = useState<OpeningMode>("desktop_window");
  const [setAsStart, setSetAsStart] = useState(false);
  const [customIconFile, setCustomIconFile] = useState<File | null>(null);
  const [customIconPreview, setCustomIconPreview] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!customIconFile) {
      setCustomIconPreview("");
      return;
    }
    const preview = URL.createObjectURL(customIconFile);
    setCustomIconPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [customIconFile]);

  async function resolve() {
    const normalizedUrl = normalizeHttpUrlInput(url);
    if (!normalizedUrl) {
      setStatus(t.dialogs.urlFirst);
      return;
    }
    setUrl(normalizedUrl);
    setStatus(t.dialogs.resolving);
    try {
      const metadata = await urlMetadata.resolve(normalizedUrl);
      setTitle(metadata.title);
      setDescription(metadata.description ?? "");
      setIconUrl(metadata.iconCandidates[0] ?? "");
      setStatus(t.dialogs.metadataLoaded);
    } catch {
      setStatus(t.dialogs.metadataFailed);
    }
  }

  async function save() {
    const normalizedUrl = normalizeHttpUrlInput(url);
    const resolvedTitle = title.trim() || titleFromUrl(normalizedUrl, t);
    if (!normalizedUrl || !resolvedTitle) {
      setStatus(t.dialogs.saveNeedsUrl);
      return;
    }

    setStatus(customIconFile ? t.dialogs.savingAppWithIcon : t.dialogs.savingApp);

    try {
      const iconKind: IconKind = customIconFile ? "custom_local" : iconUrl.trim() ? "favicon" : "fallback";
      const nextPayload = await source.createUrlApp({
        title: resolvedTitle,
        url: normalizedUrl,
        description: description.trim() || null,
        openingMode,
        iconKind,
        iconUrl: customIconFile ? null : iconUrl.trim() || null,
        setAsStart
      });

      if (customIconFile) {
        const createdApp = findCreatedApp(nextPayload.apps, { title: resolvedTitle, url: normalizedUrl });
        if (createdApp) {
          const localUrl = await saveLocalAsset(`app:${createdApp.id}:icon`, customIconFile);
          onSaved(nextPayload, { appId: createdApp.id, url: localUrl });
          return;
        }
      }
      onSaved(nextPayload);
      return;
    } catch {
      setStatus(t.dialogs.saveFailed);
    }
  }

  const previewTitle = title.trim() || titleFromUrl(url, t);
  const previewDescription = description.trim() || t.dialogs.appPreviewDescription;
  const previewIcon = customIconPreview || iconUrl.trim();

  return (
    <Dialog title={t.dialogs.addAppTitle} t={t} onClose={onClose}>
      <div className="app-preview-card">
        {previewIcon ? <img src={previewIcon} alt="" /> : <span>{initialsForTitle(previewTitle)}</span>}
        <div>
          <strong>{previewTitle}</strong>
          <p>{previewDescription}</p>
        </div>
      </div>
      <label>
        {t.dialogs.websiteUrl}
        <div className="inline-field">
          <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com" />
          <button onClick={resolve}>{t.dialogs.readSite}</button>
        </div>
      </label>
      <label>
        {t.dialogs.name}
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label>
        {t.dialogs.description}
        <input value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <label>
        {t.dialogs.iconUrl}
        <input
          value={iconUrl}
          onChange={(event) => setIconUrl(event.target.value)}
          disabled={Boolean(customIconFile)}
        />
      </label>
      <label>
        {t.dialogs.uploadLocalIcon}
        <input
          type="file"
          accept="image/*"
          onChange={(event) => setCustomIconFile(event.target.files?.[0] ?? null)}
        />
      </label>
      <label>
        {t.dialogs.openMode}
        <select value={openingMode} onChange={(event) => setOpeningMode(event.target.value as OpeningMode)}>
          <option value="desktop_window">{t.dialogs.desktopWindow}</option>
          <option value="external_tab">{t.dialogs.externalTab}</option>
        </select>
      </label>
      <label className="checkbox-field">
        <input type="checkbox" checked={setAsStart} onChange={(event) => setSetAsStart(event.target.checked)} />
        <span>{t.dialogs.setAsStart}</span>
      </label>
      {status ? <p className="form-status">{status}</p> : null}
      <div className="dialog-actions">
        <button onClick={onClose}>{t.dialogs.cancel}</button>
        <button className="primary-action" onClick={save}>
          {t.dialogs.saveApp}
        </button>
      </div>
    </Dialog>
  );
}
