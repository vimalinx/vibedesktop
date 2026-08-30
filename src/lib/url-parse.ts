/**
 * Browser-safe URL parsing.
 *
 * Split out of `url-safety.ts` because that module imports `node:dns` and
 * `node:net` for its private-network checks, which makes it unusable from the
 * browser bundle — while `parseHttpUrl` itself is pure `URL` parsing that does
 * no name resolution. The catalog contract (`catalog-contract.ts`) needs the
 * parser on both sides of the wire, so it lives here.
 *
 * `url-safety.ts` re-exports both symbols, so server callers can keep importing
 * from there.
 */
export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

export function parseHttpUrl(input: string): URL {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    throw new UnsafeUrlError("Enter a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only http and https URLs are supported.");
  }

  if (url.username || url.password) {
    throw new UnsafeUrlError("URLs with embedded credentials are not supported.");
  }

  return url;
}
