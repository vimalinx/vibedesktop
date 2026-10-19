export class PublicOriginConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicOriginConfigurationError";
  }
}

/**
 * Resolve the one canonical browser origin for redirects and mutation checks.
 *
 * Loopback is the product's normal production shape: the owner runs
 * `npm run build && npm run start` on their own machine and reaches it at
 * `http://localhost:3000`, where the request URL *is* the browser origin and no
 * proxy sits in between. A non-loopback host is the case that implies a reverse
 * proxy, and there the internal request URL must never be trusted — it is the
 * proxy's bind address, not what the browser typed.
 */
export function resolvePublicOrigin(
  requestUrl: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const configured = env.VIBE_PUBLIC_ORIGIN?.trim();
  if (!configured) {
    const inferred = parseUrl(requestUrl, "The request URL must contain an absolute HTTP(S) origin.");
    if (env.NODE_ENV === "production" && !isLoopbackHost(inferred.hostname)) {
      throw new PublicOriginConfigurationError(
        "VIBE_PUBLIC_ORIGIN is required in production unless the app is served over loopback."
      );
    }

    return inferred.origin;
  }

  const url = parseUrl(configured, "VIBE_PUBLIC_ORIGIN must be an absolute HTTP(S) origin.");
  if (url.username || url.password) {
    throw new PublicOriginConfigurationError("VIBE_PUBLIC_ORIGIN must not contain credentials.");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new PublicOriginConfigurationError("VIBE_PUBLIC_ORIGIN must not contain a path, query, or fragment.");
  }
  // Traffic that cannot leave the machine gains nothing from TLS, and demanding
  // it would make the documented local production run impossible to configure.
  if (env.NODE_ENV === "production" && url.protocol !== "https:" && !isLoopbackHost(url.hostname)) {
    throw new PublicOriginConfigurationError("VIBE_PUBLIC_ORIGIN must use HTTPS in production.");
  }

  return url.origin;
}

/**
 * Hosts that resolve only to the local machine. `0.0.0.0` is deliberately absent:
 * it is a bind-all address, so seeing it in a request URL means the request
 * arrived through something else rather than from a loopback browser.
 */
/**
 * DNS-rebinding guard: a page on an attacker's name that resolves to 127.0.0.1
 * still sends its own name as Host. Only loopback names, or the configured
 * public origin's host, may reach the app at all.
 */
export function isAllowedHost(hostHeader: string | null, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!hostHeader) return false;
  let hostname: string;
  let host: string;
  try {
    ({ hostname, host } = new URL(`http://${hostHeader}`));
  } catch {
    return false;
  }
  if (isLoopbackHost(hostname)) return true;
  const configured = env.VIBE_PUBLIC_ORIGIN?.trim();
  if (!configured) return false;
  try {
    return new URL(configured).host === host;
  } catch {
    return false;
  }
}

export function isLoopbackHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
  // URL keeps IPv6 literals bracketed, and normalizes every form of ::1.
  if (hostname === "[::1]") return true;

  const octets = hostname.split(".");
  if (octets.length !== 4 || octets[0] !== "127") return false;

  return octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255);
}

function parseUrl(value: string, message: string): URL {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new PublicOriginConfigurationError(message);
    }
    return url;
  } catch (error) {
    if (error instanceof PublicOriginConfigurationError) throw error;
    throw new PublicOriginConfigurationError(message);
  }
}
