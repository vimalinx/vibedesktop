/**
 * Vendors the reviewed catalog's real project marks for local/offline use.
 *
 * Source URLs live in catalog/icon-sources.json so every byte has visible
 * provenance. SVG line endings are normalized; visual paths and colors stay
 * exactly as supplied upstream.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface IconSource {
  id: string;
  fileName: string;
  sourceUrl: string;
  fallbackSourceUrls?: string[];
  officialPage: string;
  note?: string;
}

const maxIconBytes = 256_000;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceFile = path.join(projectRoot, "catalog", "icon-sources.json");
const outputDirectory = path.join(projectRoot, "public", "catalog-icons");
const sources = JSON.parse(await readFile(sourceFile, "utf8")) as IconSource[];

await mkdir(outputDirectory, { recursive: true });

for (const source of sources) {
  validateSource(source);
  const response = await fetchFirstAvailable(source);

  if (!response.ok) throw new Error(`${source.id}: ${response.status} from ${source.sourceUrl}`);

  const upstreamBytes = Buffer.from(await response.arrayBuffer());
  if (upstreamBytes.length === 0 || upstreamBytes.length > maxIconBytes) {
    throw new Error(`${source.id}: invalid icon size ${upstreamBytes.length}`);
  }

  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  assertImage(source, contentType, upstreamBytes);
  const outputBytes = source.fileName.endsWith(".svg")
    ? Buffer.from(upstreamBytes.toString("utf8").replace(/\r\n?/g, "\n"), "utf8")
    : upstreamBytes;
  await writeFile(path.join(outputDirectory, source.fileName), outputBytes);
  console.log(`  saved  ${source.id.padEnd(24)} ${String(outputBytes.length).padStart(6)} bytes  ${contentType}`);
}

console.log(`\npublic/catalog-icons  ${sources.length} genuine project icons`);

async function fetchWithRetry(url: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(10_000),
        headers: { "user-agent": "VibeDesktop-CatalogIconSync/1.0" }
      });
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
  throw lastError;
}

async function fetchFirstAvailable(source: IconSource): Promise<Response> {
  let lastError: unknown;
  for (const url of [source.sourceUrl, ...(source.fallbackSourceUrls ?? [])]) {
    try {
      const response = await fetchWithRetry(url);
      if (response.ok) return response;
      lastError = new Error(`${source.id}: ${response.status} from ${url}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function validateSource(source: IconSource): void {
  if (!/^[a-z0-9-]+$/.test(source.id)) throw new Error(`Invalid icon id: ${source.id}`);
  if (!/^[a-z0-9-]+\.(?:svg|png|ico)$/.test(source.fileName)) {
    throw new Error(`${source.id}: unsupported output filename`);
  }
  for (const value of [source.sourceUrl, ...(source.fallbackSourceUrls ?? []), source.officialPage]) {
    const url = new URL(value);
    if (url.protocol !== "https:") throw new Error(`${source.id}: sources must use HTTPS`);
  }
}

function assertImage(source: IconSource, contentType: string, bytes: Buffer): void {
  const extension = path.extname(source.fileName);
  if (extension === ".svg") {
    const svg = bytes.toString("utf8");
    if (!contentType.includes("svg") || !/<svg[\s>]/i.test(svg)) throw new Error(`${source.id}: expected SVG`);
    if (/<script[\s>]|\son[a-z]+\s*=|(?:href|xlink:href)\s*=\s*["']https?:/i.test(svg)) {
      throw new Error(`${source.id}: unsafe active or remote SVG content`);
    }
    return;
  }

  if (extension === ".png") {
    const pngSignature = "89504e470d0a1a0a";
    if (!contentType.includes("png") || bytes.subarray(0, 8).toString("hex") !== pngSignature) {
      throw new Error(`${source.id}: expected PNG`);
    }
    return;
  }

  const icoSignature = bytes.subarray(0, 4).toString("hex");
  if (!contentType.includes("icon") || icoSignature !== "00000100") throw new Error(`${source.id}: expected ICO`);
}
