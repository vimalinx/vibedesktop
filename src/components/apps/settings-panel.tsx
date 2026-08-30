"use client";

import { useEffect, useState } from "react";
import type { DesktopPayload, ShellStyle, ThemeId } from "@/lib/contracts";
import { desktopData, reasonFor } from "@/lib/desktop-data";
import {
  displayAppTitle,
  localizedDesktopTheme,
  localizedShellStyle,
  markThemeChosen,
  readLocalJson
} from "@/lib/desktop-helpers";
import type { I18nMessages, Locale } from "@/lib/i18n";
import { copyTextToClipboard } from "@/lib/clipboard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type SettingsSection = "general" | "appearance" | "start" | "install";
type StatusKind = "status" | "error";

export function SettingsPanel({
  payload,
  locale,
  t,
  startPageUrl,
  canPromptInstall,
  isStandalone,
  onInstall,
  onShowOnboarding,
  onLocaleChange,
  onPayloadUpdated
}: {
  payload: DesktopPayload;
  locale: Locale;
  t: I18nMessages;
  startPageUrl: string;
  canPromptInstall: boolean;
  isStandalone: boolean;
  onInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
  onShowOnboarding: () => void;
  onLocaleChange: (locale: Locale) => void;
  onPayloadUpdated: (payload: DesktopPayload) => void;
}) {
  const [section, setSection] = useState<SettingsSection>("general");
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState<StatusKind>("status");
  const [activeFont, setActiveFont] = useState("");
  const [activeAccent, setActiveAccent] = useState("");
  const zh = locale === "zh";

  const fonts = [
    { id: "geist", label: "Geist" },
    { id: "system", label: zh ? "系统" : "System" },
    { id: "mono", label: "Mono" }
  ];
  const accents = ["#c8ff3d", "#3b82f6", "#a855f7", "#f97316", "#ec4899", "#14b8a6"];

  useEffect(() => {
    setActiveFont(payload.desktop.fontOverride ?? readLocalJson("vd:custom-font", ""));
    setActiveAccent(payload.desktop.accentOverride ?? readLocalJson("vd:custom-accent", ""));
  }, [payload.desktop.fontOverride, payload.desktop.accentOverride]);

  async function save(updates: {
    startAppId?: string | null;
    themeId?: ThemeId;
    shellStyle?: ShellStyle;
    accentOverride?: string | null;
    fontOverride?: string | null;
  }) {
    setStatusKind("status");
    setStatus(t.settings.saving);
    try {
      const next = await desktopData().updateDesktop(updates);
      if (updates.themeId) markThemeChosen();
      onPayloadUpdated(next);
      setStatus(t.settings.saved);
    } catch (error) {
      setStatusKind("error");
      setStatus(reasonFor(error) ?? t.settings.saveFailed);
    }
    window.setTimeout(() => setStatus(""), 2200);
  }

  async function copyStartPageUrl() {
    if (!startPageUrl) return;
    try {
      await copyTextToClipboard(startPageUrl);
      setStatusKind("status");
      setStatus(t.settings.copySuccess);
    } catch {
      setStatusKind("error");
      setStatus(t.settings.saveFailed);
    }
    window.setTimeout(() => setStatus(""), 2400);
  }

  async function installApp() {
    setStatusKind("status");
    setStatus(t.settings.installOpening);
    try {
      const outcome = await onInstall();
      if (outcome === "accepted") setStatus(t.settings.installAccepted);
      else if (outcome === "dismissed") setStatus(t.settings.installDismissed);
      else setStatus(t.settings.installUnavailable);
    } catch {
      setStatusKind("error");
      setStatus(t.settings.installUnavailable);
    }
  }

  const sections: Array<{ id: SettingsSection; label: string }> = [
    { id: "general", label: t.settings.nav.general },
    { id: "appearance", label: t.settings.nav.appearance },
    { id: "start", label: t.settings.nav.startPage },
    { id: "install", label: t.settings.nav.install }
  ];

  return (
    <div className="system-settings">
      <nav className="system-settings-nav" aria-label={t.settings.eyebrow}>
        <strong>{t.settings.title}</strong>
        {sections.map((item) => (
          <button
            key={item.id}
            className={section === item.id ? "selected" : ""}
            aria-current={section === item.id ? "page" : undefined}
            onClick={() => setSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <main className="system-settings-content">
        <header className="system-content-heading">
          <h2>{sections.find((item) => item.id === section)?.label}</h2>
        </header>

        {section === "general" ? (
          <div className="settings-groups">
            <section className="settings-group">
              <div>
                <h3>{t.settings.initialAppTitle}</h3>
                <p>{t.settings.initialAppBody}</p>
              </div>
              <Select
                value={payload.desktop.startAppId ?? "__none__"}
                onValueChange={(value) => void save({ startAppId: value === "__none__" ? null : value })}
              >
                <SelectTrigger className="settings-select">
                  <SelectValue placeholder={t.settings.desktopOnly} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t.settings.desktopOnly}</SelectItem>
                  {payload.apps.map((app) => (
                    <SelectItem key={app.id} value={app.id}>{displayAppTitle(app, t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>

            <section className="settings-group settings-group-row">
              <div>
                <h3>{t.settings.languageTitle}</h3>
                <p>{t.settings.languageBody}</p>
              </div>
              <div className="settings-choice-row">
                <button className={locale === "zh" ? "selected" : ""} onClick={() => onLocaleChange("zh")}>中文</button>
                <button className={locale === "en" ? "selected" : ""} onClick={() => onLocaleChange("en")}>English</button>
              </div>
            </section>

            <section className="settings-group settings-group-row">
              <div>
                <h3>{t.settings.guideTitle}</h3>
                <p>{t.settings.guideBody}</p>
              </div>
              <button className="settings-action-button" onClick={onShowOnboarding}>
                {t.settings.guideButton}
              </button>
            </section>
          </div>
        ) : section === "appearance" ? (
          <div className="settings-groups">
            <section className="settings-group">
              <div>
                <h3>{t.settings.themesTitle}</h3>
                <p>{t.settings.themesBody}</p>
              </div>
              <div className="settings-theme-grid">
                {payload.themes.map((theme) => {
                  const localized = localizedDesktopTheme(theme, t);
                  return (
                    <button
                      key={theme.id}
                      className={cn("settings-theme", payload.desktop.themeId === theme.id && "selected")}
                      style={{ backgroundImage: theme.backgroundCss }}
                      onClick={() => void save({ themeId: theme.id as ThemeId })}
                    >
                      <strong>{localized.name}</strong>
                      <span>{theme.swatches.map((swatch) => <i key={swatch} style={{ backgroundColor: swatch }} />)}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="settings-group settings-group-row">
              <div><h3>{t.settings.shellTitle}</h3><p>{t.settings.shellBody}</p></div>
              <div className="settings-choice-row">
                {payload.shellStyles.map((style) => {
                  const localized = localizedShellStyle(style, t);
                  return (
                    <button
                      key={style.id}
                      className={payload.desktop.shellStyle === style.id ? "selected" : ""}
                      onClick={() => void save({ shellStyle: style.id as ShellStyle })}
                    >
                      {localized.name}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="settings-group settings-group-row">
              <div><h3>{zh ? "字体" : "Font"}</h3></div>
              <div className="settings-choice-row">
                {fonts.map((font) => (
                  <button
                    key={font.id}
                    className={activeFont === font.id ? "selected" : ""}
                    onClick={() => {
                      setActiveFont(font.id);
                      void save({ fontOverride: font.id });
                    }}
                  >
                    {font.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="settings-group settings-group-row">
              <div><h3>{zh ? "强调色" : "Accent"}</h3></div>
              <div className="settings-accent-row">
                {accents.map((color) => (
                  <button
                    key={color}
                    className={activeAccent === color ? "selected" : ""}
                    style={{ backgroundColor: color }}
                    aria-label={color}
                    onClick={() => {
                      setActiveAccent(color);
                      void save({ accentOverride: color });
                    }}
                  />
                ))}
              </div>
            </section>
          </div>
        ) : section === "start" ? (
          <div className="settings-groups">
            <section className="settings-group">
              <div>
                <h3>{t.settings.startPageTitle}</h3>
                <p>{t.settings.startPageBody}</p>
              </div>
              <div className="settings-url-row">
                <input
                  value={startPageUrl || t.settings.startPageLoading}
                  aria-label={t.settings.startPageInputAria}
                  readOnly
                />
                <button
                  className="settings-action-button"
                  onClick={() => void copyStartPageUrl()}
                  disabled={!startPageUrl}
                >
                  {t.settings.copy}
                </button>
              </div>
            </section>

            <section className="settings-group">
              <div>
                <h3>{t.settings.setHomeTitle}</h3>
              </div>
              <ol className="settings-step-list">
                {t.settings.setHomeSteps.map((step) => <li key={step}>{step}</li>)}
              </ol>
            </section>
          </div>
        ) : (
          <div className="settings-groups">
            <section className="settings-group settings-group-row">
              <div>
                <h3>{t.settings.installDeskTitle}</h3>
                <p>{isStandalone ? t.settings.pwaInstalled : t.settings.pwaBody}</p>
              </div>
              <button
                className="settings-action-button"
                onClick={() => void installApp()}
                disabled={isStandalone}
              >
                {canPromptInstall ? t.settings.installButton : t.settings.installStepsButton}
              </button>
            </section>

            <section className="settings-group">
              <div>
                <h3>{t.settings.pwaKicker}</h3>
                <p>{t.settings.mobileNote}</p>
              </div>
            </section>

            <section className="settings-group">
              <div>
                <h3>{t.settings.smallWebappsTitle}</h3>
                <p>{t.settings.smallWebappsBody}</p>
              </div>
            </section>
          </div>
        )}
      </main>

      {status ? (
        <div
          className={cn("system-toast", statusKind === "error" && "is-error")}
          role={statusKind === "error" ? "alert" : "status"}
          aria-live={statusKind === "error" ? "assertive" : "polite"}
        >
          {status}
        </div>
      ) : null}
    </div>
  );
}
