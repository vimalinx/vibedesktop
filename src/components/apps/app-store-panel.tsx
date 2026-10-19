"use client";

import { activity, runActivity } from "@/lib/desktop-activity";
import { useWindowVisible } from "@/components/window/window-visibility";

/* eslint-disable @next/next/no-img-element -- Directory icons are reviewed seed or inlined catalog data. */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, Bot, Boxes, Check, Code2, Compass, Copy, Cpu, ExternalLink, Globe2, House, Landmark, LayoutGrid, Palette, Play, Plus, RefreshCw, Rocket, ScanLine, Search, Shapes, Sparkles, Star, Trash2, X } from "lucide-react";
import { catalogBrowseCategory, catalogDeveloper, catalogSearchText, normalizeFollowedDeveloperIds, type CatalogBrowseCategory } from "@/lib/app-store-catalog";
import { copyTextToClipboard } from "@/lib/clipboard";
import type { AppDirectoryItem, CatalogAgentInstallInstruction, CatalogWorkspaceInstallStatus } from "@/lib/contracts";
import { desktopData } from "@/lib/desktop-data";
import {
  directoryCategoryLabel,
  hostnameForUrl,
  initialsForTitle,
  localizedDirectoryItem,
  readLocalJson,
  writeLocalJson
} from "@/lib/desktop-helpers";
import type { I18nMessages } from "@/lib/i18n";

type CatalogTypeFilter = "all" | "website" | "github_app";
type CatalogView = "discover" | "following";
type CatalogCategoryFilter = "all" | CatalogBrowseCategory;

const followedDevelopersStorageKey = "vd:catalog:followed-developers:v1";

