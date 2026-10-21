#!/usr/bin/env node
/**
 * Builds the vibedesktop.online app market from GitHub.
 *
 *   node scripts/market-build.mjs --out dist/site [--previous https://vibedesktop.online/market.json]
 *
 * Every repository with the `vibedesktop-app` topic (plus every reviewed one) is
 * pinned to one commit, its `.vibedesktop/app.json` is validated with the same
 * module the desktop uses, and the result is written as `<out>/market.json` and
 * `<out>/icons/<id>.<ext>`. A repository that fails validation is skipped and
 * reported; it never breaks the build. A run that cannot reach GitHub at all
 * fails instead of publishing an empty market.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  APP_ICON_MAX_BYTES,
  APP_MANIFEST_MAX_BYTES,
  APP_MANIFEST_PATH,
  APP_MARKET_TOPIC,
  isCommitSha,
  marketInstallLink,
  parseGithubRepository,
  validateAppManifest
} from "../src/lib/app-manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const outDir = path.resolve(argValue("--out") ?? path.join(root, "dist", "site"));
const token = process.env.GITHUB_TOKEN?.trim();
const ICON_TYPES = { svg: "image/svg+xml", png: "image/png", webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg" };
const MAX_REPOSITORIES = 1000;

const reviewed = await readList(path.join(root, "market", "reviewed.json"), "reviewed");
const blocked = new Set((await readList(path.join(root, "market", "blocked.json"), "blocked")).map((item) => String(item).toLowerCase()));

const report = { listed: [], skipped: [] };
const candidates = new Map();
for (const repo of await searchTopic()) candidates.set(repo.full_name.toLowerCase(), repo);
for (const entry of reviewed) {
  const repository = parseGithubRepository(entry.repository);
  if (repository && !candidates.has(repository.slug.toLowerCase())) {
    const repo = await github(`/repos/${repository.slug}`).catch(() => null);
    if (repo) candidates.set(repo.full_name.toLowerCase(), repo);
    else report.skipped.push({ repository: repository.slug, reason: "reviewed repository is not reachable" });
  }
}

await rm(path.join(outDir, "icons"), { recursive: true, force: true });
await mkdir(path.join(outDir, "icons"), { recursive: true });

const apps = (await mapLimit([...candidates.values()], 6, buildEntry)).filter(Boolean);
apps.sort((a, b) => Number(b.trust === "reviewed") - Number(a.trust === "reviewed") || b.stars - a.stars || a.name.localeCompare(b.name));

const market = { formatVersion: 1, generatedAt: new Date().toISOString(), topic: APP_MARKET_TOPIC, apps };
await writeFile(path.join(outDir, "market.json"), `${JSON.stringify(market, null, 2)}\n`);
await writeFile(path.join(outDir, "market-report.json"), `${JSON.stringify({ generatedAt: market.generatedAt, ...report }, null, 2)}\n`);
console.log(`market: ${apps.length} listed, ${report.skipped.length} skipped`);
for (const item of report.skipped) console.log(`  skip ${item.repository}: ${item.reason}`);

async function buildEntry(repo) {
  const slug = repo.full_name;
  const skip = (reason) => { report.skipped.push({ repository: slug, reason }); return null; };
  if (blocked.has(slug.toLowerCase())) return skip("blocked");
  if (repo.private || repo.disabled) return skip("not public");
  if (repo.archived) return skip("archived");
  const review = reviewed.find((entry) => String(entry.repository).toLowerCase() === slug.toLowerCase());
  if (review && !isCommitSha(review.ref)) return skip("reviewed.json entry has no valid commit SHA");

  let ref = review?.ref;
  if (!ref) {
    const commit = await github(`/repos/${slug}/commits/${encodeURIComponent(repo.default_branch)}`).catch(() => null);
    if (!isCommitSha(commit?.sha)) return skip("could not resolve the default branch commit");
    ref = commit.sha;
  }

  const raw = await rawFile(slug, ref, APP_MANIFEST_PATH, APP_MANIFEST_MAX_BYTES);
  if (!raw) return skip(`no ${APP_MANIFEST_PATH} at ${ref.slice(0, 12)}`);
  let parsed;
  try { parsed = JSON.parse(raw.toString("utf8")); } catch { return skip(`${APP_MANIFEST_PATH} is not valid JSON`); }
  const result = validateAppManifest(parsed);
  if (!result.ok) return skip(`invalid manifest: ${result.errors.slice(0, 3).join("; ")}`);
  const manifest = result.manifest;

  const id = `${repo.owner.login}--${repo.name}`.toLowerCase();
  let icon = null;
  if (manifest.icon) {
    const extension = manifest.icon.split(".").pop().toLowerCase();
    const bytes = await rawFile(slug, ref, `.vibedesktop/${manifest.icon}`, APP_ICON_MAX_BYTES);
    if (bytes && ICON_TYPES[extension]) {
      icon = `icons/${id}.${extension}`;
      await writeFile(path.join(outDir, icon), bytes);
    }
  }

  report.listed.push({ repository: slug, ref });
  return {
    id,
    repository: slug,
    url: repo.html_url,
    ref,
    trust: review ? "reviewed" : "community",
    ...(review?.reviewedAt ? { reviewedAt: String(review.reviewedAt) } : {}),
    name: manifest.name,
    description: manifest.description || repo.description || "",
    category: manifest.category,
    icon,
    homepage: manifest.homepage ?? (repo.homepage || null),
    stars: Number(repo.stargazers_count) || 0,
    license: repo.license?.spdx_id && repo.license.spdx_id !== "NOASSERTION" ? repo.license.spdx_id : null,
    language: repo.language || null,
    requires: manifest.requires,
    setupSteps: manifest.setup.length,
    services: manifest.services.map((service) => ({ name: service.name, port: service.port })),
    pushedAt: repo.pushed_at ?? null,
    installLink: marketInstallLink(slug, ref)
  };
}

async function searchTopic() {
  const repos = [];
  for (let page = 1; repos.length < MAX_REPOSITORIES; page += 1) {
    const query = encodeURIComponent(`topic:${APP_MARKET_TOPIC} fork:false`);
    const body = await github(`/search/repositories?q=${query}&sort=stars&order=desc&per_page=100&page=${page}`);
    repos.push(...body.items);
    if (body.items.length < 100) break;
  }
  return repos;
}

async function github(endpoint) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "vibedesktop-market-builder",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`GitHub ${endpoint}: ${response.status}`);
  return response.json();
}

async function rawFile(slug, ref, file, maxBytes) {
  try {
    const response = await fetch(`https://raw.githubusercontent.com/${slug}/${ref}/${file}`, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length <= maxBytes ? bytes : null;
  } catch {
    return null;
  }
}

async function mapLimit(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]).catch((error) => {
        report.skipped.push({ repository: items[index].full_name, reason: error instanceof Error ? error.message : "failed" });
        return null;
      });
    }
  }));
  return results;
}

async function readList(file, key) {
  const parsed = JSON.parse(await readFile(file, "utf8"));
  return Array.isArray(parsed[key]) ? parsed[key] : [];
}

function argValue(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
