import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppDirectoryItem } from "@/lib/contracts";
import { mergeDirectorySources, parseCatalogArtifact } from "@/lib/catalog-contract";
import { appDirectory } from "@/lib/seed-data";
import { isLoopbackAddress, parseHttpUrl } from "@/lib/url-safety";

/**
 * Loads the two optional directory sources — a public catalog over HTTPS and
 * the user's own local collection file — and merges them with the compiled-in
 * seed.
 *
 * Two properties matter more than freshness:
 *
 * 1. **Opt-in.** `VIBE_CATALOG_URL` is empty by default. A local-first desktop
 *    must not make an outbound request to a third party on first run without
 *    being asked.
 * 2. **Failure is a non-event.** Every error path degrades: fetch → last-good
 *    cache → built-in seed. The desktop must stay fully usable with the catalog
 *    host unreachable, so nothing here throws or surfaces an error.
 */

/** Matches `resolveUrlMetadata`'s timeout; a catalog is not worth waiting on. */
const fetchTimeoutMs = 6000;
/** An artifact is larger than an HTML head but must still be bounded. */
const maxCatalogBytes = 512_000;
const maxRedirects = 4;
const catalogUserAgent = "VibeDesktop/0.1 catalog client";
const defaultMaxAgeHours = 24;

interface CatalogConfig {
  catalogUrl: string | null;
  cacheFile: string;
  localFile: string;
  maxAgeMs: number;
}

interface CacheEnvelope {
  fetchedAt: string;
  sourceUrl: string;
  entries: AppDirectoryItem[];
}

let configOverride: Partial<CatalogConfig> | null = null;
let fetchOverride: typeof fetch | null = null;
/** Coalesces concurrent loads so opening the app store twice fetches once. */
let inFlight: Promise<AppDirectoryItem[]> | null = null;

/** Test harness hook: pin configuration instead of reading process.env. */
export function __setCatalogConfigForTests(config: Partial<CatalogConfig> | null): void {
  configOverride = config;
  inFlight = null;
}

/** Test harness hook: substitute the network. */
export function __setCatalogFetchForTests(impl: typeof fetch | null): void {
  fetchOverride = impl;
  inFlight = null;
}

function resolveConfig(): CatalogConfig {
  const fromEnv: CatalogConfig = {
    catalogUrl: process.env.VIBE_CATALOG_URL?.trim() || null,
    cacheFile: process.env.VIBE_CATALOG_CACHE_FILE?.trim() || ".data/catalog-cache.json",
    localFile: process.env.VIBE_LOCAL_CATALOG_FILE?.trim() || ".data/local-catalog.json",
    maxAgeMs: maxAgeMsFromEnv()
  };

  return { ...fromEnv, ...(configOverride ?? {}) };
}

function maxAgeMsFromEnv(): number {
  const raw = Number.parseFloat(process.env.VIBE_CATALOG_MAX_AGE_HOURS ?? "");
  const hours = Number.isFinite(raw) && raw >= 0 ? raw : defaultMaxAgeHours;
  return hours * 60 * 60 * 1000;
}

/**
 * The built-in seed, the public catalog, and the local collection, merged with
 * local winning. This is the single source both `/api/app-directory` routes
 * read, so an entry that can be listed can also be added.
 */
export async function loadMergedDirectory(): Promise<AppDirectoryItem[]> {
  const [catalog, local] = await Promise.all([loadPublicCatalog(), loadLocalCatalog()]);

  return mergeDirectorySources({ builtin: appDirectory, catalog, local });
}

/**
 * The public catalog, or the best available substitute.
 *
 * A cache younger than the max age is served without touching the network. A
 * stale or missing cache triggers a fetch; if that fails, the stale cache is
 * still served — staleness must never degrade into breakage.
 */
export async function loadPublicCatalog(): Promise<AppDirectoryItem[]> {
  const config = resolveConfig();
  if (!config.catalogUrl) return [];

  if (inFlight) return inFlight;

  inFlight = loadPublicCatalogUncoalesced(config).finally(() => {
    inFlight = null;
  });

  return inFlight;
}

async function loadPublicCatalogUncoalesced(config: CatalogConfig): Promise<AppDirectoryItem[]> {
  const cached = await readCache(config);

  if (cached && cached.sourceUrl === config.catalogUrl && !isStale(cached, config)) {
    return cached.entries;
  }

  const fetched = await fetchCatalog(config.catalogUrl!);

  if (fetched) {
    // Only a successful, parsed fetch replaces the cache. A failed fetch must
    // never overwrite good entries with nothing.
    await writeCache(config, { fetchedAt: new Date().toISOString(), sourceUrl: config.catalogUrl!, entries: fetched });
    return fetched;
  }

  return cached?.entries ?? [];
}

