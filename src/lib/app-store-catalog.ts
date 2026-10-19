import type { AppDirectoryItem } from "@/lib/contracts";

export interface CatalogDeveloper {
  id: string;
  label: string;
  url: string;
}

export type CatalogBrowseCategory = "technology" | "creative" | "daily" | "finance" | "other";

const technologyCategories = new Set([
  "system",
  "global-ai",
  "china-ai",
  "local-webui",
  "ai-platforms",
  "automation",
  "monitoring",
  "developer-tools"
]);

/** The catalog keeps precise metadata tags on each card, while navigation uses
 * a deliberately small set of human-scale departments. */
export function catalogBrowseCategory(item: Pick<AppDirectoryItem, "category">): CatalogBrowseCategory {
  if (technologyCategories.has(item.category)) return "technology";
  if (item.category === "design" || item.category === "media") return "creative";
  if (item.category === "documents" || item.category === "notes") return "daily";
  if (item.category === "finance") return "finance";
  return "other";
}

/** GitHub repository ownership is the stable developer identity already
 * reviewed by the catalog. No second remote identity source is needed. */
export function catalogDeveloper(item: AppDirectoryItem): CatalogDeveloper | null {
  if (!item.repositoryUrl) return null;
  try {
    const url = new URL(item.repositoryUrl);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") return null;
    const [owner] = url.pathname.split("/").filter(Boolean);
    if (!owner) return null;
    return {
      id: owner.toLocaleLowerCase(),
      label: decodeURIComponent(owner),
      url: `https://github.com/${encodeURIComponent(decodeURIComponent(owner))}`
    };
  } catch {
    return null;
  }
}

export function catalogSearchText(item: AppDirectoryItem, title: string, description: string): string {
  const developer = catalogDeveloper(item);
  return [
    title,
    description,
    item.url,
    item.trialUrl,
    item.repositoryUrl,
    developer?.label,
    item.language,
    item.license
  ].filter(Boolean).join(" ").toLocaleLowerCase();
}

export function normalizeFollowedDeveloperIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().toLocaleLowerCase())
    .filter(Boolean))];
}
