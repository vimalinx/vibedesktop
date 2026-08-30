import { assertPublicHttpUrl, isLoopbackAddress, parseHttpUrl, UnsafeUrlError } from "@/lib/url-safety";
import type { EmbedCheckResult, MetadataResolveResult } from "@/lib/contracts";

const maxMetadataBytes = 256_000;
const maxRedirects = 4;
const metadataUserAgent = "VibeDesktop/0.1 metadata resolver";

export async function resolveUrlMetadata(input: string): Promise<MetadataResolveResult> {
  const url = await assertPublicHttpUrl(input);
  const { response, finalUrl } = await fetchPublicUrl(url, {
    signal: AbortSignal.timeout(6000),
    headers: {
      "User-Agent": metadataUserAgent
    }
  });

  if (!response.ok) {
    return fallbackMetadata(finalUrl);
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

  if (!contentType.includes("text/html")) {
    return fallbackMetadata(finalUrl);
  }

  const html = await readLimitedText(response);
  const metadata = extractMetadataFromHtml(html, finalUrl);

  return {
    url: finalUrl.toString(),
    ...metadata
  };
}

export async function checkUrlEmbeddability(input: string, embeddingOrigin: string | null): Promise<EmbedCheckResult> {
  // Loopback (the user's own machine) is allowed here without a server-side
  // fetch: this entry point takes a client-supplied URL, so fetching it would
  // be an SSRF vector.
  //
  // Note that the load-timeout fallback does NOT cover a local server that
  // refuses framing — Chromium fires `load` on a refused frame, so the window
  // would look ready while showing a blank pane. Registered local apps are
  // therefore checked by `GET /api/local-apps/[id]/embed-check`, which resolves
  // the target from the daemon registry instead of from client input.
  const parsed = parseHttpUrl(input);

  if (isLoopbackAddress(parsed.hostname)) {
    return { url: parsed.toString(), embeddable: true, reason: "allowed", message: null };
  }

  const url = await assertPublicHttpUrl(input);

  try {
    const { response, finalUrl } = await fetchPublicUrl(url, {
      signal: AbortSignal.timeout(5000),
      headers: {
        "User-Agent": metadataUserAgent
      }
    });

    await response.body?.cancel().catch(() => undefined);

    if (!response.ok) {
      return {
        url: finalUrl.toString(),
        embeddable: false,
        reason: "unreachable",
        message: "This site did not return a page that can be checked."
      };
    }

    const policy = classifyEmbeddingPolicy(response.headers, finalUrl, embeddingOrigin);

    return {
      url: finalUrl.toString(),
      ...policy
    };
  } catch {
    return {
      url: url.toString(),
      embeddable: false,
      reason: "unreachable",
      message: "Vibe Desktop could not verify whether this site allows embedded windows."
    };
  }
}

/**
 * Framing verdict for a *registered* local app, resolved from the daemon's own
 * record rather than from client input.
 *
 * Chromium fires the iframe `load` event even when it refuses to render a
 * document because of `X-Frame-Options` or `frame-ancestors`, so the browser
 * cannot distinguish "rendered" from "refused" on a cross-origin local app. On
 * this path the server sits on the same computer as the app, so it reads the
 * headers itself. Only a verdict is returned, never the app's content.
 *
 * A local app that is not answering yet is reported embeddable: the caller's
 * start-on-demand retry window, not this check, owns that case.
 */
export async function checkLocalAppEmbeddability(
  app: { port: number; status?: { url?: string | null } | null },
  embeddingOrigin: string | null,
  fetchImpl: typeof fetch = fetch
): Promise<EmbedCheckResult> {
  const target = parseHttpUrl(app.status?.url || `http://127.0.0.1:${app.port}/`);

  if (!isLoopbackAddress(target.hostname)) {
    throw new UnsafeUrlError("This local app does not resolve to a loopback address.");
  }

  try {
    let currentUrl = target;

    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
      const response = await fetchImpl(currentUrl, { redirect: "manual", signal: AbortSignal.timeout(3000) });
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);

      if (!isRedirectStatus(response.status) || !location) {
        return {
          url: currentUrl.toString(),
          ...classifyEmbeddingPolicy(response.headers, currentUrl, embeddingOrigin)
        };
      }

      if (redirectCount === maxRedirects) {
        return {
          url: currentUrl.toString(),
          embeddable: false,
          reason: "unreachable",
          message: "This local app redirected too many times to verify its embedding policy."
        };
      }

      const nextUrl = parseHttpUrl(new URL(location, currentUrl).toString());
      if (!isLoopbackAddress(nextUrl.hostname)) {
        return {
          url: currentUrl.toString(),
          embeddable: false,
          reason: "unreachable",
          message: "This local app redirects away from this computer, so it cannot be safely checked for embedding."
        };
      }
      currentUrl = nextUrl;
    }

    return {
      url: target.toString(),
      embeddable: false,
      reason: "unreachable",
      message: "This local app could not be checked for embedding."
    };
  } catch {
    return { url: target.toString(), embeddable: true, reason: "allowed", message: null };
  }
}

