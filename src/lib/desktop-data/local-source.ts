import type { AppDirectoryItem, DesktopPayload, VibeUser } from "@/lib/contracts";
import { mergeDirectorySources, parseCatalogArtifact } from "@/lib/catalog-contract";
import * as core from "@/lib/desktop-core";
import type { StoreShape, UserIdentity } from "@/lib/desktop-core";
import { appDirectory } from "@/lib/seed-data";
import { StoreNotFoundError } from "@/lib/persistence-errors";
import { StyleOverrideError, validateStyleOverrides } from "@/lib/style-packs";
import { TileValidationError } from "@/lib/tile-contract";
import {
  DesktopDataError,
  type CreateUrlAppInput,
  type DesktopAppPatch,
  type DesktopDataSource,
  type DesktopPatch
} from "@/lib/desktop-data/contract";

/**
 * The browser-local data source: the online trial.
 *
 * Everything a visitor does lives in their own browser, so no two visitors share
 * a desktop and there is nothing to defend against — the "everyone edits the
 * same desktop" problem is absent by construction rather than guarded.
 *
 * The desktop rules are not reimplemented here. Every method reads the store,
 * calls the same `desktop-core` function the server store calls, and writes the
 * store back. Seeding, seed migration, grid placement and tile validation are
 * therefore identical to the real product, and drift would require editing the
 * core that both use.
 *
 * The rules the *route* owns rather than the store — URL shape and style-override
 * validity — are applied here too (see `validateInput` below), because they are
 * product rules about what a desktop may contain, not transport details. A trial
 * that accepted an accent nobody can read against the canvas would be showing a
 * desktop the real product refuses to build.
 *
 * The server-only capabilities (`urlMetadata`, `localApps`, `localProbe`) are
 * deliberately absent rather than stubbed — see `contract.ts`.
 */

/** One value in, one value out. localStorage in the browser; a plain object in tests. */
export interface TrialStorage {
  read(): string | null;
  write(value: string): void;
}

export const trialStorageKey = "vd:trial:desktop:v1";

/**
 * The trial's single local visitor, mirroring `auth.ts`'s local identity so the
 * first visit seeds a desktop exactly the way a fresh install does.
 */
const trialIdentity: UserIdentity = {
  identityIssuer: "local:vibe-desktop",
  identitySubject: "trial:visitor",
  email: "visitor@localhost",
  emailVerified: false,
  displayName: "Visitor",
  avatarUrl: null
};

/** Where the build-time catalog artifact is served from in the static export. */
const catalogAssetPath = "/catalog.json";

export function createLocalDataSource(storage: TrialStorage = browserTrialStorage()): DesktopDataSource {
  /** Read → apply a core rule → write. The adapter owns only the I/O. */
  function mutate<T>(action: (store: StoreShape, user: VibeUser) => T): T {
    const store = readStore(storage);
    const user = core.getOrCreateUser(store, trialIdentity);
    let result: T;
    try {
      result = action(store, user);
    } catch (error) {
      // Every rule the core enforces (missing app, bad tile span) reaches the
      // caller as the one error type the interface promises, carrying the same
      // code and text the API route would have returned for it.
      throw asDesktopDataError(error);
    }
    writeStore(storage, store);

    return result;
  }

  let catalogPromise: Promise<AppDirectoryItem[]> | null = null;

  function catalog(): Promise<AppDirectoryItem[]> {
    catalogPromise ??= loadBundledCatalog();
    return catalogPromise;
  }

  return {
    mode: "local",

    async getUser(): Promise<VibeUser | null> {
      return mutate((_store, user) => user);
    },

    async loadDesktop(): Promise<DesktopPayload> {
      return mutate((store, user) => core.getDesktopPayload(store, user));
    },

    async createUrlApp(input: CreateUrlAppInput): Promise<DesktopPayload> {
      // `POST /api/apps` validates the URL before the store ever sees it; so do we.
      const url = requireHttpUrl(input.url);

      return mutate((store, user) =>
        core.createDesktopApp(store, user, {
          kind: "url",
          source: "user",
          title: requireTitle(input.title),
          url,
          description: input.description,
          openingMode: input.openingMode,
          iconKind: input.iconKind,
          iconUrl: input.iconUrl,
          setAsStart: input.setAsStart
        })
      );
    },

    async updateApp(appId: string, patch: DesktopAppPatch): Promise<DesktopPayload> {
      return mutate((store, user) => core.updateDesktopApp(store, user, appId, patch));
    },

    async deleteApp(appId: string): Promise<DesktopPayload> {
      return mutate((store, user) => core.deleteDesktopApp(store, user, appId));
    },

    async updateDesktop(patch: DesktopPatch): Promise<DesktopPayload> {
      // `PATCH /api/desktop` runs this before writing. The accent contrast bar in
      // particular is a product rule, not a transport check.
      try {
        validateStyleOverrides(patch);
      } catch (error) {
        if (error instanceof StyleOverrideError) {
          throw new DesktopDataError(error.message, {
            code: "invalid_style_override",
            status: 400,
            serverMessage: error.message
          });
        }
        throw error;
      }

      return mutate((store, user) => core.updateDesktop(store, user, patch));
    },

    listCatalog(): Promise<AppDirectoryItem[]> {
      return catalog();
    },

    async addCatalogApp(itemId: string): Promise<DesktopPayload> {
      const items = await catalog();
      const item = items.find((candidate) => candidate.id === itemId);

      if (!item) {
        throw new DesktopDataError("Directory app not found.", {
        code: "directory_app_not_found",
        status: 404,
        serverMessage: "Directory app not found."
      });
      }

      return mutate((store, user) =>
        core.addDirectoryApp(store, user, {
          title: item.title,
          url: item.url,
          description: item.description,
          openingMode: item.openingMode,
          iconUrl: item.iconUrl
        })
      );
    }

    // urlMetadata / localApps / localProbe are intentionally absent.
  };
}

