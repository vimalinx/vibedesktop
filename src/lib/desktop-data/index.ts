import type { DesktopDataSource } from "@/lib/desktop-data/contract";
import { createServerDataSource } from "@/lib/desktop-data/server-source";

/**
 * Returns the local-machine data source once per browser session.
 *
 * A module singleton rather than a React context: this repo uses no contexts,
 * `VibeDesktop` already threads handlers to its children, and the singleton
 * keeps the change to one import per component. `catalog-source.ts` uses the
 * same `__setForTests` idiom on the server side.
 */
let cached: DesktopDataSource | null = null;

export function desktopData(): DesktopDataSource {
  if (!cached) {
    cached = createServerDataSource();
  }

  return cached;
}

export function __setDesktopDataForTests(source: DesktopDataSource | null): void {
  cached = source;
}

export { DesktopDataError, reasonFor } from "@/lib/desktop-data/contract";
export type {
  CreateUrlAppInput,
  DesktopAppPatch,
  DesktopDataSource,
  DesktopPatch,
  EmbedVerdict,
  LocalAppInput,
  LocalAppsCapability,
  LocalProbeCapability,
  LocalProbeStatus,
  UrlMetadataCapability
} from "@/lib/desktop-data/contract";
