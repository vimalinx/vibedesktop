"use client";

import { useCallback, useEffect, useState } from "react";
import { Dialog } from "@/components/dialogs/dialog";
import type { MarketInstallPreview, MarketInstallStatus } from "@/lib/contracts";
import { desktopData, reasonFor } from "@/lib/desktop-data";
import type { I18nMessages } from "@/lib/i18n";

type Phase =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "preview"; preview: MarketInstallPreview }
  | { kind: "installing"; preview: MarketInstallPreview; status: MarketInstallStatus | null }
  | { kind: "done"; preview: MarketInstallPreview; status: MarketInstallStatus }
  | { kind: "failed"; preview: MarketInstallPreview; message: string };

/**
 * The one place a market app is confirmed. A `vibedesktop://install` link, the
 * CLI, and the Local WebApps panel all land here; nothing from the repository
 * runs until the user presses Install after reading exactly what will run.
 */
export function MarketInstallDialog({
  repository,
  gitRef,
  t,
  onClose,
  onInstalled,
  onOpen
}: {
  repository: string;
  gitRef: string | null;
  t: I18nMessages;
  onClose: () => void;
  onInstalled: () => void;
  onOpen: (status: MarketInstallStatus) => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const m = t.market;

  const load = useCallback(async () => {
    setPhase({ kind: "loading" });
    try {
      setPhase({ kind: "preview", preview: await desktopData().marketInstalls.preview(repository, gitRef) });
    } catch (error) {
      setPhase({ kind: "error", message: messageOf(error) });
    }
  }, [repository, gitRef]);

  useEffect(() => {
    void load();
  }, [load]);

  const installing = phase.kind === "installing" ? phase.preview : null;
  useEffect(() => {
    if (!installing) return;
    let cancelled = false;
    let failures = 0;
    const tick = async () => {
      try {
        const status = (await desktopData().marketInstalls.list()).find((item) => item.id === installing.id) ?? null;
        failures = 0;
        if (cancelled || !status) return;
        if (status.state === "installed" && status.ref === installing.ref) {
          setPhase({ kind: "done", preview: installing, status });
          onInstalled();
        } else if (status.state === "failed") {
          setPhase({ kind: "failed", preview: installing, message: status.message });
        } else {
          setPhase((current) => (current.kind === "installing" ? { ...current, status } : current));
        }
      } catch {
        // The desktop server restarts rarely; keep waiting, it finishes the job server-side.
        failures += 1;
        if (!cancelled && failures > 40) setPhase({ kind: "failed", preview: installing, message: m.failed });
      }
    };
    const timer = window.setInterval(() => void tick(), 1500);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [installing, onInstalled, m.failed]);

  async function install(preview: MarketInstallPreview) {
    setPhase({ kind: "installing", preview, status: null });
    try {
      const status = await desktopData().marketInstalls.install({ repository: preview.repository, ref: preview.ref, digest: preview.digest });
      setPhase((current) => (current.kind === "installing" ? { ...current, status } : current));
    } catch (error) {
      setPhase({ kind: "failed", preview, message: messageOf(error) });
    }
  }

  const preview = phase.kind === "loading" || phase.kind === "error" ? null : phase.preview;
  const busy = phase.kind === "installing";

  return (
    <Dialog title={m.title} t={t} onClose={busy ? () => undefined : onClose} className="market-install-dialog">
      {phase.kind === "loading" ? (
        <p className="market-install-progress" role="status">
          <span className="market-install-spinner" aria-hidden="true" />
          {m.loading(repository)}
        </p>
      ) : null}

      {phase.kind === "error" ? (
        <>
          <p className="market-install-error" role="alert">{phase.message}</p>
          <footer className="market-install-actions">
            <button onClick={onClose}>{t.dialogs.close}</button>
            <button className="primary-action" onClick={() => void load()}>{m.retry}</button>
          </footer>
        </>
      ) : null}

      {preview ? (
        <>
          <div className="market-install-head">
            {preview.iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- an inlined data: URL from the pinned commit
              <img src={preview.iconUrl} alt="" width={56} height={56} />
            ) : (
              <span className="market-install-initial" aria-hidden="true">{preview.name.slice(0, 1).toUpperCase()}</span>
            )}
            <div>
              <h3>{preview.name}</h3>
              <a href={preview.repositoryUrl} target="_blank" rel="noreferrer">{preview.repository}</a>
              {preview.description ? <p>{preview.description}</p> : null}
            </div>
          </div>

          <p className={`market-install-trust trust-${preview.trust}`}>
            <strong>{m.trust[preview.trust]}</strong> {m.trustNote[preview.trust]}
          </p>

          <dl className="market-install-facts">
            <dt>{m.commit}</dt>
            <dd>
              <a href={`${preview.repositoryUrl}/tree/${preview.ref}`} target="_blank" rel="noreferrer"><code>{preview.ref.slice(0, 12)}</code></a>
            </dd>
            {preview.requires.length ? (
              <>
                <dt>{m.requires}</dt>
                <dd className="market-install-requires">
                  {preview.requires.map((item) => (
                    <span key={item.command} className={item.available ? "is-available" : "is-missing"}>
                      {item.available ? "✓" : "✗"} <code>{item.command}</code>{item.available ? null : ` · ${m.missing}`}
                    </span>
                  ))}
                </dd>
              </>
            ) : null}
            <dt>{m.setup}</dt>
            <dd>
              {preview.setup.length ? (
                <ol className="market-install-commands">
                  {preview.setup.map((command, index) => <li key={index}><code>{command}</code></li>)}
                </ol>
              ) : m.noSetup}
            </dd>
            <dt>{m.services}</dt>
            <dd>
              <ul className="market-install-commands">
                {preview.services.map((service, index) => (
                  <li key={service.name}>
                    <span className="market-install-service">
                      <strong>{service.name}</strong> :{service.port}{index === 0 ? ` · ${m.primary}` : ""}
                      {service.cwd !== "." ? <small> {service.cwd}/</small> : null}
                    </span>
                    <code>{service.run}</code>
                  </li>
                ))}
              </ul>
            </dd>
            <dt>{m.data}</dt>
            <dd><code>{preview.dataPath}</code></dd>
          </dl>

          {phase.kind === "installing" ? (
            <p className="market-install-progress" role="status">
              <span className="market-install-spinner" aria-hidden="true" />
              {phase.status?.message ?? m.installing}
            </p>
          ) : null}
          {phase.kind === "failed" ? <p className="market-install-error" role="alert">{m.failed}{"\n"}{phase.message}</p> : null}
          {phase.kind === "done" ? <p className="market-install-success" role="status">{m.done(preview.name)}</p> : null}

          <footer className="market-install-actions">
            {phase.kind === "done" ? (
              <>
                <button onClick={onClose}>{t.dialogs.close}</button>
                <button className="primary-action" onClick={() => onOpen(phase.status)}>{m.open}</button>
              </>
            ) : phase.kind === "preview" && preview.installed?.state === "installed" && preview.installed.ref === preview.ref ? (
              <>
                <span className="market-install-note">{m.installed}</span>
                <button onClick={onClose}>{t.dialogs.close}</button>
                <button className="primary-action" onClick={() => onOpen(preview.installed!)}>{m.open}</button>
              </>
            ) : (
              <>
                {preview.requires.some((item) => !item.available) ? <span className="market-install-note">{m.missingBlocked}</span> : null}
                <button onClick={onClose} disabled={busy}>{t.dialogs.cancel}</button>
                <button
                  className="primary-action"
                  disabled={busy || preview.requires.some((item) => !item.available)}
                  onClick={() => void install(preview)}
                >
                  {busy ? m.installing : phase.kind === "failed" ? m.retry : preview.installed ? m.update : m.install}
                </button>
              </>
            )}
          </footer>
        </>
      ) : null}
    </Dialog>
  );
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return reasonFor(error) ?? "Request failed.";
}
