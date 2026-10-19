import type { JsonObject, PackagePreferences, ReplacePackagePreferences } from "./types";
import { protocolManifest } from "./manifest";

export interface DesktopPackageManifest {
  format: "vibedesktop-package";
  manifestVersion: 1;
  id: string;
  name: string;
  version: string;
  protocol: { major: number; minMinor: number };
  requiredCapabilities: string[];
  optionalCapabilities?: string[];
  preferencesSchemaVersion: number;
}
const namespacePattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
export function validPackageId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 120 && namespacePattern.test(value);
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function validatePackageManifest(value: unknown): DesktopPackageManifest {
  if (!record(value) || value.format !== "vibedesktop-package" || value.manifestVersion !== 1 ||
      !validPackageId(value.id) || typeof value.name !== "string" || !value.name.trim() || value.name.length > 120 ||
      typeof value.version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value.version) ||
      !record(value.protocol) || !Number.isSafeInteger(value.protocol.major) || Number(value.protocol.major) < 1 ||
      !Number.isSafeInteger(value.protocol.minMinor) || Number(value.protocol.minMinor) < 0 ||
      !Number.isSafeInteger(value.preferencesSchemaVersion) || Number(value.preferencesSchemaVersion) < 1) {
    throw new Error("Invalid desktop package manifest.");
  }
  for (const key of ["requiredCapabilities", "optionalCapabilities"]) {
    const capabilities = value[key];
    if (key === "optionalCapabilities" && capabilities === undefined) continue;
    if (!Array.isArray(capabilities) || capabilities.length > 64 || capabilities.some(c => typeof c !== "string" || !/^[a-zA-Z][\w.:-]{0,100}$/.test(c)) || new Set(capabilities).size !== capabilities.length) {
      throw new Error("Invalid package capability list.");
    }
  }
  return value as unknown as DesktopPackageManifest;
}
export function packageCompatibility(manifest: DesktopPackageManifest, host: { version: { major: number; minor: number }; capabilities: readonly string[] } = protocolManifest) {
  validatePackageManifest(manifest);
  const missing = manifest.requiredCapabilities.filter(capability => !host.capabilities.includes(capability));
  const versionMatches = manifest.protocol.major === host.version.major && manifest.protocol.minMinor <= host.version.minor;
  return { compatible: versionMatches && missing.length === 0, versionMatches, missingCapabilities: missing };
}

/** JSON-only, bounded, namespaced values; no executable callbacks or prototype keys. */
function jsonValue(value: unknown, depth = 0): boolean {
  if (depth > 20) return false;
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(item => jsonValue(item, depth + 1));
  return record(value) && Object.entries(value).every(([key, item]) => !["__proto__", "constructor", "prototype"].includes(key) && jsonValue(item, depth + 1));
}
export function validatePreferencesValues(value: unknown): asserts value is JsonObject {
  if (!record(value) || !jsonValue(value) || new TextEncoder().encode(JSON.stringify(value)).length > protocolManifest.limits.packagePreferencesBytes) {
    throw new Error("Package preferences must be a JSON object of at most 64 KiB and 20 nested levels.");
  }
}
export function validatePreferencesReplacement(value: unknown): ReplacePackagePreferences {
  if (!record(value) || !Object.hasOwn(value, "ifRevision") ||
      !(value.ifRevision === null || (typeof value.ifRevision === "string" && /^[\w-]{1,100}$/.test(value.ifRevision))) ||
      !Number.isSafeInteger(value.schemaVersion) || Number(value.schemaVersion) < 1) throw new Error("A valid schemaVersion and ifRevision are required.");
  validatePreferencesValues(value.values);
  return { ifRevision: value.ifRevision as string | null, schemaVersion: Number(value.schemaVersion), values: value.values };
}
export function validateStoredPreferences(value: unknown): asserts value is Record<string, PackagePreferences> {
  if (!record(value) || Object.keys(value).length > protocolManifest.limits.packagesPerDesktop) throw new Error("Invalid package preferences collection.");
  for (const [id, preferences] of Object.entries(value)) {
    if (!validPackageId(id) || !record(preferences)) throw new Error("Invalid package preferences namespace.");
    validatePreferencesReplacement({ ...preferences, ifRevision: preferences.revision });
  }
}
