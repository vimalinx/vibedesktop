"use client";

import type { DesktopApp, DesktopPayload, LocalAppControlAction, LocalAppView } from "@/lib/contracts";
import {
  displayAppDescription,
  displayAppTitle,
  isAppStoreApp,
  isLocalAppsApp,
  isSettingsApp,
  isStartBoardApp,
  isWeatherApp,
  isWebUiImportApp,
  type WeatherReading
} from "@/lib/desktop-helpers";
import type { I18nMessages, Locale } from "@/lib/i18n";
import { AppStorePanel } from "@/components/apps/app-store-panel";
import { StartBoardPanel } from "@/components/apps/start-board-panel";
import { WeatherPanel } from "@/components/apps/weather-panel";
import { SettingsPanel } from "@/components/apps/settings-panel";
import { WebUiImportPanel } from "@/components/apps/webui-import-panel";
import { LocalAppsPanel } from "@/components/apps/local-apps-panel";
import { EmbeddedWebAppFrame } from "@/components/apps/embedded-frame";

export function WindowContent({
  app,
  locale,
  t,
  weatherCity,
  weather,
  weatherStatus,
  onWeatherCityChange,
  onWeatherRefresh,
  onAddDirectoryApp,
  onOpenUrlApp,
  localApps,
  onRefreshLocalApps,
  onControlLocalApp,
  payload,
  startPageUrl,
  canPromptInstall,
  isStandalone,
  onInstall,
  onShowOnboarding,
  onLocaleChange,
  onPayloadUpdated
}: {
  app: DesktopApp;
  locale: Locale;
  t: I18nMessages;
  weatherCity: string;
  weather: WeatherReading | null;
  weatherStatus: string;
  onWeatherCityChange: (city: string) => void;
  onWeatherRefresh: () => Promise<void>;
  onAddDirectoryApp: (id: string) => Promise<void>;
  onOpenUrlApp: (input: { id: string; url: string; title: string }) => void;
  /** Polled once by the desktop; the local-apps panel reads this list. */
  localApps: LocalAppView[];
  onRefreshLocalApps: () => Promise<void>;
  onControlLocalApp: (id: string, action: LocalAppControlAction) => Promise<void>;
  payload: DesktopPayload;
  startPageUrl: string;
  canPromptInstall: boolean;
  isStandalone: boolean;
  onInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
  onShowOnboarding: () => void;
  onLocaleChange: (locale: Locale) => void;
  onPayloadUpdated: (payload: DesktopPayload) => void;
}) {
  if (isAppStoreApp(app)) {
    return (
      <AppStorePanel
        t={t}
        onAddDirectoryApp={onAddDirectoryApp}
      />
    );
  }

  if (isStartBoardApp(app)) {
    return (
      <StartBoardPanel
        t={t}
        localApps={localApps}
        onRefreshLocalApps={onRefreshLocalApps}
        onControlLocalApp={onControlLocalApp}
        onOpenLocalApp={(view) => onOpenUrlApp({ id: view.id, url: view.status.url, title: view.name })}
      />
    );
  }

  if (isWeatherApp(app)) {
    return (
      <WeatherPanel
        t={t}
        city={weatherCity}
        weather={weather}
        status={weatherStatus}
        onCityChange={onWeatherCityChange}
        onRefresh={onWeatherRefresh}
      />
    );
  }

  if (isSettingsApp(app)) {
    return (
      <SettingsPanel
        payload={payload}
        locale={locale}
        t={t}
        startPageUrl={startPageUrl}
        canPromptInstall={canPromptInstall}
        isStandalone={isStandalone}
        onInstall={onInstall}
        onShowOnboarding={onShowOnboarding}
        onLocaleChange={onLocaleChange}
        onPayloadUpdated={onPayloadUpdated}
      />
    );
  }

  if (isWebUiImportApp(app)) {
    return <WebUiImportPanel t={t} payload={payload} onPayloadUpdated={onPayloadUpdated} />;
  }

  if (isLocalAppsApp(app)) {
    return (
      <LocalAppsPanel
        locale={locale}
        apps={localApps}
        onRefresh={onRefreshLocalApps}
        onOpenUrlApp={onOpenUrlApp}
      />
    );
  }

  if (app.url) {
    return <EmbeddedWebAppFrame app={app} t={t} />;
  }

  return (
    <div className="builtin-panel">
      <h2>{displayAppTitle(app, t)}</h2>
      <p>{displayAppDescription(app, t) ?? ""}</p>
    </div>
  );
}
