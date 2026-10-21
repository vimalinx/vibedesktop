/**
 * The Vibe Desktop app format: one `.vibedesktop/app.json` file that an
 * open-source project commits so any Vibe Desktop can install, start, and
 * supervise it without guessing.
 *
 * This module is plain, dependency-free ESM on purpose. The desktop server, the
 * market crawler, and the vibedesktop.online submission checker all import this
 * exact file, so an app that passes the website check is an app the desktop
 * accepts. `.claude/skills/add_app/appspec.py` mirrors these rules for Python;
 * keep the two in step and update `docs/app-format.md` with them.
 */

export const APP_MANIFEST_PATH = ".vibedesktop/app.json";
export const APP_MANIFEST_SCHEMA_VERSION = 1;
export const APP_MANIFEST_SCHEMA_URL = "https://vibedesktop.online/schema/app-v1.json";
/** Adding this GitHub topic to a repository is the whole market submission. */
export const APP_MARKET_TOPIC = "vibedesktop-app";
export const APP_CATEGORIES = Object.freeze([
  "ai", "developer-tools", "productivity", "media", "education", "data", "games", "other"
]);
export const APP_ICON_MAX_BYTES = 256 * 1024;
export const APP_MANIFEST_MAX_BYTES = 64 * 1024;

const TOP_LEVEL_KEYS = new Set([
  "$schema", "schemaVersion", "name", "description", "icon", "category", "homepage",
  "requires", "setup", "services", "env"
]);
const SERVICE_KEYS = new Set(["name", "cwd", "run", "port", "health"]);
const RESERVED_ENV = /^(PORT|HOST|PATH|HOME|USER|SHELL|PWD|LD_[A-Z0-9_]*|VIBE_[A-Z0-9_]*)$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

/**
 * Validates untrusted JSON (already parsed) and returns a normalized manifest
 * with every optional field filled in, or every problem found — never only the
 * first, so an author fixes the file in one pass.
 *
 * @param {unknown} input
 * @returns {{ ok: true, manifest: AppManifest } | { ok: false, errors: string[] }}
 */
