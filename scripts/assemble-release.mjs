#!/usr/bin/env node
// @ts-check
/**
 * Assemble a slim, runnable release directory from a checkout that was built
 * with `VIBE_STANDALONE=1 npm run build`.
 *
 * Next's standalone output already traces the exact server dependencies. This
 * adds the static assets it leaves out and the files the running app reads or
 * executes from its own directory (daemon runtime, add-app skill, browser
 * companion, catalog installers, desktop launcher). The result runs with
 * `node server.js` and contains no compiler binaries, build cache, dev
 * dependencies, tests, or git metadata.
 *
 * Usage: node scripts/assemble-release.mjs <built-checkout> <output-dir>
 */
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

/** Paths (relative to the checkout) the running app needs beside the traced server. */
const runtimeFiles = [
  "daemon",
  ".claude/skills/add_app",
  "browser-extension",
  "catalog/installers",
  "scripts/launch-desktop-chromium.mjs",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md"
];

const excluded = /(?:^|\/)(?:__pycache__|[^/]+\.test\.(?:mjs|ts|js)|test_[^/]+\.py)$/;

export async function assembleRelease(checkout, output) {
  const buildDir = path.join(checkout, process.env.VIBE_BUILD_DIR || ".next");
  const standalone = path.join(buildDir, "standalone");
  if (!(await exists(path.join(standalone, "server.js")))) {
    throw new Error(`No standalone build at ${standalone}. Build with VIBE_STANDALONE=1 first.`);
  }
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true, mode: 0o700 });

  await cp(standalone, output, { recursive: true, verbatimSymlinks: true });
  await cp(path.join(buildDir, "static"), path.join(output, path.basename(buildDir), "static"), { recursive: true });
  if (await exists(path.join(checkout, "public"))) {
    await cp(path.join(checkout, "public"), path.join(output, "public"), { recursive: true });
  }
  for (const relative of runtimeFiles) {
    const source = path.join(checkout, relative);
    if (!(await exists(source))) continue;
    await cp(source, path.join(output, relative), {
      recursive: true,
      filter: (file) => !excluded.test(path.relative(checkout, file).split(path.sep).join("/"))
    });
  }
  // Tracing can copy whole runtime directories, tests and bytecode caches included.
  for (const relative of runtimeFiles) await removeExcluded(output, path.join(output, relative));
  // The standalone tree may carry a build cache or env files from the checkout.
  await rm(path.join(output, path.basename(buildDir), "cache"), { recursive: true, force: true });
  for (const name of [".env", ".env.local", ".env.production", ".env.production.local"]) {
    await rm(path.join(output, name), { force: true });
  }
}

async function removeExcluded(root, directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (excluded.test(path.relative(root, file).split(path.sep).join("/"))) {
      await rm(file, { recursive: true, force: true });
    } else if (entry.isDirectory()) {
      await removeExcluded(root, file);
    }
  }
}

async function exists(file) {
  return stat(file).then(() => true, () => false);
}

const [checkoutArg, outputArg] = process.argv.slice(2);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  if (!checkoutArg || !outputArg) {
    console.error("Usage: node scripts/assemble-release.mjs <built-checkout> <output-dir>");
    process.exit(2);
  }
  await assembleRelease(path.resolve(checkoutArg), path.resolve(outputArg));
  console.log(`Assembled release at ${path.resolve(outputArg)}`);
}
