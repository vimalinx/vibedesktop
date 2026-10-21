#!/usr/bin/env node
/**
 * Assembles the static vibedesktop.online site:
 *
 *   node scripts/build-site.mjs [--out dist/site]
 *
 * Copies `site/`, the shared manifest validator the in-browser checker imports,
 * and the `vibedesktop-app` author skill that `skill.sh` downloads. Run
 * `scripts/market-build.mjs --out <same dir>` afterwards to add `market.json`.
 */
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const out = path.resolve(args.includes("--out") ? args[args.indexOf("--out") + 1] : path.join(root, "dist", "site"));

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(path.join(root, "site"), out, { recursive: true });
await cp(path.join(root, "src", "lib", "app-manifest.mjs"), path.join(out, "app-manifest.mjs"));
await cp(path.join(root, "skills", "vibedesktop-app"), path.join(out, "skill", "vibedesktop-app"), {
  recursive: true,
  filter: (source) => !/(__pycache__|\.pyc$)/.test(source)
});
// A market that has not been built yet is an empty market, not a broken page.
await writeFile(path.join(out, "market.json"), `${JSON.stringify({ formatVersion: 1, generatedAt: new Date().toISOString(), apps: [] }, null, 2)}\n`);
const pages = (await readFile(path.join(out, "_redirects"), "utf8")).trim();
console.log(`site: ${out}${pages ? ` (redirects: ${pages.split("\n").length})` : ""}`);