export function validateAppManifest(input) {
  const errors = [];
  if (!isRecord(input)) return { ok: false, errors: ["The manifest must be a JSON object."] };

  for (const key of Object.keys(input)) {
    if (!TOP_LEVEL_KEYS.has(key)) errors.push(`${key}: unknown field (check the spelling; see ${APP_MANIFEST_SCHEMA_URL})`);
  }
  if (input.schemaVersion !== APP_MANIFEST_SCHEMA_VERSION) {
    errors.push(`schemaVersion: must be ${APP_MANIFEST_SCHEMA_VERSION}`);
  }

  const name = text(input.name, "name", errors, { required: true, max: 60, singleLine: true });
  const description = text(input.description, "description", errors, { max: 200, singleLine: true }) ?? "";

  let icon = null;
  if (input.icon !== undefined) {
    if (typeof input.icon !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}\.(svg|png|webp|jpe?g)$/i.test(input.icon)) {
      errors.push("icon: must be a file name inside .vibedesktop/ ending in .svg, .png, .webp, .jpg or .jpeg");
    } else icon = input.icon;
  }

  let category = "other";
  if (input.category !== undefined) {
    if (typeof input.category !== "string" || !APP_CATEGORIES.includes(input.category)) {
      errors.push(`category: must be one of ${APP_CATEGORIES.join(", ")}`);
    } else category = input.category;
  }

  let homepage = null;
  if (input.homepage !== undefined) {
    homepage = httpsUrl(input.homepage);
    if (!homepage) errors.push("homepage: must be an https:// URL");
  }

  const requires = stringList(input.requires, "requires", errors, 12, (value, at) => {
    if (!/^[a-z0-9][a-z0-9._+-]{0,39}$/.test(value)) errors.push(`${at}: must be a command name such as node, npm, python3, uv or docker`);
  });
  const setup = stringList(input.setup, "setup", errors, 12, (value, at) => {
    if (value.trim().length === 0 || value.length > 1000) errors.push(`${at}: must be a command of 1 to 1000 characters`);
    else if (value.includes("\u0000")) errors.push(`${at}: must not contain NUL characters`);
  });

  const services = [];
  if (!Array.isArray(input.services) || input.services.length < 1 || input.services.length > 6) {
    errors.push("services: must list 1 to 6 services; the first one is the page the desktop opens");
  } else {
    const names = new Set();
    const ports = new Set();
    input.services.forEach((raw, index) => {
      const at = `services[${index}]`;
      if (!isRecord(raw)) {
        errors.push(`${at}: must be an object`);
        return;
      }
      for (const key of Object.keys(raw)) {
        if (!SERVICE_KEYS.has(key)) errors.push(`${at}.${key}: unknown field`);
      }
      const serviceName = typeof raw.name === "string" && /^[a-z0-9][a-z0-9-]{0,31}$/.test(raw.name) ? raw.name : null;
      if (!serviceName) errors.push(`${at}.name: must be lowercase letters, digits or hyphens (for example web or api)`);
      else if (names.has(serviceName)) errors.push(`${at}.name: "${serviceName}" is used twice`);
      else names.add(serviceName);

      const cwd = raw.cwd === undefined ? "." : relativeDirectory(raw.cwd);
      if (cwd === null) errors.push(`${at}.cwd: must be a relative folder inside the repository, without ..`);

      const run = text(raw.run, `${at}.run`, errors, { required: true, max: 1000 });
      if (run && run.includes("\u0000")) errors.push(`${at}.run: must not contain NUL characters`);

      const port = Number.isSafeInteger(raw.port) && raw.port >= 1024 && raw.port <= 65535 ? raw.port : null;
      if (port === null) errors.push(`${at}.port: must be an integer from 1024 to 65535`);
      else if (ports.has(port)) errors.push(`${at}.port: ${port} is used by another service`);
      else ports.add(port);

      let health = "/";
      if (raw.health !== undefined) {
        if (typeof raw.health !== "string" || !/^\/[^\s]{0,199}$/.test(raw.health) || raw.health.startsWith("//")) {
          errors.push(`${at}.health: must be a path starting with / (for example /api/health)`);
        } else health = raw.health;
      }
      if (serviceName && cwd !== null && run && port !== null) services.push({ name: serviceName, cwd, run, port, health });
    });
  }

  const env = {};
  if (input.env !== undefined) {
    if (!isRecord(input.env)) errors.push("env: must be an object of NAME: \"value\" strings");
    else {
      const entries = Object.entries(input.env);
      if (entries.length > 32) errors.push("env: at most 32 variables");
      for (const [key, value] of entries) {
        if (!/^[A-Z_][A-Z0-9_]{0,63}$/.test(key)) errors.push(`env.${key}: names use A-Z, 0-9 and _`);
        else if (RESERVED_ENV.test(key)) errors.push(`env.${key}: is set by Vibe Desktop and cannot be overridden`);
        else if (typeof value !== "string" || value.length > 1000 || value.includes("\u0000")) errors.push(`env.${key}: must be a string of at most 1000 characters`);
        else env[key] = value;
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    manifest: {
      schemaVersion: APP_MANIFEST_SCHEMA_VERSION,
      name, description, icon, category, homepage, requires, setup, services, env
    }
  };
}

/** True when the primary service reads `$PORT`, so a busy port can be moved safely. */
export function serviceUsesPortVariable(service) {
  return /\$(\{PORT\}|PORT\b)/.test(service.run);
}

/**
 * Accepts `owner/repo`, `github.com/owner/repo`, or an https GitHub URL (with an
 * optional `.git`, trailing slash, or `/tree/...`). Returns null for anything
 * else — the market only installs from github.com.
 *
 * @param {unknown} input
 * @returns {{ owner: string, repo: string, slug: string, url: string } | null}
 */
export function parseGithubRepository(input) {
  if (typeof input !== "string") return null;
  let value = input.trim();
  if (!value || value.length > 300) return null;
  value = value.replace(/^https:\/\//i, "").replace(/^(www\.)?github\.com\//i, "");
  const [owner, rawRepo] = value.split("/");
  const repo = (rawRepo ?? "").replace(/\.git$/i, "");
  const ownerOk = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner ?? "");
  const repoOk = /^[A-Za-z0-9._-]{1,100}$/.test(repo) && repo !== "." && repo !== "..";
  if (!ownerOk || !repoOk) return null;
  const rest = value.split("/").slice(2);
  if (rest.length > 0 && !(rest[0] === "" || rest[0] === "tree" || rest[0] === "blob")) return null;
  const slug = `${owner}/${repo}`;
  return { owner, repo, slug, url: `https://github.com/${slug}` };
}

/** A full 40-character commit SHA; the market and the installer pin exact commits. */
export function isCommitSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
}

