#!/usr/bin/env -S npx tsx
import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateBundle, maxPackageBytes } from "../src/lib/desktop-packages/bundle";
import type { DesktopPackageBundle } from "../src/protocol/shell/package";
const [sourceArg, destinationArg] = process.argv.slice(2);
if (!sourceArg || !destinationArg) throw new Error("Usage: npm run packages:pack -- <source-directory> <output.vibepack.json>");
const source = path.resolve(sourceArg), destination = path.resolve(destinationArg);
const manifest = JSON.parse(await readFile(path.join(source, "manifest.json"), "utf8"));
const types: Record<string, string> = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".txt": "text/plain", ".wgsl": "text/plain", ".glsl": "text/plain", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif", ".gif": "image/gif", ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wasm": "application/wasm" };
const files: DesktopPackageBundle["files"] = {};
let bytes = 0;
async function collect(directory: string) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".") || ["node_modules", "manifest.json", "README.md"].includes(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (full === destination) continue;
    if (entry.isSymbolicLink()) throw new Error("Package assets must be real files, not symbolic links.");
    if (entry.isDirectory()) { await collect(full); continue; }
    const info = await lstat(full);
    bytes += info.size;
    if (bytes > maxPackageBytes || Object.keys(files).length >= 256) throw new Error("Package source exceeds 16 MiB or 256 files.");
    const data = await readFile(full);
    const mediaType = types[path.extname(entry.name)] || "application/octet-stream";
    const text = mediaType.startsWith("text/") || ["application/json", "image/svg+xml"].includes(mediaType);
    files[path.relative(source, full).split(path.sep).join("/")] = { mediaType, ...(text ? { text: new TextDecoder("utf-8", { fatal: true }).decode(data) } : { base64: data.toString("base64") }) };
  }
}
await collect(source);
const bundle = validateBundle({ format: "vibedesktop-bundle", bundleVersion: 1, manifest, shell: { major: 1, minMinor: 0 }, entry: { html: "desktop.html", css: "desktop.css", module: "desktop.js" }, files });
await writeFile(destination, JSON.stringify(bundle, null, 2) + "\n", { flag: "wx" });
console.log(`Created ${destination} (${Object.keys(files).length} files)`);
