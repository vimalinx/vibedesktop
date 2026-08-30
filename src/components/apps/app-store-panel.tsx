"use client";

/* eslint-disable @next/next/no-img-element -- Directory icons are reviewed seed or inlined catalog data. */

import { useEffect, useMemo, useState } from "react";
import type { AppDirectoryItem } from "@/lib/contracts";
import { desktopData } from "@/lib/desktop-data";
import {
  directoryCategoryLabel,
  hostnameForUrl,
  initialsForTitle,
  localizedDirectoryItem
} from "@/lib/desktop-helpers";
import type { I18nMessages } from "@/lib/i18n";

type CatalogTypeFilter = "all" | "website" | "github_app";

export function AppStorePanel({
  t,
  onAddDirectoryApp
}: {
  t: I18nMessages;
  onAddDirectoryApp: (id: string) => Promise<void>;
}) {
  const [directory, setDirectory] = useState<AppDirectoryItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<CatalogTypeFilter>("all");
  const [category, setCategory] = useState("all");
  const [addingId, setAddingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");

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

  const directoryItems = useMemo(() => directory ?? [], [directory]);
  const typeItems = useMemo(() => directoryItems.filter((item) => {
    const kind = item.catalogKind ?? "website";
    return typeFilter === "all" || kind === typeFilter;
  }), [directoryItems, typeFilter]);
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of typeItems) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    return [
      { id: "all", label: t.appStore.categories.all, count: typeItems.length },
      ...[...counts.entries()].map(([id, count]) => ({ id, label: directoryCategoryLabel(id, t), count }))
    ];
  }, [typeItems, t]);
  const filteredDirectory = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return typeItems
      .filter((item) => category === "all" || item.category === category)
      .filter((item) => {
        if (!normalized) return true;
        const localized = localizedDirectoryItem(item, t);
        return `${localized.title} ${localized.description} ${hostnameForUrl(item.url)} ${item.repositoryUrl ?? ""} ${item.language ?? ""} ${item.license ?? ""}`
          .toLocaleLowerCase()
          .includes(normalized);
      })
      .sort((a, b) => {
        if ((a.catalogKind ?? "website") !== (b.catalogKind ?? "website")) {
          return (a.catalogKind ?? "website") === "github_app" ? 1 : -1;
        }
        return b.stars !== undefined || a.stars !== undefined ? (b.stars ?? 0) - (a.stars ?? 0) : 0;
      });
  }, [category, query, t, typeItems]);

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

  const typeOptions: Array<{ id: CatalogTypeFilter; label: string; count: number }> = [
    { id: "all", label: t.appStore.types.all, count: directoryItems.length },
    { id: "website", label: t.appStore.types.websites, count: directoryItems.filter((item) => (item.catalogKind ?? "website") === "website").length },
    { id: "github_app", label: t.appStore.types.githubApps, count: directoryItems.filter((item) => item.catalogKind === "github_app").length }
  ];

  return (
    <div className="builtin-panel system-panel store-panel catalog-store-panel">
      <header className="system-panel-header store-header">
        <div>
          <h2>{t.appStore.title}</h2>
          <p>{t.appStore.description}</p>
        </div>
        <label className="system-search">
          <span className="sr-only">{t.startBoard.search}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.startBoard.searchPlaceholder}
          />
        </label>
      </header>

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

      <section className="catalog-category-index" aria-labelledby="catalog-category-title">
        <strong id="catalog-category-title">{t.appStore.categoryIndex}</strong>
        <div>
          {categories.map((option) => (
            <button
              key={option.id}
              className={category === option.id ? "selected" : ""}
              aria-pressed={category === option.id}
              onClick={() => setCategory(option.id)}
            >
              {option.label}<span>{option.count}</span>
            </button>
          ))}
        </div>
      </section>

      <output className="catalog-feedback" role="status" aria-live="polite">{feedback}</output>

      <div className="store-directory-grid">
        {filteredDirectory.map((item) => (
          <DirectoryAppCard
            key={item.id}
            item={item}
            localizedItem={localizedDirectoryItem(item, t)}
            t={t}
            busy={addingId === item.id}
            onAdd={() => void add(item)}
          />
        ))}
      </div>

      {filteredDirectory.length === 0 ? (
        <section className="store-empty">
          <h3>{t.appStore.emptyTitle}</h3>
          <p>{t.appStore.emptyBody}</p>
        </section>
      ) : null}
    </div>
  );
}

function DirectoryAppCard({
  item,
  localizedItem,
  t,
  busy,
  onAdd
}: {
  item: AppDirectoryItem;
  localizedItem: Pick<AppDirectoryItem, "title" | "description">;
  t: I18nMessages;
  busy: boolean;
  onAdd: () => void;
}) {
  const github = item.catalogKind === "github_app";
  return (
    <article className={`store-app-card ${github ? "is-github" : ""}`}>
      <DirectoryIcon item={item} title={localizedItem.title} />
      <div className="store-app-copy">
        <div className="store-app-title-row">
          <h3>{localizedItem.title}</h3>
          <span>{directoryCategoryLabel(item.category, t)}</span>
        </div>
        <p>{localizedItem.description}</p>
        {github ? (
          <div className="store-repo-meta">
            {item.stars !== undefined ? (
              <span>{t.appStore.starsSnapshot(formatStars(item.stars), item.verifiedAt ?? "—")}</span>
            ) : null}
            {item.language ? <span>{item.language}</span> : null}
            {item.license ? <span>{item.license}</span> : null}
          </div>
        ) : <span>{hostnameForUrl(item.url)}</span>}
      </div>
      <div className="store-app-actions">
        {github && item.repositoryUrl ? (
          <a href={item.repositoryUrl} target="_blank" rel="noreferrer">{t.appStore.repository}</a>
        ) : null}
        <button disabled={busy} onClick={onAdd}>{busy ? "…" : t.appStore.add}</button>
      </div>
    </article>
  );
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
