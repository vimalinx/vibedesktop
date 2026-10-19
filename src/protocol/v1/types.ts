/** Public v1 wire types. Framework-free; additive changes only within major 1. */
export type OpeningMode = "desktop_window" | "external_tab";

export type DesktopAppKind = "builtin" | "url";

export type DesktopAppSource = "seed" | "directory" | "user" | "local";

export type IconKind = "builtin" | "favicon" | "custom_local" | "fallback";

export type WallpaperKind = "builtin" | "custom_local";

export type WallpaperFit = "cover" | "contain" | "stretch" | "center";

export type ThemeId =
  | "mineral"
  | "chrome-blue"
  | "edge-fluent"
  | "firefox-violet"
  | "safari-glass"
  | "arc-graphite"
  | "brave-ember"
  | "paper-ink"
  | "forest-calm"
  | "terminal-lime"
  | "studio-airy"
  | "noir-dense";

export type ShellStyle = "glass" | "browser" | "compact" | "focus";

export interface VibeUser {
  id: string;
  identityIssuer: string;
  identitySubject: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Desktop {
  id: string;
  userId: string;
  wallpaperKind: WallpaperKind;
  wallpaperBuiltinId: string;
  wallpaperFit: WallpaperFit;
  startAppId: string | null;
  themeId: ThemeId;
  shellStyle: ShellStyle;
  /** Validated user overrides on top of the active style pack; null = pack default. */
  accentOverride: string | null;
  fontOverride: string | null;
  seedVersion: number;
  createdAt: string;
  updatedAt: string;
  /** Namespaced package preferences. Absent in older snapshots. Never executable code. */
  packagePreferences?: Record<string, PackagePreferences>;
}

export interface DesktopApp {
  id: string;
  desktopId: string;
  kind: DesktopAppKind;
  source: DesktopAppSource;
  title: string;
  url: string | null;
  description: string | null;
  openingMode: OpeningMode;
  iconKind: IconKind;
  iconUrl: string | null;
  gridX: number;
  gridY: number;
  /** Grid footprint. 1×1 with the "icon" variant reproduces the classic icon;
      allowed combinations are whitelisted per variant in tile-contract.ts. */
  spanColumns: number;
  spanRows: number;
  tileVariant: string;
  sortOrder: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BuiltinWallpaper {
  id: string;
  name: string;
  cssValue: string;
}

export interface DesktopTheme {
  id: ThemeId;
  name: string;
  browserFit: string;
  description: string;
  backgroundCss: string;
  swatches: string[];
}

export interface ShellStyleOption {
  id: ShellStyle;
  name: string;
  description: string;
}

export interface AppDirectoryItem {
  id: string;
  title: string;
  url: string;
  description: string;
  /** Either an `https:` favicon (built-in seed) or a `data:` URL (catalog
      entries inline their icon so rendering the store makes no third-party
      request — see catalog-contract.ts). */
  iconUrl: string;
  openingMode: OpeningMode;
  /** Open-ended: the built-in seed uses "system" | "global-ai" | "china-ai",
      which stay localized, but a catalog cannot be constrained to a closed set.
      Unknown categories render from the raw id. */
  category: string;
  /** Website shortcut or a curated GitHub-hosted application project. */
  catalogKind?: "website" | "github_app";
  /** This reviewed catalog project exposes a browser UI and can be installed
      into the dedicated local workspace by the server-side installer. */
  selfHosted?: boolean;
  /** Reviewed host/container port used by the local installation recipe. */
  defaultPort?: number;
  /** Present only for reviewed GitHub application entries. */
  repositoryUrl?: string;
  /** Reviewed official hosted instance. Only compiled-in entries may set this;
      remote catalog artifacts cannot request in-desktop framing. */
  trialUrl?: string;
  /** Informational catalog snapshot metadata. */
  stars?: number;
  language?: string;
  license?: string;
  verifiedAt?: string;
}

export type CatalogWorkspaceInstallState =
  | "not_installed"
  | "queued"
  | "cloning"
  | "installing"
  | "registering"
  | "starting"
  | "update_available"
  | "installed"
  | "needs_agent"
  | "failed";

export interface CatalogWorkspaceInstallStatus {
  itemId: string;
  title: string;
  state: CatalogWorkspaceInstallState;
  message: string;
  workspacePath: string;
  updatedAt: string;
  appId?: string;
  port?: number;
  installer?: "official" | "agent";
  fallbackAvailable?: boolean;
  officialError?: string;
  installedSourceRef?: string;
  dataPath?: string;
  running?: boolean;
  healthy?: boolean;
}

export interface CatalogAgentInstallInstruction {
  itemId: string;
  title: string;
  repositoryUrl: string;
  workspacePath: string;
  instruction: string;
}

export interface DesktopPayload {
  user: VibeUser;
  desktop: Desktop;
  apps: DesktopApp[];
  wallpapers: BuiltinWallpaper[];
  themes: DesktopTheme[];
  shellStyles: ShellStyleOption[];
}

export interface MetadataResolveResult {
  url: string;
  title: string;
  description: string | null;
  iconCandidates: string[];
}

export interface EmbedCheckResult {
  url: string;
  embeddable: boolean;
  reason: "allowed" | "x_frame_options" | "frame_ancestors" | "unreachable";
  message: string | null;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId?: string;
    retryable?: boolean;
    outcome?: "not_started" | "unknown";
  };
}

/* ============================================================
   Local webapp management (vibe-daemon)
   ============================================================ */

export interface LocalAppConfig {
  id: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface LocalAppStatus {
  id: string;
  running: boolean;
  pid: number | null;
  startedAt: string | null;
  url: string;
  lastExitCode: number | null;
  lastError: string | null;
  restartCount: number;
  healthy: boolean;
  cpuPercent: number;
  memoryBytes: number;
  processCount: number;
  readBytes: number;
  writeBytes: number;
  sampledAt: string | null;
}

export interface LocalAppView extends LocalAppConfig {
  status: LocalAppStatus;
}

export interface LocalAppDiscoveryCandidate {
  name: string;
  source: string;
  port: number;
  command: string | null;
  args: string[];
  cwd: string | null;
  running: boolean;
  registerable: boolean;
  alreadyRegistered: boolean;
  dev: boolean;
  note: string;
  iconKind?: IconKind;
  iconUrl?: string | null;
}

/** One process in a project bundle. The first service is primary and owns the desktop URL. */
export interface LocalAppBundleService {
  name: string;
  role: "primary" | "dependency";
  command: string;
  args: string[];
  cwd: string;
  port: number;
  framework: string;
  note: string | null;
}

/** Read-only preview of what importing a project directory would register. */
export interface LocalAppImportPlan {
  name: string;
  projectRoot: string;
  bundleDir: string;
  services: LocalAppBundleService[];
  notes: string[];
}

export interface LocalAppImportResult {
  status: "registered" | "started";
  appId: string;
  manifestPath: string;
  url: string | null;
  plan: LocalAppImportPlan;
}

/** The generated, auditable launch bundle behind a project-imported local app. */
export interface LocalAppBundle {
  manifestPath: string;
  scriptPath: string;
  projectRoot: string;
  generatedAt: string | null;
  services: LocalAppBundleService[];
  script: string;
}

export interface DaemonHealth {
  ok: boolean;
  version?: string;
  uptime?: number;
}

export interface SystemStatus {
  sampledAt: string;
  hostname: string;
  platform: string;
  release: string;
  architecture: string;
  uptimeSeconds: number;
  cpuCount: number;
  loadAverage: number;
  totalMemoryBytes: number;
  freeMemoryBytes: number;
  desktop: {
    pid: number;
    uptimeSeconds: number;
    rssBytes: number;
    heapUsedBytes: number;
    nodeVersion: string;
  };
}

export type LocalAppControlAction = "start" | "stop" | "restart";

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export interface DesktopSnapshot { desktop: Desktop; apps: DesktopApp[] }
export interface PackagePreferences {
  revision: string | null;
  schemaVersion: number;
  values: JsonObject;
}
export interface ReplacePackagePreferences {
  ifRevision: string | null;
  schemaVersion: number;
  values: JsonObject;
}
export type BatchAppsInput =
  | { action: "delete"; ids: string[] }
  | { action: "undo"; ids: string[]; snapshot: DesktopSnapshot };
export interface DesktopVersionInfo {
  version: string;
  local: boolean;
  managed: boolean;
  previous: string | null;
  notes: string;
  canUpdate: boolean;
  canRollback: boolean;
  latest: string | null;
  installedAt: string | null;
  task: { state: "running" | "success" | "error"; detail: string; at: string; action?: "update" | "rollback" } | null;
}