export function extractMetadataFromHtml(
  html: string,
  url: URL
): Pick<MetadataResolveResult, "title" | "description" | "iconCandidates"> {
  const title =
    extractMetaContent(html, (attrs) => attrs.property === "og:title") ??
    extractMetaContent(html, (attrs) => attrs.name === "twitter:title") ??
    extractFirstMatch(html, /<title[^>]*>([^<]+)<\/title>/i) ??
    url.hostname;
  const description =
    extractMetaContent(html, (attrs) => attrs.name === "description") ??
    extractMetaContent(html, (attrs) => attrs.property === "og:description");
  const icons = dedupeUrls([...extractIconCandidates(html, url), ...defaultIconCandidates(url)]);

  return {
    title: decodeHtml(title.trim()),
    description: description ? decodeHtml(description.trim()) : null,
    iconCandidates: icons.slice(0, 8)
  };
}

export function classifyEmbeddingPolicy(
  headers: Headers,
  targetUrl: URL,
  embeddingOrigin: string | null
): Pick<EmbedCheckResult, "embeddable" | "reason" | "message"> {
  const xFrameOptions = headers.get("x-frame-options")?.toLowerCase().trim() ?? "";

  if (xFrameOptions.includes("deny")) {
    return {
      embeddable: false,
      reason: "x_frame_options",
      message: "This site blocks embedded windows with X-Frame-Options."
    };
  }

  if (xFrameOptions.includes("sameorigin") && !isSameOrigin(targetUrl, embeddingOrigin)) {
    return {
      embeddable: false,
      reason: "x_frame_options",
      message: "This site only allows pages from the same origin to embed it."
    };
  }

  const frameAncestors = extractFrameAncestors(headers.get("content-security-policy") ?? "");

  if (frameAncestors && !allowsFrameAncestor(frameAncestors, targetUrl, embeddingOrigin)) {
    return {
      embeddable: false,
      reason: "frame_ancestors",
      message: "This site restricts which products can embed it."
    };
  }

  return {
    embeddable: true,
    reason: "allowed",
    message: null
  };
}

function fallbackMetadata(url: URL): MetadataResolveResult {
  return {
    url: url.toString(),
    title: url.hostname.replace(/^www\./, ""),
    description: null,
    iconCandidates: defaultIconCandidates(url)
  };
}

async function fetchPublicUrl(url: URL, init: RequestInit): Promise<{ response: Response; finalUrl: URL }> {
  let currentUrl = url;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    await assertPublicHttpUrl(currentUrl.toString());

    const response = await fetch(currentUrl, {
      ...init,
      redirect: "manual"
    });

    if (!isRedirectStatus(response.status)) {
      return { response, finalUrl: currentUrl };
    }

    const location = response.headers.get("location");
    await response.body?.cancel().catch(() => undefined);

    if (!location) {
      return { response, finalUrl: currentUrl };
    }

    currentUrl = await assertPublicHttpUrl(new URL(location, currentUrl).toString());
  }

  throw new Error("Too many redirects.");
}

