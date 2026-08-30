"use client";

import type { I18nMessages } from "@/lib/i18n";

/** Where a visitor goes to get the real thing. */
const projectUrl = "https://github.com/vimalinx/vibedesktop";

/**
 * Shown in place of a panel whose capability the browser-only trial does not
 * have (see `desktop-data/contract.ts`).
 *
 * It states what the trial *is* rather than reporting a failure: the feature is
 * not broken and not coming back with a retry — it needs a machine to act on,
 * and a public page does not have one. Reusing `builtin-panel` / `store-empty`
 * keeps this inside the existing token vocabulary with no new CSS.
 */
export function TrialUnavailablePanel({ t, body }: { t: I18nMessages; body: string }) {
  return (
    <div className="builtin-panel">
      <p className="eyebrow">{t.trial.eyebrow}</p>
      <h2>{t.trial.title}</h2>
      <p>{body}</p>
      <p>
        <a href={projectUrl} target="_blank" rel="noopener noreferrer">
          {t.trial.getItLabel}
        </a>
      </p>
    </div>
  );
}
