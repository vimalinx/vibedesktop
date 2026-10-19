import type { DesktopPackageManifest } from "../v1/package";
import type { DesktopDataSource } from "../v1/data-source";
import type { DesktopApp, JsonObject, PackagePreferences } from "../v1/types";
import type { AppWindowState } from "./v1";

/** Package files are portable. Bundle JS dependencies into the module entry. */
export interface DesktopPackageBundle {
  format: "vibedesktop-bundle";
  bundleVersion: 1;
  manifest: DesktopPackageManifest;
  shell: { major: 1; minMinor: number };
  entry: { html: string; css: string; module: string };
  files: Record<string, { mediaType: string; text?: string; base64?: string }>;
}
export interface ShellApp extends DesktopApp { label: string; imageUrl?: string; running?: boolean }
export interface SystemToolPresentation {
  /** An author-owned style name; supplied implementations use windows and macos. */
  appearance: string;
  colorScheme: "light" | "dark";
  accent: string;
}
export interface DesktopShellSnapshot {
  apps: ShellApp[];
  /** Optional desktop-only filter; launchers can still show all apps. */
  desktopAppIds?: string[];
  windows: AppWindowState[];
  locale: "zh" | "en";
  clock: string;
  userName: string;
  localService: "connected" | "unavailable" | "checking";
  wallpaper: string | null;
  reducedMotion: boolean;
  preferences: PackagePreferences;
}
export type WindowPatch = Partial<Pick<AppWindowState, "x" | "y" | "width" | "height" | "mode" | "maximized" | "tiled">>;
export interface DesktopShellCommands {
  open(appId: string): void;
  external(appId: string): void;
  focus(windowId: string): void;
  patch(windowId: string, patch: WindowPatch): void;
  close(windowId: string): void;
  addApp(): void;
  editApp(appId: string): void;
  removeApp(appId: string): void;
  arrangeApps(): void;
  moveApp(appId: string, x: number, y: number): void;
  wallpaper(): void;
  managePackages(): void;
  workspace(tool: "windows" | "scenes" | "organize" | "activity"): void;
  notify(message: string): void;
}
/** Browser-native shell API. No framework dependency and no template/animation restrictions. */
export interface DesktopShellHost extends DesktopShellCommands {
  version: { major: 1; minor: number };
  packageId: string;
  root: ShadowRoot;
  signal: AbortSignal;
  data: DesktopDataSource;
  snapshot(): DesktopShellSnapshot;
  subscribe(listener: (snapshot: DesktopShellSnapshot) => void): () => void;
  /** Place this slot in your window body. The live app stays mounted in the host. */
  content(windowId: string): HTMLElement;
  asset(path: string): string;
  /** Managed stylesheet for hosted app internals. Use :host as the package scope. */
  styleContent(css: string): () => void;
  /** Set shared system-tool and dialog presentation without replacing live app bodies. */
  presentSystemTools(presentation: SystemToolPresentation): void;
  savePreferences(values: JsonObject, schemaVersion?: number): Promise<PackagePreferences>;
}
export interface DesktopShellModule {
  mount(host: DesktopShellHost): void | (() => void) | Promise<void | (() => void)>;
}
