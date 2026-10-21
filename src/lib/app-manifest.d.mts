export interface AppService {
  name: string;
  cwd: string;
  run: string;
  port: number;
  health: string;
}

export interface AppManifest {
  schemaVersion: 1;
  name: string;
  description: string;
  icon: string | null;
  category: string;
  homepage: string | null;
  requires: string[];
  setup: string[];
  services: AppService[];
  env: Record<string, string>;
}

export const APP_MANIFEST_PATH: ".vibedesktop/app.json";
export const APP_MANIFEST_SCHEMA_VERSION: 1;
export const APP_MANIFEST_SCHEMA_URL: string;
export const APP_MARKET_TOPIC: "vibedesktop-app";
export const APP_CATEGORIES: readonly string[];
export const APP_ICON_MAX_BYTES: number;
export const APP_MANIFEST_MAX_BYTES: number;

export function validateAppManifest(input: unknown): { ok: true; manifest: AppManifest } | { ok: false; errors: string[] };
export function serviceUsesPortVariable(service: Pick<AppService, "run">): boolean;
export function parseGithubRepository(input: unknown): { owner: string; repo: string; slug: string; url: string } | null;
export function isCommitSha(value: unknown): value is string;
export function marketInstallLink(slug: string, ref?: string | null): string;
export function parseInstallLink(input: unknown): { repo: string; ref: string | null } | null;
