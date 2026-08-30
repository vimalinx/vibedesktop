import { NextResponse } from "next/server";
import { apiError, rejectCrossOriginMutation } from "@/lib/api-response";
import { AuthRequiredError, requireCurrentUser } from "@/lib/auth";
import { DaemonApiError, DaemonUnreachableError, getLocalApp } from "@/lib/daemon-client";
import { extractMetadataFromHtml } from "@/lib/metadata-resolver";

export const runtime = "nodejs";

/**
 * Resolve a local webapp's own icon from its running HTTP endpoint and return
 * the bytes. The browser can't `fetch()` a localhost favicon directly (most
 * local apps don't send CORS headers), so this runs server-side where fetch is
 * not CORS-gated.
 *
 * These are the user's own daemon-managed processes on this machine, so a direct
 * loopback fetch is appropriate here — we deliberately bypass the public-SSRF
 * guard in resolveUrlMetadata (which rejects localhost) by fetching the page
 * ourselves and reusing extractMetadataFromHtml only for the parsing.
 *
 * The caller stores the returned bytes in IndexedDB and marks the app
 * `iconKind: "custom_local"` so the icon survives even when the app is stopped.
 */
interface RouteContext {
  params: Promise<{ id: string }>;
}

const FETCH_TIMEOUT_MS = 4000;
const MAX_HTML_BYTES = 200_000;

export async function POST(request: Request, context: RouteContext) {
  const csrf = rejectCrossOriginMutation(request);
  if (csrf) return csrf;
  try {
    await requireCurrentUser();
    const { id } = await context.params;
    const app = await getLocalApp(id);
    const appUrl = app.status.url;
    if (!appUrl) {
      return apiError(502, "no_url", "app has no url yet (not started?)");
    }

    let baseUrl: URL;
    try {
      baseUrl = new URL(appUrl);
    } catch {
      return apiError(400, "invalid_url", "app url is not a valid URL");
    }

    const candidates = await iconCandidatesForLocalApp(baseUrl);
    for (const candidate of candidates) {
      const fetched = await fetchImageBytes(candidate);
      if (!fetched) continue;
      return new NextResponse(fetched.bytes, {
        status: 200,
        headers: {
          "content-type": fetched.contentType,
          "cache-control": "no-store"
        }
      });
    }

    return apiError(502, "no_icon", "no reachable icon for this app");
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return apiError(401, "auth_required", error.message);
    }
    if (error instanceof DaemonUnreachableError) {
      return apiError(503, "daemon_unreachable", error.message);
    }
    if (error instanceof DaemonApiError) {
      const status = error.code === "not_found" ? 404 : 502;
      return apiError(status, error.code, error.message);
    }
    throw error;
  }
}

/** Best-effort page fetch → reuse the shared HTML icon extractor; favicon fallback. */
async function iconCandidatesForLocalApp(baseUrl: URL): Promise<string[]> {
  const fallback = [`${baseUrl.origin}/favicon.ico`];
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(baseUrl.toString(), { redirect: "follow", signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) return fallback;
    const type = res.headers.get("content-type") ?? "";
    if (!type.toLowerCase().includes("html")) return fallback;
    const html = (await res.text()).slice(0, MAX_HTML_BYTES);
    const { iconCandidates } = extractMetadataFromHtml(html, baseUrl);
    return dedupe([...iconCandidates, ...fallback]);
  } catch {
    return fallback;
  }
}

async function fetchImageBytes(
  url: string
): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { redirect: "follow", signal: controller.signal });
    if (!res.ok) return null;
    const reported = res.headers.get("content-type") ?? "";
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength === 0) return null;
    return { bytes, contentType: imageContentType(reported, url) };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Trust an image/* content-type; otherwise infer from the URL; else default. */
function imageContentType(reported: string, url: string): string {
  if (reported.toLowerCase().startsWith("image/")) return reported.split(";")[0].trim();
  const path = url.split("?")[0].toLowerCase();
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".ico")) return "image/x-icon";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".webp")) return "image/webp";
  return "image/png";
}

function dedupe<T>(items: T[]): T[] {
  return [...new Set(items)];
}
