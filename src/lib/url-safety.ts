import { lookup } from "node:dns/promises";
import net from "node:net";
import { parseHttpUrl, UnsafeUrlError } from "@/lib/url-parse";

/**
 * Server-side URL safety: everything here needs `node:net` or `node:dns`.
 *
 * The pure parser lives in `url-parse.ts` so the browser can use it too, and is
 * re-exported here so existing server imports keep working unchanged.
 */
export { parseHttpUrl, UnsafeUrlError } from "@/lib/url-parse";

const blockedHostnames = new Set(["localhost", "localhost.localdomain"]);

export function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");

  return blockedHostnames.has(normalized) || normalized.endsWith(".localhost");
}

export function isPrivateIpAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const parts = address.split(".").map((part) => Number(part));
    const [a, b] = parts;

    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }

  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();

    return (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    );
  }

  return false;
}

export function isLoopbackAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/\[|\]/g, "").replace(/\.$/, "");

  if (normalized === "localhost" || normalized === "localhost.localdomain") {
    return true;
  }

  if (net.isIPv4(normalized)) {
    // The entire 127.0.0.0/8 range is loopback.
    return normalized.split(".")[0] === "127";
  }

  if (net.isIPv6(normalized)) {
    return normalized === "::1";
  }

  return false;
}

export async function assertPublicHttpUrl(input: string): Promise<URL> {
  const url = parseHttpUrl(input);

  if (isBlockedHostname(url.hostname)) {
    throw new UnsafeUrlError("Local URLs cannot be resolved by the server.");
  }

  if (net.isIP(url.hostname) && isPrivateIpAddress(url.hostname)) {
    throw new UnsafeUrlError("Private network URLs cannot be resolved by the server.");
  }

  const addresses = await lookup(url.hostname, { all: true, verbatim: true });

  if (addresses.some((address) => isPrivateIpAddress(address.address))) {
    throw new UnsafeUrlError("This URL resolves to a private network address.");
  }

  return url;
}
