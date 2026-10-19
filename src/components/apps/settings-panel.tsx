"use client";

import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal, Palette, House, Download, RefreshCw, Archive, Search, ChevronLeft, ChevronRight, UserRound, Monitor, X } from "lucide-react";
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
import { loadRecoveryBackup, saveRecoveryBackup } from "@/lib/browser-local-assets";
import { createDesktopBackup, downloadDesktopBackup, restoreDesktopBackup } from "@/lib/desktop-backup";
import { maxBackupBytes, validateBackup, type DesktopBackup } from "@/lib/desktop-backup-contract";
import { Dialog } from "@/components/dialogs/dialog";
import { VersionPanel } from "./version-panel";
import { BackupHistory } from "./backup-history";
import { runActivity } from "@/lib/desktop-activity";
import { cn } from "@/lib/utils";
import { useSystemTools } from "@/components/packages/system-tools-context";
import { PackageAppearanceSettings } from "@/components/packages/package-appearance-settings";

type SettingsSection = "home" | "general" | "appearance" | "start" | "install" | "backup" | "version";
const sectionIcons = { home: House, general: SlidersHorizontal, appearance: Palette, start: Monitor, install: Download, version: RefreshCw, backup: Archive };
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
  const tools = useSystemTools();
  const native = tools && ["windows", "macos"].includes(tools.presentation.appearance);
  const windowsStyle = tools?.presentation.appearance === "windows";
  const [section, setSection] = useState<SettingsSection>("general");
  const [settingsSearch, setSettingsSearch] = useState("");
  const [navigationHistory, setNavigationHistory] = useState<SettingsSection[]>([]);
  const initialSectionChosen = useRef(false);
  useEffect(() => {
    if (native && !initialSectionChosen.current) { initialSectionChosen.current = true; if (windowsStyle) setSection("home"); }
    if (native && !windowsStyle && section === "home") setSection("general");
  }, [native, windowsStyle, section]);
  const navigate = (next: SettingsSection) => { if (next !== section) setNavigationHistory(current => [...current, section]); setSection(next); setSettingsSearch(""); };
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState<StatusKind>("status");
  const [activeFont, setActiveFont] = useState("");
  const [activeAccent, setActiveAccent] = useState("");
  const zh = locale === "zh";
  const [backupBusy, setBackupBusy] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<DesktopBackup | null>(null);
  const backupFile = useRef<HTMLInputElement>(null);
  const [hasRecovery, setHasRecovery] = useState(false);
  useEffect(() => { void loadRecoveryBackup().then(value => setHasRecovery(Boolean(value))).catch(() => undefined); }, []);

  async function recoverPreviousDesktop() {
    setBackupBusy(true);
    try {
      const recovery = await loadRecoveryBackup();
      setPendingBackup(validateBackup(recovery));
    } catch (error) { setStatusKind("error"); setStatus(error instanceof Error ? error.message : t.settings.saveFailed); }
    finally { setBackupBusy(false); }
  }

  async function exportBackup() {
    setBackupBusy(true);
    try { await runActivity(zh ? "导出桌面备份" : "Export desktop backup", async () => downloadDesktopBackup(await createDesktopBackup())); }
    catch (error) { setStatusKind("error"); setStatus(error instanceof Error ? error.message : t.settings.saveFailed); }
    finally { setBackupBusy(false); }
  }

  async function readBackup(file?: File) {
    if (!file) return;
    setBackupBusy(true);
    try {
      if (file.size > maxBackupBytes) throw new Error(zh ? "备份不能超过 48 MB。" : "Backup must be at most 48 MB.");
      setPendingBackup(validateBackup(JSON.parse(await file.text())));
    } catch (error) { setStatusKind("error"); setStatus(error instanceof Error ? error.message : t.settings.saveFailed); }
    finally { setBackupBusy(false); if (backupFile.current) backupFile.current.value = ""; }
  }

  async function restoreBackup() {
    if (!pendingBackup || backupBusy) return;
    setBackupBusy(true);
    try {
      const previous = await createDesktopBackup();
      await saveRecoveryBackup(previous);
      setHasRecovery(true);
      downloadDesktopBackup(previous, "vibedesktop-before-restore");
      await runActivity(zh ? "恢复桌面备份" : "Restore desktop backup", () => restoreDesktopBackup(pendingBackup, previous));
      window.location.reload();
    } catch (error) { setStatusKind("error"); setStatus(error instanceof Error ? error.message : t.settings.saveFailed); setPendingBackup(null); }
    finally { setBackupBusy(false); }
  }

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
    ...(native && windowsStyle ? [{ id: "home" as const, label: zh ? "主页" : "Home" }] : []),
    { id: "general", label: t.settings.nav.general },
    { id: "appearance", label: t.settings.nav.appearance },
    { id: "start", label: t.settings.nav.startPage },
    { id: "install", label: t.settings.nav.install },
    { id: "version", label: zh ? "版本管理" : "Version management" },
    { id: "backup", label: zh ? "备份与恢复" : "Backup & restore" }
  ];

  return (
    <div className="system-settings" data-system-tool="settings" data-section={section} data-native-layout={native ? tools.presentation.appearance : "classic"}>
      <nav className="system-settings-nav" aria-label={t.settings.eyebrow}>
        {native ? <>
          <div className="settings-account"><span className="settings-account-avatar"><UserRound size={windowsStyle ? 28 : 24} aria-hidden="true" /></span><div><strong>{tools.userName}</strong><small>{zh ? "本地个人桌面" : "Local personal desktop"}</small></div></div>
          <label className="settings-navigation-search"><Search size={15} aria-hidden="true" /><input aria-label={zh ? "搜索设置" : "Find a setting"} placeholder={zh ? "搜索设置" : "Find a setting"} value={settingsSearch} onChange={event => setSettingsSearch(event.target.value)} />{settingsSearch ? <button aria-label={zh ? "清除搜索" : "Clear search"} onClick={() => setSettingsSearch("")}><X size={13} /></button> : null}</label>
        </> : null}
        <strong>{zh ? "桌面偏好" : "Preferences"}</strong>
        {sections.filter(item => !settingsSearch || item.label.toLocaleLowerCase().includes(settingsSearch.toLocaleLowerCase())).map((item) => {
          const Icon = sectionIcons[item.id];
          return (
          <button
            key={item.id}
            className={section === item.id ? "selected" : ""}
            data-settings-section={item.id}
            aria-current={section === item.id ? "page" : undefined}
            onClick={() => navigate(item.id)}
          >
            <span className="settings-category-icon"><Icon size={16} strokeWidth={1.7} aria-hidden="true" /></span>
            <span>{item.label}</span>
          </button>
        ); })}
        {settingsSearch && !sections.some(item => item.label.toLocaleLowerCase().includes(settingsSearch.toLocaleLowerCase())) ? <p className="settings-search-empty">{zh ? "没有找到设置" : "No settings found"}</p> : null}
      </nav>

      <main className="system-settings-content">
        <header className="system-content-heading">
          {native ? <button className="settings-back" aria-label={zh ? "返回上一页" : "Back"} disabled={!navigationHistory.length} onClick={() => { const next = navigationHistory.at(-1); if (next) { setSection(next); setNavigationHistory(current => current.slice(0, -1)); } }}><ChevronLeft size={19} aria-hidden="true" /></button> : null}
          <h2>{sections.find((item) => item.id === section)?.label}</h2>
        </header>

        {section === "home" && tools ? <div className="settings-home">
          <section className="settings-device"><span className="settings-device-preview" aria-hidden="true"><i /></span><div><h3>Vibe Desktop</h3><p>{zh ? "你的个人桌面" : "Your personal desktop"}</p></div></section>
          <div className="settings-home-grid">
            <section className="settings-group settings-home-personalization"><Palette size={24} aria-hidden="true" /><h3>{zh ? "个性化设置" : "Personalize your desktop"}</h3><p>{zh ? "让桌面呈现你喜欢的样子" : "Make your desktop feel like yours"}</p><div className="settings-home-previews" aria-hidden="true"><i /><i /></div><button onClick={() => navigate("appearance")}>{zh ? "调整外观" : "Personalize"}<ChevronRight size={15} /></button></section>
            <section className="settings-group settings-home-links"><h3>{zh ? "常用设置" : "Recommended settings"}</h3>{(["general", "start", "backup", "version"] as SettingsSection[]).map(id => { const Icon = sectionIcons[id]; return <button key={id} onClick={() => navigate(id)}><Icon size={20} /><span>{sections.find(s => s.id === id)?.label}</span><ChevronRight size={16} /></button>; })}</section>
          </div>
          <button className="settings-home-systems" onClick={tools.managePackages}><Monitor size={24} /><span><strong>{zh ? "桌面系统" : "Desktop systems"}</strong><small>{zh ? "切换系统，或选用别人分享的桌面" : "Switch systems or choose a shared desktop"}</small></span><ChevronRight size={18} /></button>
        </div> : section === "general" ? (
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
                  <SelectValue>{payload.apps.find(app => app.id === payload.desktop.startAppId) ? displayAppTitle(payload.apps.find(app => app.id === payload.desktop.startAppId)!, t) : t.settings.desktopOnly}</SelectValue>
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
        ) : section === "version" ? (
          <VersionPanel zh={zh} />
        ) : section === "backup" ? (
          <div className="settings-groups">
            <BackupHistory zh={zh} onPreview={value => setPendingBackup(validateBackup(value))} />
            <section className="settings-group">
              <div>
                <h3>{zh ? "完整桌面备份" : "Complete desktop backup"}</h3>
                <p>{zh ? "保存桌面应用、壁纸、上传的图标、桌面包、特效偏好和窗口布局。可在另一浏览器或另一台 Vibe Desktop 上恢复。" : "Save desktop shortcuts, wallpaper, uploaded icons, desktop packages, effect preferences and window layout. Restore in another browser or Vibe Desktop installation."}</p>
                <p>{zh ? "本地 WebApp 的源码、服务登记、数据库及网站登录状态独立管理，不包含在桌面备份中。" : "Local WebApp source, service registrations, databases and website sign-in sessions are managed separately and are not included."}</p>
              </div>
              <div className="settings-choice-row">
                <button className="settings-action-button" disabled={backupBusy} onClick={() => void exportBackup()}>{zh ? "导出备份" : "Export backup"}</button>
                <button className="settings-action-button" disabled={backupBusy} onClick={() => backupFile.current?.click()}>{zh ? "选择备份文件" : "Choose backup file"}</button>
                {hasRecovery ? <button className="settings-action-button" disabled={backupBusy} onClick={() => void recoverPreviousDesktop()}>{zh ? "恢复上次操作前的桌面" : "Recover previous desktop"}</button> : null}
                <input ref={backupFile} type="file" accept="application/json,.json" hidden onChange={event => void readBackup(event.target.files?.[0])} />
              </div>
              {backupBusy ? <p role="status">{zh ? "正在处理备份…" : "Processing backup…"}</p> : null}
            </section>
          </div>
        ) : section === "appearance" && tools ? <PackageAppearanceSettings zh={zh} /> : section === "appearance" ? (
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

      {pendingBackup ? (
        <Dialog title={zh ? "恢复桌面备份" : "Restore desktop backup"} t={t} onClose={() => { if (!backupBusy) setPendingBackup(null); }}>
          <p>{zh ? `将恢复 ${pendingBackup.snapshot.apps.length} 个桌面应用和 ${pendingBackup.assets.length} 个图片文件，并替换当前桌面。` : `Restore ${pendingBackup.snapshot.apps.length} desktop apps and ${pendingBackup.assets.length} images, replacing the current desktop.`}</p>
          <p>{zh ? "确认后先保存本地恢复副本并下载当前桌面的备份。恢复成功后页面会重新加载；未保存的窗口内容请先保存。" : "A local recovery copy is saved and a backup of the current desktop downloads first. The page reloads after restoration; save any unfinished work in your windows first."}</p>
          {pendingBackup.packages?.length ? <p role="alert">{zh ? `此备份包含 ${pendingBackup.packages.length} 个桌面包及其 JavaScript，恢复后将以当前桌面权限运行。请只恢复可信备份。` : `This backup includes ${pendingBackup.packages.length} desktop packages with JavaScript. Restore only a trusted backup; its code runs with your desktop permissions.`}</p> : null}
          <button className="primary-action" disabled={backupBusy} onClick={() => void restoreBackup()}>{zh ? "确认恢复" : "Confirm restore"}</button>
          <button disabled={backupBusy} onClick={() => setPendingBackup(null)}>{t.window.cancel}</button>
        </Dialog>
      ) : null}
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
