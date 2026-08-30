/**
 * Builds the public app catalog artifact from a reviewed source list.
 *
 *   catalog/source.json  →  dist/catalog.json
 *
 * The generator exists because a compliant artifact cannot reasonably be
 * written by hand: catalog icons must be inlined as `data:` URLs (see
 * `src/lib/catalog-contract.ts` for why), which means fetching and encoding
 * each one. It is also the seam a submission/review gateway plugs into — the
 * gateway's only job is to append reviewed entries to `catalog/source.json`.
 *
 * A submission therefore costs the submitter one URL: title, description, and
 * icon are resolved here from the page itself. Any field written explicitly in
 * the source list overrides what the page advertises, so a review decision
 * always wins.
 *
 * Usage: npm run catalog:build
 * Then attach dist/catalog.json to the public release (or serve it statically).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { catalogFormatVersion, defaultCatalogCategory, parseCatalogArtifact } from "../src/lib/catalog-contract";
import { resolveUrlMetadata } from "../src/lib/metadata-resolver";
import { assertPublicHttpUrl, parseHttpUrl } from "../src/lib/url-safety";

/** An icon large enough to be a hero image is not an icon. */
const maxIconBytes = 64_000;
const iconTimeoutMs = 6000;

interface SourceEntry {
  id?: string;
  url: string;
  title?: string;
  description?: string;
  category?: string;
  catalogKind?: "website" | "github_app";
  repositoryUrl?: string;
  stars?: number;
  language?: string;
  license?: string;
  verifiedAt?: string;
  /** Skip network resolution and emit exactly what is written here. */
  noResolve?: boolean;
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceFile = path.join(projectRoot, "catalog", "source.json");
const outputFile = path.join(projectRoot, "dist", "catalog.json");

const source = await readSource();
const entries: Record<string, unknown>[] = [];
const seenIds = new Set<string>();

for (const raw of source) {
  const result = await buildEntry(raw);

  if (!result) continue;

  if (seenIds.has(result.id as string)) {
    console.log(`  skip     ${result.id} — duplicate id in source.json`);
    continue;
  }

  seenIds.add(result.id as string);
  entries.push(result);
}

const artifact = {
  formatVersion: catalogFormatVersion,
  generatedAt: new Date().toISOString(),
  entries
};

// Round-trip through the runtime parser: if the desktop would reject or reshape
// an entry, the generator should say so now rather than shipping it.
const accepted = parseCatalogArtifact(artifact);
const rejected = entries.length - accepted.length;

await mkdir(path.dirname(outputFile), { recursive: true });
await writeFile(outputFile, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

const withIcons = accepted.filter((entry) => entry.iconUrl).length;
console.log("");
console.log(`dist/catalog.json  ${accepted.length} entries, ${withIcons} with inlined icons`);
if (rejected > 0) {
  console.log(`  WARNING: ${rejected} generated entr${rejected === 1 ? "y" : "ies"} would be rejected at runtime.`);
  process.exitCode = 1;
}

async function readSource(): Promise<SourceEntry[]> {
  let raw: string;

  try {
    raw = await readFile(sourceFile, "utf8");
  } catch {
    console.error(`No source list at ${path.relative(projectRoot, sourceFile)}.`);
    process.exit(1);
  }

  const parsed: unknown = JSON.parse(raw);
  const list = Array.isArray(parsed) ? parsed : (parsed as { entries?: unknown }).entries;

  if (!Array.isArray(list)) {
    console.error("source.json must be an array of entries, or an object with an `entries` array.");
    process.exit(1);
  }

  return list as SourceEntry[];
}

async function buildEntry(raw: SourceEntry): Promise<Record<string, unknown> | null> {
  if (typeof raw?.url !== "string" || raw.url.trim().length === 0) {
    console.log("  skip     (entry with no url)");
    return null;
  }

  let url: URL;
  try {
    url = parseHttpUrl(raw.url.trim());
  } catch (error) {
    console.log(`  skip     ${raw.url} — ${(error as Error).message}`);
    return null;
  }

  const id = raw.id?.trim() || idFromUrl(url);
  const category = raw.category?.trim() || defaultCatalogCategory;

  if (raw.noResolve) {
    if (!raw.title?.trim()) {
      console.log(`  skip     ${id} — noResolve requires an explicit title`);
      return null;
    }

    console.log(`  literal  ${id}`);
    return {
      id,
      title: raw.title.trim(),
      url: url.toString(),
      description: raw.description?.trim() ?? "",
      category,
      ...catalogMetadata(raw)
    };
  }

  const resolved = await resolveMetadata(url);
  const title = raw.title?.trim() || resolved?.title?.trim();

  if (!title) {
    console.log(`  skip     ${id} — no title, and none could be resolved`);
    return null;
  }

  const icon = await inlineFirstIcon(resolved?.iconCandidates ?? []);

  console.log(`  ok       ${id}  "${title}"${icon ? "  +icon" : "  (no icon)"}`);

  return {
    id,
    title,
    url: url.toString(),
    description: raw.description?.trim() || resolved?.description?.trim() || "",
    category,
    ...catalogMetadata(raw),
    ...(icon ? { icon } : {})
  };
}

function catalogMetadata(raw: SourceEntry): Record<string, unknown> {
  if (raw.catalogKind !== "github_app") return { catalogKind: "website" };
  return {
    catalogKind: "github_app",
    repositoryUrl: raw.repositoryUrl,
    stars: raw.stars,
    language: raw.language,
    license: raw.license,
    verifiedAt: raw.verifiedAt
  };
}

async function resolveMetadata(
  url: URL
): Promise<{ title: string; description: string | null; iconCandidates: string[] } | null> {
  try {
    const metadata = await resolveUrlMetadata(url.toString());
    return {
      title: metadata.title,
      description: metadata.description,
      iconCandidates: metadata.iconCandidates
    };
  } catch (error) {
    console.log(`  warn     ${url.hostname} — metadata resolution failed: ${(error as Error).message}`);
    return null;
  }
}

/** Tries each candidate in order and inlines the first usable image. */
async function inlineFirstIcon(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    const inlined = await inlineIcon(candidate);
    if (inlined) return inlined;
  }

  return null;
}

async function inlineIcon(candidate: string): Promise<string | null> {
  try {
    // Same public-URL discipline as the metadata resolver: the generator runs on
    // a maintainer's machine, and a submitted page must not be able to point it
    // at that machine's private network.
    const url = await assertPublicHttpUrl(candidate);
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(iconTimeoutMs)
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    if (!contentType.startsWith("image/")) return null;

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > maxIconBytes) return null;

    return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return null;
  }
}

/** A stable, readable id derived from the hostname: `github.com` → `github`. */
function idFromUrl(url: URL): string {
  const host = url.hostname.replace(/^www\./, "");
  const labels = host.split(".");
  const base = labels.length > 2 ? labels.slice(0, -2).join("-") : labels[0]!;

  return (base || host).replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
}