/**
 * The catalog as a static asset instead of an API route.
 *
 * It still goes through `parseCatalogArtifact`, which is the trust boundary:
 * the key whitelist and the `data:`-only icon rule are exactly what makes an
 * entry safe to render, and that matters more on a public page than on a local
 * one. Any failure degrades to the built-in seed with nothing surfaced, matching
 * how the server behaves when a catalog fetch misses.
 */
async function loadBundledCatalog(): Promise<AppDirectoryItem[]> {
  let parsed: AppDirectoryItem[] = [];

  try {
    const response = await fetch(catalogAssetPath, { cache: "no-store" });
    if (response.ok) {
      parsed = parseCatalogArtifact(await response.json());
    }
  } catch {
    // Offline, missing asset, or unparseable body — the seed alone is fine.
  }

  return mergeDirectorySources({ builtin: appDirectory, catalog: parsed, local: [] });
}

function readStore(storage: TrialStorage): StoreShape {
  const raw = storage.read();
  if (!raw) return core.createEmptyStore();

  try {
    return core.normalizeStore(JSON.parse(raw));
  } catch {
    // A corrupt or foreign value must not brick the desktop; reseed instead.
    return core.createEmptyStore();
  }
}

function writeStore(storage: TrialStorage, store: StoreShape): void {
  try {
    storage.write(JSON.stringify(store));
  } catch {
    // Storage disabled or full. The in-memory desktop still works for this
    // visit, which is a better trial than an error dialog.
  }
}

function browserTrialStorage(): TrialStorage {
  return {
    read: () => window.localStorage.getItem(trialStorageKey),
    write: (value) => window.localStorage.setItem(trialStorageKey, value)
  };
}

/* ------------------------------------------------------------------ *
 * Input rules the API routes own, applied here for parity
 * ------------------------------------------------------------------ */

/**
 * Mirrors `requireHttpUrl` in `POST /api/apps` — deliberately that function and
 * not `parseHttpUrl`.
 *
 * `parseHttpUrl` additionally rejects embedded credentials, which the route does
 * not. Using it here would make the trial refuse a URL the real product accepts,
 * and a trial that is stricter than the product misrepresents it just as badly as
 * one that is laxer. If credentialed URLs should be refused, that belongs in the
 * route, where both modes would pick it up.
 */
function requireHttpUrl(value: string): string {
  const raw = value.trim();
  const invalid = (message: string) =>
    new DesktopDataError(message, { code: "invalid_request", status: 400, serverMessage: message });

  if (!raw) throw invalid("url is required");

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw invalid("url must be a valid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw invalid("url must use http or https");
  }

  return url.toString();
}

/** Mirrors `requireString(body.title, "title")` in `POST /api/apps`. */
function requireTitle(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new DesktopDataError("title is required", {
      code: "invalid_request",
      status: 400,
      serverMessage: "title is required"
    });
  }

  return trimmed;
}

/**
 * Maps a rule violation from the core onto the same code/status the API route
 * would have produced, so a caller's `catch` reads identically in both modes.
 */
function asDesktopDataError(error: unknown): DesktopDataError {
  if (error instanceof DesktopDataError) return error;

  if (error instanceof TileValidationError) {
    return new DesktopDataError(error.message, { code: error.code, status: 400, serverMessage: error.message });
  }

  if (error instanceof StoreNotFoundError) {
    return new DesktopDataError(error.message, {
      code: "app_not_found",
      status: 404,
      serverMessage: error.message
    });
  }

  return new DesktopDataError(error instanceof Error ? error.message : "The desktop could not be updated.");
}
