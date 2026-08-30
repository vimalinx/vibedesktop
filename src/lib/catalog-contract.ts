import type { AppDirectoryItem } from "@/lib/contracts";
import { parseHttpUrl } from "@/lib/url-parse";

/**
 * The catalog is a read-only data plane: a list of links the desktop can offer
 * in its app store. It is deliberately incapable of describing anything the
 * machine could execute.
 *
 * The security boundary here is *construction*, not validation. `parseCatalog`
 * builds each entry field by field from a fixed set of keys and returns a fresh
 * object, so a field nobody anticipated — `command`, `preload`, whatever comes
 * next — is structurally absent from the output rather than filtered out of it.
 * Checking for known-bad keys would have to be updated every time the threat
 * model grows; a whitelist projection does not.
 *
 * Every parse failure is local: a malformed entry is dropped and its siblings
 * survive. One bad submission must never blank out the catalog.
 */

/** Catalog format the desktop understands. Bump only for breaking changes. */
export const catalogFormatVersion = 1;

/** Category assigned to an entry that does not declare one. */
export const defaultCatalogCategory = "community";

export interface CatalogArtifact {
  formatVersion: number;
  generatedAt: string;
  entries: unknown[];
}

export interface DirectorySources {
  /** Compiled into the app; always available, even with no network and no files. */
  builtin: AppDirectoryItem[];
  /** Fetched from a catalog URL, or restored from its last-good cache. */
  catalog: AppDirectoryItem[];
  /** The user's own file on their own machine. Highest precedence. */
  local: AppDirectoryItem[];
}

/**
 * Projects untrusted input into `AppDirectoryItem`s.
 *
 * Accepts either a full artifact envelope or a bare array, because a
 * hand-written local collection should not need ceremony. Never throws:
 * unusable input yields `[]`.
 */
export function parseCatalogArtifact(input: unknown): AppDirectoryItem[] {
  const entries = extractEntries(input);
  if (!entries) return [];

  const items: AppDirectoryItem[] = [];
  const seen = new Set<string>();

  for (const raw of entries) {
    const item = parseCatalogEntry(raw);
    // A duplicate id within one artifact is a generator bug; keep the first so
    // the result is deterministic regardless of how the file was assembled.
    if (item && !seen.has(item.id)) {
      seen.add(item.id);
      items.push(item);
    }
  }

  return items;
}

/**
 * Merges the three directory sources, keyed by id.
 *
 * Precedence is local > catalog > built-in, and a later source replaces an
 * earlier entry *wholly* rather than merging field by field — a half-overridden
 * entry would be one nobody authored or reviewed.
 *
 * Order: built-in entries keep their positions (users expect the seed at the
 * top of the store), then new ids in first-seen order.
 */
export function mergeDirectorySources(sources: DirectorySources): AppDirectoryItem[] {
  const merged = new Map<string, AppDirectoryItem>();

  for (const item of sources.builtin) merged.set(item.id, item);
  for (const item of sources.catalog) merged.set(item.id, item);
  for (const item of sources.local) merged.set(item.id, item);

  return [...merged.values()];
}

function extractEntries(input: unknown): unknown[] | null {
  if (Array.isArray(input)) return input;

  if (isRecord(input) && Array.isArray(input.entries)) {
    // An unknown formatVersion means the producer speaks a dialect we cannot
    // interpret; treating it as empty degrades to the built-in seed, which is
    // always safe. A missing version is tolerated for hand-written files.
    const version = input.formatVersion;
    if (version !== undefined && version !== catalogFormatVersion) return null;

    return input.entries;
  }

  return null;
}

function parseCatalogEntry(raw: unknown): AppDirectoryItem | null {
  if (!isRecord(raw)) return null;

  const id = nonEmptyString(raw.id);
  const title = nonEmptyString(raw.title);
  const url = catalogUrl(raw.url);
  const catalogKind = raw.catalogKind === "github_app" ? "github_app" : "website";
  const repositoryUrl = catalogKind === "github_app" ? githubRepositoryUrl(raw.repositoryUrl ?? raw.url) : null;

  if (!id || !title || !url || (catalogKind === "github_app" && !repositoryUrl)) return null;

  return {
    id,
    title,
    url,
    description: nonEmptyString(raw.description) ?? "",
    iconUrl: inlineIcon(raw.iconUrl ?? raw.icon) ?? "",
    // Never read from input. A catalog entry that could ask to be framed into
    // the desktop would turn every review into a framing-policy judgement, so
    // catalog entries always open in a new tab. `desktop_window` stays
    // available for the built-in seed and for apps the user adds by hand.
    openingMode: "external_tab",
    category: nonEmptyString(raw.category) ?? defaultCatalogCategory,
    catalogKind,
    ...(repositoryUrl ? { repositoryUrl } : {}),
    ...(nonNegativeInteger(raw.stars) !== null ? { stars: nonNegativeInteger(raw.stars)! } : {}),
    ...(nonEmptyString(raw.language) ? { language: nonEmptyString(raw.language)! } : {}),
    ...(nonEmptyString(raw.license) ? { license: nonEmptyString(raw.license)! } : {}),
    ...(nonEmptyString(raw.verifiedAt) ? { verifiedAt: nonEmptyString(raw.verifiedAt)! } : {})
  };
}

/**
 * A catalog URL must be a plain, credential-free http(s) URL. `parseHttpUrl`
 * already rejects other schemes (`javascript:`, `file:`, `data:`) and embedded
 * credentials, and does so synchronously with no DNS lookup — parsing must stay
 * a pure function.
 */
function catalogUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;

  try {
    return parseHttpUrl(value).toString();
  } catch {
    return null;
  }
}

function githubRepositoryUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = parseHttpUrl(value);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") return null;
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length !== 2) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/**
 * Icons must be inlined as `data:` URLs.
 *
 * A remote icon URL would make every desktop that opens the app store issue a
 * request to a host chosen by whoever submitted the entry — handing them the IP
 * and User-Agent of every user. Inlining at review time also makes entries
 * immune to icon rot and to an icon being swapped after it was approved.
 *
 * An entry with no usable icon renders as initials, which the store already
 * does for a failed `<img>`.
 */
function inlineIcon(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^data:image\/[a-z0-9.+-]+;/i.test(value.trim()) ? value.trim() : null;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
