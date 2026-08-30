"use client";

import { useState } from "react";
import type { DesktopPayload } from "@/lib/contracts";
import { desktopData } from "@/lib/desktop-data";
import {
  isCurrentOrigin,
  localWebUiCandidates,
  normalizeUrlForComparison,
  parseManualWebUiEntries,
  probeStatusLabel,
  type LocalWebUiProbeStatus
} from "@/lib/desktop-helpers";
import type { I18nMessages } from "@/lib/i18n";

export function WebUiImportPanel({
  t,
  payload,
  onPayloadUpdated
}: {
  t: I18nMessages;
  payload: DesktopPayload;
  onPayloadUpdated: (payload: DesktopPayload) => void;
}) {
  const source = desktopData();
  const localProbe = source.localProbe;
  const [probeStatuses, setProbeStatuses] = useState<Record<string, LocalWebUiProbeStatus>>(() =>
    Object.fromEntries(localWebUiCandidates.map((candidate) => [candidate.id, "idle"]))
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [manualUrls, setManualUrls] = useState("");
  const [status, setStatus] = useState("");

  const existingUrls = new Set(
    payload.apps
      .map((app) => app.url)
      .filter((url): url is string => Boolean(url))
      .map(normalizeUrlForComparison)
  );
  const visibleCandidates = localWebUiCandidates.filter((candidate) => !isCurrentOrigin(candidate.url));

  async function scanLocalWebUis() {
    setStatus(t.webUi.statusChecking);
    setProbeStatuses(Object.fromEntries(visibleCandidates.map((candidate) => [candidate.id, "checking"])));

    const results = await Promise.all(
      visibleCandidates.map(async (candidate) => ({
        candidate,
        status: await localProbe.probe(candidate.url)
      }))
    );
    const nextStatuses = Object.fromEntries(results.map((result) => [result.candidate.id, result.status]));
    const foundIds = results
      .filter(
        (result) =>
          result.status === "found" && !existingUrls.has(normalizeUrlForComparison(result.candidate.url))
      )
      .map((result) => result.candidate.id);

    setProbeStatuses(nextStatuses);
    setSelectedIds(new Set(foundIds));
    setStatus(foundIds.length > 0 ? t.webUi.statusFound(foundIds.length) : t.webUi.statusNoResponse);
  }

  async function addSelected() {
    const selectedCandidates = visibleCandidates.filter((candidate) => selectedIds.has(candidate.id));
    if (selectedCandidates.length === 0) {
      setStatus(t.webUi.statusSelectOne);
      return;
    }

    setStatus(t.webUi.statusAdding);
    let nextPayload = payload;
    let added = 0;

    for (const candidate of selectedCandidates) {
      if (existingUrls.has(normalizeUrlForComparison(candidate.url))) continue;
      try {
        nextPayload = await source.createUrlApp({
          title: candidate.title,
          url: candidate.url,
          description: candidate.description,
          openingMode: candidate.openingMode,
          iconKind: "fallback",
          iconUrl: null
        });
        added += 1;
      } catch {
        // Keep adding the rest; the status below reports partial success.
      }
    }

    onPayloadUpdated(nextPayload);
    setStatus(added > 0 ? t.webUi.statusAdded(added) : t.webUi.statusNothingAdded);
    setSelectedIds(new Set());
  }

  async function addManualUrls() {
    const entries = parseManualWebUiEntries(manualUrls, t).filter(
      (entry) => !existingUrls.has(normalizeUrlForComparison(entry.url))
    );

    if (entries.length === 0) {
      setStatus(t.webUi.statusPasteFirst);
      return;
    }

    setStatus(t.webUi.statusImporting);
    let nextPayload = payload;
    let added = 0;

    for (const entry of entries) {
      try {
        nextPayload = await source.createUrlApp({
          title: entry.title,
          url: entry.url,
          description: entry.description,
          openingMode: "desktop_window",
          iconKind: "fallback",
          iconUrl: null
        });
        added += 1;
      } catch {
        // Keep importing valid remaining URLs.
      }
    }

    onPayloadUpdated(nextPayload);
    setManualUrls("");
    setStatus(added > 0 ? t.webUi.statusImported(added) : t.webUi.statusNoValid);
  }

  function toggleCandidate(id: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <div className="builtin-panel webui-import-panel">
      <p className="eyebrow">{t.webUi.eyebrow}</p>
      <h2>{t.webUi.title}</h2>
      <p>{t.webUi.description}</p>

      <div className="webui-skill-actions">
        <button className="primary-action" onClick={() => void scanLocalWebUis()}>
          {t.webUi.scan}
        </button>
        <button onClick={() => void addSelected()}>{t.webUi.addSelected}</button>
      </div>
      {status ? <p className="form-status">{status}</p> : null}

      <div className="webui-candidate-grid">
        {visibleCandidates.map((candidate) => {
          const probeStatus = probeStatuses[candidate.id] ?? "idle";
          const alreadyAdded = existingUrls.has(normalizeUrlForComparison(candidate.url));

          return (
            <article key={candidate.id} className={probeStatus === "found" ? "is-found" : ""}>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={selectedIds.has(candidate.id)}
                  disabled={alreadyAdded}
                  onChange={(event) => toggleCandidate(candidate.id, event.target.checked)}
                />
                <span>
                  <strong>{candidate.title}</strong>
                  <small>{candidate.url}</small>
                </span>
              </label>
              <p>{t.webUi.candidates[candidate.id] ?? candidate.description}</p>
              <span className={`probe-pill probe-${probeStatus}`}>
                {alreadyAdded ? t.webUi.added : probeStatusLabel(probeStatus, t)}
              </span>
            </article>
          );
        })}
      </div>

      <section className="manual-webui-import">
        <div>
          <span className="settings-kicker">{t.webUi.manualKicker}</span>
          <h3>{t.webUi.manualTitle}</h3>
          <p>{t.webUi.manualBody}</p>
        </div>
        <textarea
          value={manualUrls}
          onChange={(event) => setManualUrls(event.target.value)}
          placeholder={t.webUi.manualPlaceholder}
        />
        <button onClick={() => void addManualUrls()}>{t.webUi.manualButton}</button>
      </section>
    </div>
  );
}
