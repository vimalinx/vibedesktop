import type {
  AppDirectoryItem,
  CatalogAgentInstallInstruction,
  CatalogWorkspaceInstallStatus,
  DaemonHealth,
  DesktopApp,
  DesktopPayload,
  IconKind,
  LocalAppBundle,
  LocalAppControlAction,
  LocalAppDiscoveryCandidate,
  LocalAppImportPlan,
  LocalAppImportResult,
  LocalAppView,
  MarketInstallPreview,
  MarketInstallStatus,
  MetadataResolveResult,
  OpeningMode,
  ShellStyle,
  SystemStatus,
  ThemeId,
  VibeUser,
  WallpaperFit,
  WallpaperKind
} from "./types";

/**
 * The single interface through which the browser reads and writes desktop state.
 *
 * Vibe Desktop has one product mode: the browser talks to the local Next.js
 * process on the same machine. Host capabilities are required because there is
 * no hosted or browser-storage-only edition to emulate them.
 */
export interface DesktopDataSource {
  /** Explicit discovery; capability support is separate from live service health. */
  describe(): Promise<import("./manifest").ProtocolManifest>;
  /* ----- session + full state ----- */
  getUser(): Promise<VibeUser | null>;
  loadDesktop(): Promise<DesktopPayload>;
  restoreDesktop(snapshot: import("./types").DesktopSnapshot): Promise<DesktopPayload>;

  /* ----- desktop apps ----- */
  createUrlApp(input: CreateUrlAppInput): Promise<DesktopPayload>;
  updateApp(appId: string, patch: DesktopAppPatch): Promise<DesktopPayload>;
  deleteApp(appId: string): Promise<DesktopPayload>;
  batchApps(input: import("./types").BatchAppsInput): Promise<DesktopPayload>;

  /* ----- desktop settings ----- */
  updateDesktop(patch: DesktopPatch): Promise<DesktopPayload>;

  /* ----- app catalog ----- */
  listCatalog(): Promise<AppDirectoryItem[]>;
  addCatalogApp(itemId: string): Promise<DesktopPayload>;
  readonly catalogInstalls: CatalogInstallsCapability;
  /** Apps from GitHub that declare `.vibedesktop/app.json`, pinned to one commit. */
  readonly marketInstalls: MarketInstallsCapability;

  /** URL inspection performed by the local server inside its SSRF guard. */
  readonly urlMetadata: UrlMetadataCapability;
  /** The local `vibed` daemon family. */
  readonly localApps: LocalAppsCapability;
  /** Loopback reachability probing. */
  readonly localProbe: LocalProbeCapability;
  /** Host and Vibe Desktop process metrics. */
  readonly systemStatus: SystemStatusCapability;
  readonly version: {
    read(check?: boolean): Promise<import("./types").DesktopVersionInfo>;
    change(action: "update" | "rollback", confirm: true): Promise<{ ok: true; state: "running" }>;
  };
  readonly packagePreferences: {
    read(packageId: string): Promise<import("./types").PackagePreferences>;
    replace(packageId: string, input: import("./types").ReplacePackagePreferences): Promise<import("./types").PackagePreferences>;
  };
}

export interface CatalogInstallsCapability {
  list(): Promise<CatalogWorkspaceInstallStatus[]>;
  install(itemId: string): Promise<CatalogWorkspaceInstallStatus>;
  uninstall(itemId: string, purgeData?: boolean): Promise<CatalogWorkspaceInstallStatus>;
  agentInstruction(itemId: string): Promise<CatalogAgentInstallInstruction>;
}

export interface MarketInstallsCapability {
  preview(repository: string, ref?: string | null): Promise<MarketInstallPreview>;
  list(): Promise<MarketInstallStatus[]>;
  install(input: { repository: string; ref: string; digest: string }): Promise<MarketInstallStatus>;
  uninstall(id: string, purgeData?: boolean): Promise<MarketInstallStatus>;
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
  wallpaperFit?: WallpaperFit;
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

export interface LocalAppImportInput {
  /** Absolute project directory, or one starting with `~/`. */
  path: string;
  name?: string;
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
  /** Detects the services in a project directory without registering anything. */
  planImport(input: LocalAppImportInput): Promise<LocalAppImportPlan>;
  /** Generates the bundle, registers it, and with `start` verifies health or rolls back. */
  importProject(input: LocalAppImportInput & { start: boolean; setup?: boolean }): Promise<LocalAppImportResult>;
  /** The generated launch bundle; `null` for apps that were not imported from a project. */
  bundle(id: string): Promise<LocalAppBundle | null>;
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
  readonly requestId?: string;
  readonly retryable: boolean;
  readonly outcome: "not_started" | "unknown";

  constructor(message: string, options: { code?: string; status?: number; serverMessage?: string; requestId?: string; retryable?: boolean; outcome?: "not_started" | "unknown" } = {}) {
    super(message);
    this.name = "DesktopDataError";
    this.code = options.code ?? "request_failed";
    this.status = options.status;
    this.serverMessage = options.serverMessage;
    this.requestId = options.requestId;
    this.retryable = options.retryable ?? false;
    this.outcome = options.outcome ?? "unknown";
  }
}

/** The author-written reason for a failure, or `null` if it had none. */
export function reasonFor(error: unknown): string | null {
  return error instanceof DesktopDataError ? error.serverMessage ?? null : null;
}
