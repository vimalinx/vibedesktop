import type {
  AppDirectoryItem,
  DaemonHealth,
  DesktopApp,
  DesktopPayload,
  IconKind,
  LocalAppControlAction,
  LocalAppDiscoveryCandidate,
  LocalAppView,
  MetadataResolveResult,
  OpeningMode,
  ShellStyle,
  SystemStatus,
  ThemeId,
  VibeUser,
  WallpaperKind
} from "@/lib/contracts";

/**
 * The single interface through which the browser reads and writes desktop state.
 *
 * Vibe Desktop has one product mode: the browser talks to the local Next.js
 * process on the same machine. Host capabilities are required because there is
 * no hosted or browser-storage-only edition to emulate them.
 */
export interface DesktopDataSource {
  /* ----- session + full state ----- */
  getUser(): Promise<VibeUser | null>;
  loadDesktop(): Promise<DesktopPayload>;

  /* ----- desktop apps ----- */
  createUrlApp(input: CreateUrlAppInput): Promise<DesktopPayload>;
  updateApp(appId: string, patch: DesktopAppPatch): Promise<DesktopPayload>;
  deleteApp(appId: string): Promise<DesktopPayload>;

  /* ----- desktop settings ----- */
  updateDesktop(patch: DesktopPatch): Promise<DesktopPayload>;

  /* ----- app catalog ----- */
  listCatalog(): Promise<AppDirectoryItem[]>;
  addCatalogApp(itemId: string): Promise<DesktopPayload>;

  /** URL inspection performed by the local server inside its SSRF guard. */
  readonly urlMetadata: UrlMetadataCapability;
  /** The local `vibed` daemon family. */
  readonly localApps: LocalAppsCapability;
  /** Loopback reachability probing. */
  readonly localProbe: LocalProbeCapability;
  /** Host and Vibe Desktop process metrics. */
  readonly systemStatus: SystemStatusCapability;
}

export interface CreateUrlAppInput {
  title: string;
  url: string;
  description: string | null;
  openingMode: OpeningMode;
  iconKind: IconKind;
  iconUrl: string | null;
  setAsStart?: boolean;
}

/** Field-wise partial update of one desktop app. Every current call site sends
    a disjoint subset of these: full edit, icon only, opening mode only,
    position, or span. */
export type DesktopAppPatch = Partial<
  Pick<
    DesktopApp,
    | "title"
    | "url"
    | "description"
    | "openingMode"
    | "iconKind"
    | "iconUrl"
    | "gridX"
    | "gridY"
    | "spanColumns"
    | "spanRows"
    | "tileVariant"
  >
>;

export interface DesktopPatch {
  wallpaperKind?: WallpaperKind;
  wallpaperBuiltinId?: string;
  startAppId?: string | null;
  themeId?: ThemeId;
  shellStyle?: ShellStyle;
  accentOverride?: string | null;
  fontOverride?: string | null;
}

export interface UrlMetadataCapability {
  /** Reads title/description/icon candidates from a page, server-side. */
  resolve(url: string): Promise<MetadataResolveResult>;
  /** Reports whether a URL permits being framed. */
  checkEmbeddable(url: string): Promise<EmbedVerdict>;
}

export interface EmbedVerdict {
  embeddable: boolean;
  message: string | null;
}

export interface LocalAppInput {
  name: string;
  command: string;
  args?: string[];
  cwd?: string;
  port: number;
  env?: Record<string, string>;
  autoStart?: boolean;
  restart?: "no" | "on-crash" | "always";
  iconKind?: IconKind;
  iconUrl?: string | null;
}

export interface LocalAppsCapability {
  list(): Promise<LocalAppView[]>;
  get(id: string): Promise<LocalAppView>;
  create(input: LocalAppInput): Promise<LocalAppView>;
  update(id: string, patch: Partial<LocalAppInput>): Promise<LocalAppView>;
  remove(id: string): Promise<void>;
  control(id: string, action: LocalAppControlAction): Promise<void>;
  logs(id: string): Promise<string[]>;
  discover(): Promise<LocalAppDiscoveryCandidate[]>;
  /** Fetches the app's own favicon bytes. Returns null when none was found. */
  resolveIcon(id: string): Promise<Blob | null>;
  /** `null` means the check could not run — which is not a refusal. */
  checkEmbeddable(id: string): Promise<boolean | null>;
  daemonStatus(): Promise<DaemonHealth>;
}

export type LocalProbeStatus = "found" | "missing";

export interface LocalProbeCapability {
  probe(url: string): Promise<LocalProbeStatus>;
}

export interface SystemStatusCapability {
  read(): Promise<SystemStatus>;
}

/**
 * The one error type callers see.
 *
 * `serverMessage` is set **only** when the failure carried an author-written
 * reason — an `ApiErrorBody` from a route. That distinction matters: the two
 * surfaces that display a reason (tile
 * resize, style overrides) show `serverMessage` when there is one and their own
 * localized copy when there is not, which is exactly what the pre-refactor code
 * did with `body?.error?.message || t.something`. Using `message` there instead
 * would put "Request failed with status 500." on screen in the user's face.
 */
export class DesktopDataError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly serverMessage?: string;

  constructor(message: string, options: { code?: string; status?: number; serverMessage?: string } = {}) {
    super(message);
    this.name = "DesktopDataError";
    this.code = options.code ?? "request_failed";
    this.status = options.status;
    this.serverMessage = options.serverMessage;
  }
}

/** The author-written reason for a failure, or `null` if it had none. */
export function reasonFor(error: unknown): string | null {
  return error instanceof DesktopDataError ? error.serverMessage ?? null : null;
}