async function readLimitedText(response: Response): Promise<string> {
  const reader = response.body?.getReader();

  if (!reader) {
    return "";
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (total < maxMetadataBytes) {
    const { done, value } = await reader.read();

    if (done || !value) {
      break;
    }

    total += value.byteLength;
    chunks.push(value.slice(0, Math.max(0, maxMetadataBytes - (total - value.byteLength))));
  }

  await reader.cancel().catch(() => undefined);

  return new TextDecoder().decode(concat(chunks));
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const merged = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return merged;
}

function extractFirstMatch(html: string, pattern: RegExp): string | null {
  const match = pattern.exec(html);

  return match?.[1] ?? null;
}

function extractMetaContent(html: string, predicate: (attrs: Record<string, string>) => boolean): string | null {
  const pattern = /<meta\s+[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const attrs = extractAttributes(match[0]);

    if (predicate(attrs) && attrs.content) {
      return attrs.content;
    }
  }

  return null;
}

function extractIconCandidates(html: string, baseUrl: URL): string[] {
  const icons: string[] = [];
  const pattern = /<link\s+[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const attrs = extractAttributes(match[0]);
    const rel = attrs.rel?.toLowerCase() ?? "";
    const relParts = rel.split(/\s+/);

    if (!attrs.href || !relParts.some((part) => part === "icon" || part === "apple-touch-icon" || part === "mask-icon")) {
      continue;
    }

    const iconUrl = toHttpUrl(attrs.href, baseUrl);

    if (iconUrl) {
      icons.push(iconUrl);
    }
  }

  return icons;
}

function extractAttributes(tag: string): Record<string, string> {
  const body = tag.replace(/^<\w+\s*/i, "").replace(/\/?>$/i, "");
  const attrs: Record<string, string> = {};
  const pattern = /([^\s"'=<>`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(body)) !== null) {
    const [, name, doubleQuoted, singleQuoted, unquoted] = match;
    attrs[name.toLowerCase()] = doubleQuoted ?? singleQuoted ?? unquoted ?? "";
  }

  return attrs;
}

function defaultIconCandidates(url: URL): string[] {
  return [
    new URL("/favicon.ico", url).toString(),
    new URL("/apple-touch-icon.png", url).toString(),
    new URL("/favicon.svg", url).toString(),
    googleFavicon(url.hostname)
  ];
}

function dedupeUrls(urls: string[]): string[] {
  return [...new Set(urls)];
}

function toHttpUrl(value: string, baseUrl: URL): string | null {
  try {
    const url = new URL(value, baseUrl);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400;
}

function isSameOrigin(targetUrl: URL, embeddingOrigin: string | null): boolean {
  if (!embeddingOrigin) {
    return false;
  }

  try {
    return targetUrl.origin === new URL(embeddingOrigin).origin;
  } catch {
    return false;
  }
}

function extractFrameAncestors(policy: string): string[] | null {
  for (const directive of policy.split(";")) {
    const trimmed = directive.trim();

    if (!trimmed.toLowerCase().startsWith("frame-ancestors")) {
      continue;
    }

    return trimmed.replace(/^frame-ancestors\s+/i, "").split(/\s+/).filter(Boolean);
  }

  return null;
}

function allowsFrameAncestor(sources: string[], targetUrl: URL, embeddingOrigin: string | null): boolean {
  if (sources.includes("'none'")) {
    return false;
  }

  if (sources.includes("*")) {
    return true;
  }

  if (!embeddingOrigin) {
    return false;
  }

  let embeddingUrl: URL;

  try {
    embeddingUrl = new URL(embeddingOrigin);
  } catch {
    return false;
  }

  return sources.some((source) => sourceAllowsOrigin(source, targetUrl, embeddingUrl));
}

function sourceAllowsOrigin(source: string, targetUrl: URL, embeddingUrl: URL): boolean {
  if (source === "'self'") {
    return targetUrl.origin === embeddingUrl.origin;
  }

  if (source.endsWith(":")) {
    return source === embeddingUrl.protocol;
  }

  try {
    const sourceUrl = new URL(source);

    if (sourceUrl.hostname.startsWith("*.")) {
      const suffix = sourceUrl.hostname.slice(1);
      return embeddingUrl.protocol === sourceUrl.protocol && embeddingUrl.hostname.endsWith(suffix);
    }

    return sourceUrl.origin === embeddingUrl.origin;
  } catch {
    return false;
  }
}

function googleFavicon(hostname: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=128`;
}

function decodeHtml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}