/** The link vibedesktop.online puts behind every Install button. */
export function marketInstallLink(slug, ref) {
  const query = new URLSearchParams({ repo: slug });
  if (ref) query.set("ref", ref);
  return `vibedesktop://install?${query.toString()}`;
}

/**
 * Parses a `vibedesktop://install?repo=owner/repo&ref=<sha>` link. The link only
 * ever *names* an app; the desktop still shows its confirmation dialog.
 *
 * @returns {{ repo: string, ref: string | null } | null}
 */
export function parseInstallLink(input) {
  if (typeof input !== "string" || input.length > 600) return null;
  let url;
  try { url = new URL(input); } catch { return null; }
  if (url.protocol !== "vibedesktop:") return null;
  const action = (url.hostname || url.pathname.replace(/^\/+/, "")).toLowerCase();
  if (action !== "install") return null;
  const repository = parseGithubRepository(url.searchParams.get("repo"));
  if (!repository) return null;
  const ref = url.searchParams.get("ref");
  if (ref !== null && !isCommitSha(ref)) return null;
  return { repo: repository.slug, ref };
}

function text(value, at, errors, { required = false, max, singleLine = false }) {
  if (value === undefined && !required) return null;
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${at}: ${required ? "is required and " : ""}must be non-empty text`);
    return null;
  }
  if (value.length > max) {
    errors.push(`${at}: must be at most ${max} characters`);
    return null;
  }
  if (singleLine && CONTROL.test(value)) {
    errors.push(`${at}: must be a single line without control characters`);
    return null;
  }
  return value.trim();
}

function stringList(value, at, errors, max, check) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max || value.some((item) => typeof item !== "string")) {
    errors.push(`${at}: must be a list of at most ${max} strings`);
    return [];
  }
  const before = errors.length;
  value.forEach((item, index) => check(item, `${at}[${index}]`));
  return errors.length === before ? [...value] : [];
}

function relativeDirectory(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 200) return null;
  if (value.startsWith("/") || value.includes("\\") || CONTROL.test(value)) return null;
  const parts = value.split("/").filter((part) => part !== "" && part !== ".");
  if (parts.some((part) => part === "..")) return null;
  return parts.length === 0 ? "." : parts.join("/");
}

function httpsUrl(value) {
  if (typeof value !== "string" || value.length > 300) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname && !url.username && !url.password ? value : null;
  } catch {
    return null;
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @typedef {object} AppService
 * @property {string} name
 * @property {string} cwd
 * @property {string} run
 * @property {number} port
 * @property {string} health
 *
 * @typedef {object} AppManifest
 * @property {1} schemaVersion
 * @property {string} name
 * @property {string} description
 * @property {string | null} icon
 * @property {string} category
 * @property {string | null} homepage
 * @property {string[]} requires
 * @property {string[]} setup
 * @property {AppService[]} services
 * @property {Record<string, string>} env
 */