export function AppStorePanel({
  t,
  onAddDirectoryApp,
  onOpenTrial,
  onOpenLocalApps,
  onRefreshLocalApps,
  installedUrls
}: {
  t: I18nMessages;
  onAddDirectoryApp: (id: string) => Promise<void>;
  onOpenTrial: (input: { id: string; url: string; title: string; iconUrl: string }) => void;
  onOpenLocalApps: () => void;
  onRefreshLocalApps: () => Promise<void>;
  installedUrls: string[];
}) {
  const panelVisible = useWindowVisible();
  const [directory, setDirectory] = useState<AppDirectoryItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<CatalogView>("discover");
  const [typeFilter, setTypeFilter] = useState<CatalogTypeFilter>("all");
  const [category, setCategory] = useState<CatalogCategoryFilter>("all");
  const [followedDeveloperIds, setFollowedDeveloperIds] = useState<string[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [installStatuses, setInstallStatuses] = useState<Record<string, CatalogWorkspaceInstallStatus>>({});
  const [installChoiceItem, setInstallChoiceItem] = useState<AppDirectoryItem | null>(null);
  const [agentInstruction, setAgentInstruction] = useState<CatalogAgentInstallInstruction | null>(null);
  const [agentCopyState, setAgentCopyState] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  const refreshedInstallIds = useRef(new Set<string>());
  const copyAgentButtonRef = useRef<HTMLButtonElement>(null);
  const agentTriggerRef = useRef<HTMLElement | null>(null);
  const installChoiceTriggerRef = useRef<HTMLElement | null>(null);
  const officialInstallButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFollowedDeveloperIds(normalizeFollowedDeveloperIds(readLocalJson<unknown>(followedDevelopersStorageKey, [])));
  }, []);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  useEffect(() => {
    let cancelled = false;
    desktopData()
      .listCatalog()
      .then((items) => {
        if (!cancelled) setDirectory(items);
      })
      .catch(() => {
        if (!cancelled) setDirectory([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let pending = false;
    const load = async () => {
      if (pending || !panelVisible || document.hidden) return;
      pending = true;
      try {
        const statuses = await desktopData().catalogInstalls.list();
        if (cancelled) return;
        const next = Object.fromEntries(statuses.map((status) => [status.itemId, status]));
        setInstallStatuses(next);
        const newlyInstalled = statuses.filter((status) => status.state === "installed" && !refreshedInstallIds.current.has(status.itemId));
        if (newlyInstalled.length > 0) {
          newlyInstalled.forEach((status) => refreshedInstallIds.current.add(status.itemId));
          await onRefreshLocalApps();
        }
      } catch { /* The catalog endpoint can fail temporarily; keep its last known records. */ }
      finally { pending = false; }
    };
    void load();
    const timer = window.setInterval(() => void load(), 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [onRefreshLocalApps, panelVisible]);

  useEffect(() => {
    if (!installChoiceItem) return;
    officialInstallButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeInstallDialog();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [installChoiceItem]);

  useEffect(() => {
    if (!agentInstruction) return;
    copyAgentButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAgentDialog();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [agentInstruction]);

  const directoryItems = useMemo(() => directory ?? [], [directory]);
  const installedUrlSet = useMemo(() => new Set(installedUrls), [installedUrls]);
  const followedDeveloperIdSet = useMemo(() => new Set(followedDeveloperIds), [followedDeveloperIds]);
  const followingItems = useMemo(() => directoryItems.filter((item) => {
    const developer = catalogDeveloper(item);
    return developer ? followedDeveloperIdSet.has(developer.id) : false;
  }), [directoryItems, followedDeveloperIdSet]);
  const viewItems = view === "following" ? followingItems : directoryItems;
  const typeItems = useMemo(() => viewItems.filter((item) => {
    const kind = item.catalogKind ?? "website";
    return typeFilter === "all" || kind === typeFilter;
  }), [typeFilter, viewItems]);
  const categories = useMemo(() => {
    const counts = new Map<CatalogBrowseCategory, number>();
    for (const item of typeItems) {
      const group = catalogBrowseCategory(item);
      counts.set(group, (counts.get(group) ?? 0) + 1);
    }
    return [
      { id: "all" as const, label: t.appStore.browseCategories.all, count: typeItems.length },
      ...(["technology", "creative", "daily", "finance", "other"] as const)
        .filter((id) => counts.has(id))
        .map((id) => ({ id, label: t.appStore.browseCategories[id], count: counts.get(id)! }))
    ];
  }, [typeItems, t]);
  const filteredDirectory = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return typeItems
      .filter((item) => category === "all" || catalogBrowseCategory(item) === category)
      .filter((item) => {
        if (!normalized) return true;
        const localized = localizedDirectoryItem(item, t);
        return catalogSearchText(item, localized.title, localized.description).includes(normalized);
      })
      .sort((a, b) => {
        const aFollowed = followedDeveloperIdSet.has(catalogDeveloper(a)?.id ?? "");
        const bFollowed = followedDeveloperIdSet.has(catalogDeveloper(b)?.id ?? "");
        if (aFollowed !== bFollowed) return aFollowed ? -1 : 1;
        if ((a.catalogKind ?? "website") !== (b.catalogKind ?? "website")) {
          return (a.catalogKind ?? "website") === "github_app" ? 1 : -1;
        }
        return b.stars !== undefined || a.stars !== undefined ? (b.stars ?? 0) - (a.stars ?? 0) : 0;
      });
  }, [category, followedDeveloperIdSet, query, t, typeItems]);

  function toggleDeveloper(item: AppDirectoryItem) {
    const developer = catalogDeveloper(item);
    if (!developer) return;
    const isFollowing = followedDeveloperIdSet.has(developer.id);
    const next = isFollowing
      ? followedDeveloperIds.filter((id) => id !== developer.id)
      : [...followedDeveloperIds, developer.id];
    setFollowedDeveloperIds(next);
    writeLocalJson(followedDevelopersStorageKey, next);
    setFeedback(isFollowing ? t.appStore.unfollowedDeveloper(developer.label) : t.appStore.followedDeveloper(developer.label));
  }

  async function add(item: AppDirectoryItem) {
    setAddingId(item.id);
    setFeedback("");
    try {
      await onAddDirectoryApp(item.id);
      setFeedback(t.appStore.added(localizedDirectoryItem(item, t).title));
    } catch {
      setFeedback(t.appStore.addFailed);
    } finally {
      setAddingId(null);
    }
  }

  async function install(item: AppDirectoryItem) {
    setAddingId(item.id);
    setFeedback("");
    try {
      const status = await desktopData().catalogInstalls.install(item.id);
      activity(item.title, ["installed"].includes(status.state) ? "success" : ["failed", "needs_agent"].includes(status.state) ? "error" : "running", status.message, `catalog:${item.id}`);
      setInstallStatuses((current) => ({ ...current, [item.id]: status }));
      setFeedback(t.appStore.installStarted(status.workspacePath));
    } catch (error) {
      activity(item.title, "error", error instanceof Error ? error.message : t.appStore.addFailed, `catalog:${item.id}`);
      setFeedback(t.appStore.addFailed);
    } finally {
      setAddingId(null);
    }
  }

  async function uninstall(item: AppDirectoryItem) {
    if (!window.confirm(t.appStore.uninstallConfirm(localizedDirectoryItem(item, t).title))) return;
    setAddingId(item.id);
    setFeedback("");
    try {
      const status = await runActivity(item.title + " · uninstall", () => desktopData().catalogInstalls.uninstall(item.id));
      setInstallStatuses((current) => ({ ...current, [item.id]: status }));
      setFeedback(t.appStore.uninstallDone(status.dataPath ?? status.workspacePath));
      refreshedInstallIds.current.delete(item.id);
      await onRefreshLocalApps();
    } catch {
      setFeedback(t.appStore.installFailed);
    } finally {
      setAddingId(null);
    }
  }

  function openInstallDialog(item: AppDirectoryItem) {
    installChoiceTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setInstallChoiceItem(item);
  }

  function closeInstallDialog({ restoreFocus = true }: { restoreFocus?: boolean } = {}) {
    setInstallChoiceItem(null);
    if (restoreFocus) window.requestAnimationFrame(() => installChoiceTriggerRef.current?.focus());
  }

  async function chooseOfficialInstall() {
    if (!installChoiceItem) return;
    const item = installChoiceItem;
    closeInstallDialog({ restoreFocus: false });
    await install(item);
  }

  async function chooseAgentInstall() {
    if (!installChoiceItem) return;
    const item = installChoiceItem;
    const restoreTarget = installChoiceTriggerRef.current;
    closeInstallDialog({ restoreFocus: false });
    await prepareAgentInstruction(item, restoreTarget);
  }

  async function prepareAgentInstruction(item: AppDirectoryItem, restoreTarget?: HTMLElement | null) {
    agentTriggerRef.current = restoreTarget ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setFeedback("");
    setAgentCopyState("idle");
    try {
      setAgentInstruction(await desktopData().catalogInstalls.agentInstruction(item.id));
    } catch {
      setFeedback(t.appStore.agentInstructionFailed);
    }
  }

  function closeAgentDialog() {
    setAgentInstruction(null);
    window.requestAnimationFrame(() => agentTriggerRef.current?.focus());
  }

  async function copyAgentInstruction() {
    if (!agentInstruction) return;
    setAgentCopyState("copying");
    try {
      await copyTextToClipboard(agentInstruction.instruction);
      setAgentCopyState("copied");
    } catch {
      setAgentCopyState("failed");
    }
  }

  const typeOptions: Array<{ id: CatalogTypeFilter; label: string; count: number }> = [
    { id: "all", label: t.appStore.types.all, count: viewItems.length },
    { id: "website", label: t.appStore.types.websites, count: viewItems.filter((item) => (item.catalogKind ?? "website") === "website").length },
    { id: "github_app", label: t.appStore.types.githubApps, count: viewItems.filter((item) => item.catalogKind === "github_app").length }
  ];
  const selfHostedCount = directoryItems.filter((item) => item.selfHosted).length;
  const trialCount = directoryItems.filter((item) => item.trialUrl).length;

  return (
    <div className="builtin-panel system-panel store-panel catalog-store-panel">
      <aside className="catalog-sidebar" aria-label={t.appStore.sidebarLabel}>
        <div className="catalog-sidebar-brand">
          <span><Sparkles size={17} aria-hidden="true" /></span>
          <div><strong>{t.appStore.title}</strong><small>{t.appStore.localOnly}</small></div>
        </div>
        <nav className="catalog-view-nav" aria-label={t.appStore.viewsLabel}>
          <button
            className={view === "discover" ? "selected" : ""}
            aria-pressed={view === "discover"}
            onClick={() => { setView("discover"); setCategory("all"); }}
          >
            <Compass size={16} aria-hidden="true" /> {t.appStore.discover}<span>{directoryItems.length}</span>
          </button>
          <button
            className={view === "following" ? "selected" : ""}
            aria-pressed={view === "following"}
            onClick={() => { setView("following"); setCategory("all"); }}
          >
            <Bell size={16} aria-hidden="true" /> {t.appStore.followingFeed}<span>{followingItems.length}</span>
          </button>
        </nav>
        <strong className="catalog-sidebar-label">{t.appStore.categoryIndex}</strong>
        <nav className="catalog-category-index" aria-labelledby="catalog-category-title">
          <span id="catalog-category-title" className="sr-only">{t.appStore.categoryIndex}</span>
          {categories.map((option) => (
            <button
              key={option.id}
              className={category === option.id ? "selected" : ""}
              aria-pressed={category === option.id}
              onClick={() => setCategory(option.id)}
            >
              <BrowseCategoryIcon category={option.id} />
              <span>{option.label}</span><b>{option.count}</b>
            </button>
          ))}
        </nav>
        <button className="catalog-local-library" onClick={onOpenLocalApps}>
          <ScanLine size={16} aria-hidden="true" />
          <span><strong>{t.appStore.manageLocal}</strong><small>{t.appStore.manageLocalHint}</small></span>
        </button>
      </aside>

      <section className="catalog-workspace">
      <header className="system-panel-header store-header">
        <div className="catalog-heading">
          <span className="catalog-eyebrow"><Sparkles size={13} aria-hidden="true" /> {t.appStore.eyebrow}</span>
          <h2>{t.appStore.title}</h2>
          <p>{t.appStore.description}</p>
        </div>
        <label className="system-search">
          <span className="sr-only">{t.appStore.searchLabel}</span>
          <Search size={16} aria-hidden="true" />
          <input
            ref={searchInputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.appStore.searchPlaceholder}
          />
          <kbd>⌘K</kbd>
        </label>
      </header>

      <section className="catalog-overview" aria-label={t.appStore.title}>
        <article><Globe2 size={18} aria-hidden="true" /><span>{t.appStore.statsApps}</span><strong>{directoryItems.length}</strong></article>
        <article><Boxes size={18} aria-hidden="true" /><span>{t.appStore.statsWebUis}</span><strong>{selfHostedCount}</strong></article>
        <article><Play size={18} aria-hidden="true" /><span>{t.appStore.statsTrials}</span><strong>{trialCount}</strong></article>
      </section>

      <nav className="catalog-type-filter" aria-label={t.appStore.title}>
        {typeOptions.map((option) => (
          <button
            key={option.id}
            className={typeFilter === option.id ? "selected" : ""}
            aria-pressed={typeFilter === option.id}
            onClick={() => {
              setTypeFilter(option.id);
              setCategory("all");
            }}
          >
            {option.label}<span>{option.count}</span>
          </button>
        ))}
      </nav>

      {view === "discover" && followingItems.length > 0 ? (
        <section className="catalog-follow-feed">
          <Bell size={17} aria-hidden="true" />
          <div><strong>{t.appStore.followingUpdateTitle}</strong><span>{t.appStore.followingUpdateBody(followingItems.length)}</span></div>
          <button onClick={() => { setView("following"); setCategory("all"); }}>{t.appStore.viewFollowing}</button>
        </section>
      ) : null}

      <output className="catalog-feedback" role="status" aria-live="polite">{feedback}</output>

      <div className="store-directory-grid" aria-busy={directory === null}>
        {directory === null ? Array.from({ length: 6 }, (_, index) => (
          <div className="store-app-card store-app-skeleton" aria-hidden="true" key={index}>
            <span className="store-app-icon" />
            <span className="store-skeleton-lines"><i /><i /><i /></span>
          </div>
        )) : filteredDirectory.map((item) => (
          <DirectoryAppCard
            key={item.id}
            item={item}
            localizedItem={localizedDirectoryItem(item, t)}
            t={t}
            busy={addingId === item.id}
            installed={installedUrlSet.has(item.url)}
            installStatus={installStatuses[item.id]}
            followed={followedDeveloperIdSet.has(catalogDeveloper(item)?.id ?? "")}
            onAdd={() => void add(item)}
            onInstall={() => openInstallDialog(item)}
            onUninstall={() => void uninstall(item)}
            onToggleDeveloper={() => toggleDeveloper(item)}
            onOpenTrial={() => item.trialUrl && onOpenTrial({ id: item.id, url: item.trialUrl, title: localizedDirectoryItem(item, t).title, iconUrl: item.iconUrl })}
          />
        ))}
      </div>

      {directory !== null && filteredDirectory.length === 0 ? (
        <section className="store-empty">
          <h3>{view === "following" && followedDeveloperIds.length === 0 ? t.appStore.followingEmptyTitle : t.appStore.emptyTitle}</h3>
          <p>{view === "following" && followedDeveloperIds.length === 0 ? t.appStore.followingEmptyBody : t.appStore.emptyBody}</p>
        </section>
      ) : null}

      {installChoiceItem ? createPortal((
        <div className="catalog-agent-layer" onMouseDown={() => closeInstallDialog()}>
          <section
            className="catalog-install-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="catalog-install-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <span className="catalog-agent-mark"><Plus size={20} aria-hidden="true" /></span>
              <div>
                <span>{t.appStore.installDialogEyebrow}</span>
                <h3 id="catalog-install-title">{t.appStore.installDialogTitle(localizedDirectoryItem(installChoiceItem, t).title)}</h3>
              </div>
              <button className="catalog-agent-close" aria-label={t.appStore.closeInstallOptions} onClick={() => closeInstallDialog()}>
                <X size={17} aria-hidden="true" />
              </button>
            </header>
            <p>{t.appStore.installDialogBody}</p>
            <div className="catalog-install-options">
              <button ref={officialInstallButtonRef} className="is-recommended" onClick={() => void chooseOfficialInstall()}>
                <span className="catalog-install-option-icon"><Boxes size={18} aria-hidden="true" /></span>
                <span><strong>{t.appStore.officialInstall}</strong><small>{t.appStore.officialInstallHint}</small></span>
                <em>{t.appStore.officialRecommended}</em>
              </button>
              <button onClick={() => void chooseAgentInstall()}>
                <span className="catalog-install-option-icon"><Bot size={18} aria-hidden="true" /></span>
                <span><strong>{t.appStore.agentInstall}</strong><small>{t.appStore.agentInstallHint}</small></span>
              </button>
            </div>
          </section>
        </div>
      ), document.body) : null}

      {agentInstruction ? createPortal((
        <div className="catalog-agent-layer" onMouseDown={closeAgentDialog}>
          <section
            className="catalog-agent-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="catalog-agent-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <span className="catalog-agent-mark"><Bot size={20} aria-hidden="true" /></span>
              <div>
                <span>{t.appStore.agentDialogEyebrow}</span>
                <h3 id="catalog-agent-title">{t.appStore.agentDialogTitle(agentInstruction.title)}</h3>
              </div>
              <button className="catalog-agent-close" aria-label={t.appStore.closeAgentInstruction} onClick={closeAgentDialog}>
                <X size={17} aria-hidden="true" />
              </button>
            </header>
            <p>{t.appStore.agentDialogBody}</p>
            <dl className="catalog-agent-facts">
              <div><dt>{t.appStore.repository}</dt><dd>{agentInstruction.repositoryUrl}</dd></div>
              <div><dt>{t.appStore.agentWorkspace}</dt><dd>{agentInstruction.workspacePath}</dd></div>
            </dl>
            <pre className="catalog-agent-command" tabIndex={0}><code>{agentInstruction.instruction}</code></pre>
            <footer>
              <span role="status" aria-live="polite">
                {agentCopyState === "copied" ? t.appStore.copiedForAgent : agentCopyState === "failed" ? t.appStore.agentCopyFailed : ""}
              </span>
              <button className="catalog-agent-cancel" onClick={closeAgentDialog}>{t.window.cancel}</button>
              <button ref={copyAgentButtonRef} className="catalog-agent-copy" disabled={agentCopyState === "copying"} onClick={() => void copyAgentInstruction()}>
                {agentCopyState === "copied" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                {agentCopyState === "copied" ? t.appStore.copiedForAgent : t.appStore.copyForAgent}
              </button>
            </footer>
          </section>
        </div>
      ), document.body) : null}
      </section>
    </div>
  );
}

function DirectoryAppCard({
  item,
  localizedItem,
  t,
  busy,
  installed,
  installStatus,
  followed,
  onAdd,
  onInstall,
  onUninstall,
  onToggleDeveloper,
  onOpenTrial
}: {
  item: AppDirectoryItem;
  localizedItem: Pick<AppDirectoryItem, "title" | "description">;
  t: I18nMessages;
  busy: boolean;
  installed: boolean;
  installStatus?: CatalogWorkspaceInstallStatus;
  followed: boolean;
  onAdd: () => void;
  onInstall: () => void;
  onUninstall: () => void;
  onToggleDeveloper: () => void;
  onOpenTrial: () => void;
}) {
  const github = item.catalogKind === "github_app";
  const developer = catalogDeveloper(item);
  return (
    <article className={`store-app-card ${github ? "is-github" : ""} ${item.selfHosted ? "is-self-hosted" : ""}`}>
      <DirectoryIcon item={item} title={localizedItem.title} />
      <div className="store-app-copy">
        <div className="store-app-title-row">
          <h3>{localizedItem.title}</h3>
          <span className="store-category-chip">{directoryCategoryLabel(item.category, t)}</span>
        </div>
        {developer ? (
          <div className="store-developer-row">
            <a href={item.repositoryUrl} target="_blank" rel="noreferrer">
              <Code2 size={12} aria-hidden="true" /> @{developer.label}<ExternalLink size={10} aria-hidden="true" />
            </a>
            <button aria-pressed={followed} onClick={onToggleDeveloper}>
              {followed ? <Check size={12} aria-hidden="true" /> : <Bell size={12} aria-hidden="true" />}
              {followed ? t.appStore.following : t.appStore.followDeveloper}
            </button>
          </div>
        ) : null}
        <p>{localizedItem.description}</p>
        <div className="store-repo-meta">
          <span className={`store-kind-chip ${item.selfHosted ? "is-local" : ""}`}>
            {item.selfHosted ? <Boxes size={12} aria-hidden="true" /> : <Globe2 size={12} aria-hidden="true" />}
            {item.selfHosted ? t.appStore.selfHosted : t.appStore.websiteShortcut}
          </span>
          {item.defaultPort ? <span>{t.appStore.defaultPort(item.defaultPort)}</span> : null}
          {github ? (
            <>
            {item.stars !== undefined ? (
              <span><Star size={11} aria-hidden="true" /> {t.appStore.starsSnapshot(formatStars(item.stars), item.verifiedAt ?? "—")}</span>
            ) : null}
            {item.language ? <span>{item.language}</span> : null}
            {item.license && item.license !== "NOASSERTION" ? <span>{item.license}</span> : null}
            </>
          ) : <span>{hostnameForUrl(item.url)}</span>}
        </div>
        {github && installStatus && installStatus.state !== "not_installed" ? (
          <div
            className={`store-workspace-status state-${installStatus.state}`}
            title={installStatus.message}
            role={installStatus.state === "needs_agent" || installStatus.state === "failed" ? "alert" : "status"}
          >
            <span>{installStatus.state === "needs_agent" ? t.appStore.agentNeeded : installStatus.state === "failed" ? t.appStore.installFailed : installActionLabel(installStatus, t)}</span>
            {installStatus.state === "installed" || installStatus.state === "update_available" ? (
              <span>{installStatus.healthy === undefined ? t.appStore.healthUnknown : installStatus.running && installStatus.healthy ? t.appStore.serviceHealthy : t.appStore.serviceStopped}</span>
            ) : null}
            <code>{installStatus.workspacePath}</code>
          </div>
        ) : null}
      </div>
      <div className="store-app-actions">
        {item.trialUrl ? (
          <span className="store-trial-actions">
            <button className="store-trial-action" onClick={onOpenTrial}>
              <Play size={15} aria-hidden="true" /> {t.appStore.tryOnline}
            </button>
            <a className="store-quick-action" href={item.trialUrl} target="_blank" rel="noreferrer" title={t.appStore.quickOpenHint}>
              <Rocket size={15} aria-hidden="true" /> {t.appStore.quickOpen}<ExternalLink size={11} aria-hidden="true" />
            </a>
          </span>
        ) : null}
        {github && installStatus && ["installed", "update_available", "needs_agent"].includes(installStatus.state) ? (
          <button className="store-quick-action" disabled={busy} onClick={onUninstall} title={t.appStore.uninstallWorkspace}>
            <Trash2 size={15} aria-hidden="true" /> {t.appStore.uninstallWorkspace}
          </button>
        ) : null}
        <button
          className="store-add-action"
          disabled={busy || (github ? isInstallActive(installStatus?.state) || installStatus?.state === "installed" : installed)}
          onClick={github ? onInstall : onAdd}
          title={github ? installStatus?.message : undefined}
        >
          {installStatus?.state === "update_available" ? <RefreshCw size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
          {github
            ? installActionLabel(installStatus, t)
            : busy ? "…" : installed ? t.appStore.addedState : t.appStore.add}
        </button>
      </div>
    </article>
  );
}

function isInstallActive(state?: CatalogWorkspaceInstallStatus["state"]): boolean {
  return state === "queued" || state === "cloning" || state === "installing" || state === "registering" || state === "starting";
}

function installActionLabel(status: CatalogWorkspaceInstallStatus | undefined, t: I18nMessages): string {
  if (!status || status.state === "not_installed") return t.appStore.installWorkspace;
  if (isInstallActive(status.state)) return t.appStore.installingWorkspace;
  if (status.state === "update_available") return t.appStore.updateWorkspace;
  if (status.state === "installed") return t.appStore.installedWorkspace;
  return t.appStore.installWorkspace;
}

function DirectoryIcon({ item, title }: { item: AppDirectoryItem; title: string }) {
  const [failed, setFailed] = useState(false);
  if (!failed && item.iconUrl) {
    return <img className="store-app-icon" src={item.iconUrl} alt="" draggable={false} onError={() => setFailed(true)} />;
  }
  return <span className="store-app-icon store-app-fallback">{initialsForTitle(title)}</span>;
}

function formatStars(value: number): string {
  if (value >= 100_000) return `${(value / 1000).toFixed(0)}k`;
  if (value >= 10_000) return `${(value / 1000).toFixed(1)}k`;
  return value.toLocaleString();
}

function BrowseCategoryIcon({ category }: { category: CatalogCategoryFilter }) {
  const Icon = category === "all"
    ? LayoutGrid
    : category === "technology"
      ? Cpu
      : category === "creative"
        ? Palette
        : category === "daily"
          ? House
          : category === "finance"
            ? Landmark
            : Shapes;
  return <Icon size={15} aria-hidden="true" />;
}
