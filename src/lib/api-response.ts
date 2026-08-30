import { NextResponse } from "next/server";
import type { ApiErrorBody } from "@/lib/contracts";
import { PublicOriginConfigurationError, resolvePublicOrigin } from "@/lib/public-origin";

export function apiError(status: number, code: string, message: string) {
  const body: ApiErrorBody = {
    error: {
      code,
      message
    }
  };

  return NextResponse.json(body, { status });
}

/**
 * Browser BFF mutation guard. Session cookies are HttpOnly, so a cross-site
 * caller must prove it is the same product origin before it can change state.
 *
 * The comparison stays exact even for loopback callers: a rogue server on
 * another local port must not be able to write to the desktop just because it is
 * also on 127.0.0.1. That makes a port-forward or reverse proxy indistinguishable
 * from an attacker here, so the rejection names the setting that fixes it.
 */
const crossOriginMessage =
  "Cross-origin requests are not allowed. If you reach the desktop through a proxy or port forward, " +
  "set VIBE_PUBLIC_ORIGIN to the origin your browser uses.";

export function rejectCrossOriginMutation(request: Request): NextResponse | null {
  let expectedOrigin: string;
  try {
    expectedOrigin = resolvePublicOrigin(browserFacingRequestUrl(request));
  } catch (error) {
    if (!(error instanceof PublicOriginConfigurationError)) throw error;
    return apiError(
      503,
      "origin_not_configured",
      "The public product origin is not configured. Set VIBE_PUBLIC_ORIGIN to the origin your browser uses."
    );
  }

  const origin = request.headers.get("origin");
  if (origin) {
    return origin === expectedOrigin ? null : apiError(403, "csrf_invalid", crossOriginMessage);
  }

  const referer = request.headers.get("referer");
  if (!referer) return apiError(403, "csrf_invalid", "A same-origin request is required.");
  try {
    return new URL(referer).origin === expectedOrigin
      ? null
      : apiError(403, "csrf_invalid", crossOriginMessage);
  } catch {
    return apiError(403, "csrf_invalid", "A same-origin request is required.");
  }
}

/**
 * Next's development server can canonicalize Request.url to `localhost` even
 * when the browser opened the same loopback listener as `127.0.0.1`. The Host
 * header is the browser-facing authority and is protected by the same-origin
 * request model, so use it for direct requests. A configured public origin
 * still wins inside resolvePublicOrigin, and a non-loopback production host
 * still fails closed unless that explicit configuration exists.
 */
function browserFacingRequestUrl(request: Request): string {
  const host = request.headers.get("host")?.trim();
  if (!host) return request.url;

  try {
    const internal = new URL(request.url);
    const browserFacing = new URL(`${internal.protocol}//${host}`);
    if (browserFacing.username || browserFacing.password || browserFacing.pathname !== "/") {
      return request.url;
    }
    return browserFacing.origin;
  } catch {
    return request.url;
  }
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RequestValidationError(`${field} is required`);
  }

  return value.trim();
}

export class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}
