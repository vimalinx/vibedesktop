/**
 * Stages the built catalog artifact as a static asset:
 *
 *   dist/catalog.json  →  public/catalog.json
 *
 * This is a copy step, not a second generator — `npm run catalog:build`
 * remains the only thing that produces a catalog. Packaging and local preview
 * therefore consume the same generated list.
 *
 * Usage:
 *   npm run catalog:build && npm run catalog:stage
 */
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(projectRoot, "dist", "catalog.json");
const destination = path.join(projectRoot, "public", "catalog.json");

let raw;
try {
  raw = await readFile(source, "utf8");
} catch (error) {
  if (error?.code === "ENOENT") {
    console.error(
      "dist/catalog.json is missing. Run `npm run catalog:build` first — staging never generates a catalog itself."
    );
    process.exit(1);
  }
  throw error;
}

// Fail here rather than shipping a file the browser will silently discard.
let parsed;
try {
  parsed = JSON.parse(raw);
} catch {
  console.error("dist/catalog.json is not valid JSON. Rebuild it with `npm run catalog:build`.");
  process.exit(1);
}

const entryCount = Array.isArray(parsed?.entries) ? parsed.entries.length : 0;

await mkdir(path.dirname(destination), { recursive: true });
await copyFile(source, destination);

console.log(`public/catalog.json  ${raw.length} bytes, ${entryCount} entries`);
