import type { DesktopDataMode, DesktopDataSource } from "@/lib/desktop-data/contract";
import { createServerDataSource } from "@/lib/desktop-data/server-source";
import { createLocalDataSource } from "@/lib/desktop-data/local-source";

/**
 * Chooses the data source once per browser session.
 *
 * A module singleton rather than a React context: this repo uses no contexts,
 * `VibeDesktop` already threads handlers to its children, and the singleton
 * keeps the change to one import per component. `catalog-source.ts` uses the
 * same `__setForTests` idiom on the server side.
 */
let cached: DesktopDataSource | null = null;

export function desktopData(): DesktopDataSource {
  if (!cached) {
    cached = resolveMode() === "local" ? createLocalDataSource() : createServerDataSource();
  }

  return cached;
}

export function __setDesktopDataForTests(source: DesktopDataSource | null): void {
  cached = source;
}

/**
 * `local` is the online trial build. It requires a real browser, so during SSR
 * of the shell we fall back to `server` — nothing fetches before mount anyway,
 * and this keeps the first render from depending on storage that does not exist.
 */
function resolveMode(): DesktopDataMode {
  const configured = process.env.NEXT_PUBLIC_VIBE_DATA_MODE;

  if (configured === "local" && typeof window !== "undefined") {
    return "local";
  }

  return "server";
}

export { DesktopDataError, reasonFor } from "@/lib/desktop-data/contract";
export type {
  CreateUrlAppInput,
  DesktopAppPatch,
  DesktopDataMode,
  DesktopDataSource,
  DesktopPatch,
  EmbedVerdict,
  LocalAppInput,
  LocalAppsCapability,
  LocalProbeCapability,
  LocalProbeStatus,
  UrlMetadataCapability
} from "@/lib/desktop-data/contract";
