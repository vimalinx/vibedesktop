#!/usr/bin/env node
/**
 * Deploys the static vibedesktop.online site and makes the change visible at once:
 *
 *   node scripts/deploy-site.mjs [--build] [--dir dist/site]
 *
 * 1. With --build, runs build-site.mjs and market-build.mjs into the directory first.
 * 2. Uploads the directory to Cloudflare Pages with wrangler.
 * 3. Purges the custom domain's edge cache. The zone caches assets for hours, so
 *    without this a visitor can get the new page with last deploy's scripts.
 * 4. Fetches the domain's scripts and stylesheets until they match what was deployed.
 *
 * Credentials come from the environment, never from files:
 *   CLOUDFLARE_API_TOKEN (Pages: Edit, Zone: Cache Purge, and Zone: Read unless
 *   CLOUDFLARE_ZONE_ID is set), or CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL;
 *   CLOUDFLARE_ACCOUNT_ID. Optional: CLOUDFLARE_PAGES_PROJECT (default vibedesktop),
 *   VIBE_SITE_DOMAIN (default vibedesktop.online), CLOUDFLARE_ZONE_ID.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const dir = path.resolve(option("--dir", path.join(root, "dist", "site")));
const project = process.env.CLOUDFLARE_PAGES_PROJECT || "vibedesktop";
const domain = process.env.VIBE_SITE_DOMAIN || "vibedesktop.online";
const CHECKED_ASSETS = ["/app.js", "/styles.css", "/desktop.css", "/desktop/main.js", "/desktop/wm.js"];

const auth = process.env.CLOUDFLARE_API_TOKEN
  ? { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` }
  : process.env.CLOUDFLARE_API_KEY && process.env.CLOUDFLARE_EMAIL
    ? { "X-Auth-Key": process.env.CLOUDFLARE_API_KEY, "X-Auth-Email": process.env.CLOUDFLARE_EMAIL }
    : null;
if (!auth) fail("set CLOUDFLARE_API_TOKEN, or CLOUDFLARE_API_KEY and CLOUDFLARE_EMAIL");
if (!process.env.CLOUDFLARE_ACCOUNT_ID) fail("set CLOUDFLARE_ACCOUNT_ID");

function fail(message) {
  console.error(`deploy-site: ${message}`);
  process.exit(1);
}

async function run(command, commandArgs) {
  await execFileAsync(command, commandArgs, { cwd: root, env: process.env, maxBuffer: 32 * 1024 * 1024 })
    .catch((error) => fail(`${[command, ...commandArgs].join(" ")} failed:\n${error.stderr || error.message}`));
}

async function cloudflare(pathname, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${pathname}`, {
    ...init,
    headers: { ...auth, "Content-Type": "application/json", ...init.headers }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success !== true) {
    const reason = body.errors?.map((error) => error.message).join("; ") || `HTTP ${response.status}`;
    fail(`Cloudflare API ${pathname} refused: ${reason}`);
  }
  return body.result;
}

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

if (args.includes("--build")) {
  await run(process.execPath, ["scripts/build-site.mjs", "--out", dir]);
  await run(process.execPath, ["scripts/market-build.mjs", "--out", dir]);
  console.log(`built ${path.relative(root, dir) || "."}`);
}

const expected = Object.fromEntries(await Promise.all(CHECKED_ASSETS.map(async (asset) => {
  const contents = await readFile(path.join(dir, asset)).catch(() => fail(`${asset} is missing from ${dir}; build the site first or pass --build`));
  return [asset, sha256(contents)];
})));

await run("npx", ["--yes", "wrangler@4", "pages", "deploy", dir, "--project-name", project, "--branch", "main", "--commit-dirty=true"]);
console.log(`deployed ${dir} to Pages project ${project}`);

const zoneId = process.env.CLOUDFLARE_ZONE_ID || (await cloudflare(`/zones?name=${encodeURIComponent(domain)}`))[0]?.id;
if (!zoneId) fail(`no Cloudflare zone named ${domain} is visible to these credentials`);
await cloudflare(`/zones/${zoneId}/purge_cache`, { method: "POST", body: JSON.stringify({ purge_everything: true }) });
console.log(`purged the edge cache of ${domain}`);

for (let attempt = 1; ; attempt++) {
  const stale = [];
  for (const asset of CHECKED_ASSETS) {
    const response = await fetch(`https://${domain}${asset}`, { headers: { "Cache-Control": "no-cache" } }).catch(() => null);
    const served = response?.ok ? sha256(Buffer.from(await response.arrayBuffer())) : null;
    if (served !== expected[asset]) stale.push(asset);
  }
  if (stale.length === 0) break;
  if (attempt === 12) fail(`https://${domain} still serves an older ${stale.join(", ")} after repeated purges`);
  // The new deployment can take a few seconds to reach every edge; purge again behind it.
  await new Promise((resolve) => setTimeout(resolve, 5000));
  await cloudflare(`/zones/${zoneId}/purge_cache`, { method: "POST", body: JSON.stringify({ purge_everything: true }) });
}
console.log(`verified: https://${domain} serves this deploy's scripts and styles`);