/**
 * The user's own collection: the same entry format in a file they own. This is
 * what makes a personal collection unprivileged — it is the same code path
 * everyone else uses, on their own machine. A missing file is the normal case.
 */
export async function loadLocalCatalog(): Promise<AppDirectoryItem[]> {
  const config = resolveConfig();

  try {
    const raw = await readFile(path.resolve(process.cwd(), config.localFile), "utf8");
    return parseCatalogArtifact(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function fetchCatalog(catalogUrl: string): Promise<AppDirectoryItem[] | null> {
  try {
    const url = parseHttpUrl(catalogUrl);

    // The catalog URL is operator-configured, not user input, so this is not an
    // SSRF boundary — but plaintext HTTP to a remote host would let anyone on
    // the path rewrite the catalog. Loopback stays allowed for local testing.
    if (url.protocol !== "https:" && !isLoopbackAddress(url.hostname)) {
      return null;
    }

    const response = await fetchFollowingRedirects(url);
    if (!response || !response.ok) {
      await response?.body?.cancel().catch(() => undefined);
      return null;
    }

    // An HTML body is a captive portal or an error page, not a catalog. Beyond
    // that the JSON parse below is the real check, since static hosts serve
    // .json as octet-stream often enough that requiring a JSON content type
    // would reject legitimate artifacts.
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType.includes("text/html")) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }

    const body = await readLimitedText(response);
    if (body === null) return null;

    return parseCatalogArtifact(JSON.parse(body));
  } catch {
    return null;
  }
}

async function fetchFollowingRedirects(url: URL): Promise<Response | null> {
  const impl = fetchOverride ?? fetch;
  let currentUrl = url;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await impl(currentUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(fetchTimeoutMs),
      headers: { "User-Agent": catalogUserAgent, Accept: "application/json" }
    });

    if (!isRedirectStatus(response.status)) return response;

    const location = response.headers.get("location");
    await response.body?.cancel().catch(() => undefined);
    if (!location) return response;

    const next = new URL(location, currentUrl);
    // A redirect off HTTPS (or to a non-http scheme) is not something to follow.
    if (next.protocol !== "https:" && !isLoopbackAddress(next.hostname)) return null;

    currentUrl = next;
  }

  return null;
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

/** Reads at most `maxCatalogBytes`, returning null when the body exceeds it. */
async function readLimitedText(response: Response): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done || !value) break;

      total += value.byteLength;
      // Truncating would hand JSON.parse a syntax error and look like a
      // malformed catalog; an oversized body is its own failure.
      if (total > maxCatalogBytes) return null;

      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(merged);
}

function isStale(cached: CacheEnvelope, config: CatalogConfig): boolean {
  const fetchedAt = Date.parse(cached.fetchedAt);
  if (!Number.isFinite(fetchedAt)) return true;

  return Date.now() - fetchedAt > config.maxAgeMs;
}

async function readCache(config: CatalogConfig): Promise<CacheEnvelope | null> {
  const cacheFile = path.resolve(process.cwd(), config.cacheFile);

  try {
    await stat(cacheFile);
    const parsed: unknown = JSON.parse(await readFile(cacheFile, "utf8"));

    if (typeof parsed !== "object" || parsed === null) return null;
    const envelope = parsed as Partial<CacheEnvelope>;

    return {
      fetchedAt: typeof envelope.fetchedAt === "string" ? envelope.fetchedAt : "",
      sourceUrl: typeof envelope.sourceUrl === "string" ? envelope.sourceUrl : "",
      // Re-parse through the whitelist: a cache file on disk is no more
      // trustworthy than the network response it came from.
      entries: parseCatalogArtifact(envelope.entries)
    };
  } catch {
    return null;
  }
}

async function writeCache(config: CatalogConfig, envelope: CacheEnvelope): Promise<void> {
  const cacheFile = path.resolve(process.cwd(), config.cacheFile);

  try {
    await mkdir(path.dirname(cacheFile), { recursive: true });
    // Same atomic pattern as the store: a torn cache file would be worse than
    // no cache at all.
    const tempFile = `${cacheFile}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await writeFile(tempFile, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
    await rename(tempFile, cacheFile);
  } catch {
    // A read-only or full disk must not break listing the catalog.
  }
}
