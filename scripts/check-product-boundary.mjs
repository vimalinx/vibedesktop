#!/usr/bin/env node
// @ts-check
/**
 * Guards Vibe Desktop's permanent product boundary:
 * one local-machine, single-user product, complete under Apache-2.0.
 */
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const self = "scripts/check-product-boundary.mjs";
const productPrefixes = ["src/", "daemon/", "scripts/", "docs/", "site/"];
const productFiles = new Set(["README.md", "OPEN_SOURCE.md", "CONTRIBUTING.md", ".env.example", "package.json"]);
const retiredControlToken = ["cloud", "ControlEnabled"].join("");
const retiredControlEnv = ["VIBE", "CLOUD", "CONTROL", "ENABLED"].join("_");
const retiredDataMode = ["NEXT_PUBLIC", "VIBE", "DATA_MODE"].join("_");
const retiredDaemonDirectory = ["daemon", "cloud", ""].join("/");
const retiredBrowserSource = ["src/lib/desktop-data", "local-source.ts"].join("/");
const obsoleteLicensePattern = new RegExp(
  ["source[- ]available", ["noncommercial", "use", "only"].join(" "), "PolyForm[ -]" + "Noncommercial"].join("|"),
  "i"
);

const { stdout } = await execFileAsync("git", ["ls-files", "-z"], { cwd: root });
const tracked = stdout.split("\0").filter(Boolean);
const violations = [];

for (const file of tracked) {
  if (file === self || file.startsWith(".ai/") || file === "scripts/publish-public.mjs") continue;
  const contents = await readFile(path.join(root, file), "utf8").catch(() => null);
  if (contents === null) continue;
  if (file.startsWith(retiredDaemonDirectory)) violations.push(`${file}: retired daemon route directory`);
  if (file === retiredBrowserSource) violations.push(`${file}: retired browser-only data source`);
  if (file === "src/components/chrome/trial-unavailable.tsx") violations.push(`${file}: retired hosted-edition UI`);
  if (!productFiles.has(file) && !productPrefixes.some((prefix) => file.startsWith(prefix))) continue;
  if (contents.includes(retiredControlToken)) violations.push(`${file}: retired control metadata`);
  if (contents.includes(retiredControlEnv)) violations.push(`${file}: retired control environment variable`);
  if (contents.includes(retiredDataMode)) violations.push(`${file}: retired data-mode switch`);
}

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
if (packageJson.license !== "Apache-2.0") violations.push("package.json: license must be Apache-2.0");

const license = await readFile(path.join(root, "LICENSE"), "utf8");
if (!license.startsWith("Apache License\nVersion 2.0, January 2004")) {
  violations.push("LICENSE: canonical Apache License 2.0 text is required");
}

const identity = await Promise.all(
  ["README.md", "OPEN_SOURCE.md", "CONTRIBUTING.md", "package.json"].map(async (file) => ({
    file,
    contents: await readFile(path.join(root, file), "utf8")
  }))
);
for (const { file, contents } of identity) {
  if (obsoleteLicensePattern.test(contents)) {
    violations.push(`${file}: obsolete non-open-source licensing language`);
  }
}

const openSource = identity.find(({ file }) => file === "OPEN_SOURCE.md")?.contents ?? "";
for (const required of ["local-only", "single-user", "Apache License 2.0", "complete", '"private": true']) {
  if (!openSource.includes(required)) violations.push(`OPEN_SOURCE.md: missing required product-boundary statement: ${required}`);
}

if (violations.length > 0) {
  throw new Error(`Vibe Desktop product-boundary check failed:\n  ${violations.join("\n  ")}`);
}

process.stdout.write("Product boundary verified: local-only, single-user, complete Apache-2.0 source.\n");
