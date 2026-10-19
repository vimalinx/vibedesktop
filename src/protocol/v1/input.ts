import { operations, type OperationId } from "./operations";

/** Wire type checks precede domain validation; unknown fields are ignored for additive evolution. */
export function validateOperationInput(operation: OperationId, input: unknown): void {
  if (operations[operation].method === "GET") return;
  const bodyRequired = ["desktop.update", "desktop.restore", "apps.create", "apps.update", "apps.batch", "url.resolve", "url.embed", "localApps.create", "localApps.update", "localApps.control", "localApps.importPlan", "localApps.import", "version.change", "packages.preferences.replace"].includes(operation);
  if (input === undefined && !bodyRequired) return;
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("A JSON object is required.");
  const body = input as Record<string, unknown>;
  function field(key: string, test: (value: unknown) => boolean, required = false) {
    if (!(key in body) && !required) return;
    if (!test(body[key])) throw new Error(`Invalid ${key}.`);
  }
  const string = (v: unknown) => typeof v === "string";
  const nullableString = (v: unknown) => v === null || string(v);
  const nonempty = (v: unknown) => string(v) && (v as string).trim().length > 0;
  const boolean = (v: unknown) => typeof v === "boolean";
  const choice = (...values: unknown[]) => (v: unknown) => values.includes(v);
  const integer = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
  if (["apps.create", "apps.update"].includes(operation)) {
    field("title", nonempty, operation === "apps.create");
    field("url", operation === "apps.create" ? nonempty : nullableString, operation === "apps.create");
    field("description", nullableString); field("iconUrl", nullableString);
    field("openingMode", choice("desktop_window", "external_tab"));
    field("iconKind", choice("builtin", "favicon", "custom_local", "fallback"));
    for (const key of ["gridX", "gridY", "spanColumns", "spanRows"]) field(key, integer);
    field("tileVariant", string); field("setAsStart", boolean);
  }
  if (operation === "desktop.update") {
    field("wallpaperKind", choice("builtin", "custom_local"));
    field("wallpaperFit", choice("cover", "contain", "stretch", "center"));
    field("shellStyle", choice("glass", "browser", "compact", "focus"));
    field("themeId", string); field("wallpaperBuiltinId", string);
    for (const key of ["startAppId", "accentOverride", "fontOverride"]) field(key, nullableString);
  }
  if (operation === "url.resolve" || operation === "url.embed") field("url", nonempty, true);
  if (operation === "localApps.create" || operation === "localApps.update") {
    for (const key of ["name", "command"]) field(key, nonempty, operation === "localApps.create");
    field("cwd", string);
    field("port", v => Number.isSafeInteger(v) && Number(v) >= 1 && Number(v) <= 65535, operation === "localApps.create");
    field("args", v => Array.isArray(v) && v.every(string));
    field("env", v => !!v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every(string));
    field("autoStart", boolean); field("restart", choice("no", "on-crash", "always"));
    field("iconKind", choice("builtin", "favicon", "custom_local", "fallback")); field("iconUrl", nullableString);
  }
  if (operation === "localApps.control") field("action", choice("start", "stop", "restart"), true);
  if (operation === "localApps.importPlan" || operation === "localApps.import") {
    field("path", nonempty, true); field("name", string);
    if (operation === "localApps.import") field("start", boolean, true);
  }
  if (operation === "catalog.uninstall") field("purgeData", boolean);
  if (operation === "version.change") { field("action", choice("update", "rollback"), true); field("confirm", choice(true), true); }
  // Snapshot, batch and package preference payloads have dedicated domain validators.
}
