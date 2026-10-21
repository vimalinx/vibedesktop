import { isCommitSha, parseGithubRepository } from "@/lib/app-manifest.mjs";

export interface MarketInstallRequest {
  repository: string;
  ref: string | null;
}

/** Dispatched on `window` to open the market install dialog from anywhere in the desktop. */
export const marketInstallEvent = "vibedesktop:market-install";

export function requestMarketInstall(request: MarketInstallRequest): void {
  window.dispatchEvent(new CustomEvent<MarketInstallRequest>(marketInstallEvent, { detail: request }));
}

/** `?install=owner/repo&ref=<sha>`; anything malformed is ignored rather than shown. */
export function readMarketInstallQuery(search: string): MarketInstallRequest | null {
  const query = new URLSearchParams(search);
  const repository = parseGithubRepository(query.get("install"));
  if (!repository) return null;
  const ref = query.get("ref");
  return { repository: repository.slug, ref: isCommitSha(ref) ? ref : null };
}
