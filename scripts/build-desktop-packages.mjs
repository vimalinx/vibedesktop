#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "public/desktop-packages/source");
for (const [style, name] of [["windows", "Windows 11"], ["macos", "macOS"]]) {
  const bundle = {
    format: "vibedesktop-bundle", bundleVersion: 1,
    manifest: { format: "vibedesktop-package", manifestVersion: 1, id: `org.vibedesktop.${style}`, name, version: "1.0.0", protocol: { major: 1, minMinor: 0 }, requiredCapabilities: ["desktop", "packages.preferences"], optionalCapabilities: ["localApps", "system.metrics"], preferencesSchemaVersion: 1 },
    shell: { major: 1, minMinor: 1 }, entry: { html: "desktop.html", css: "desktop.css", module: "desktop.js" },
    files: {
      "desktop.html": { mediaType: "text/html", text: `<div class="os-shell" data-appearance="${style}" aria-label="桌面"></div>` },
      "desktop.css": { mediaType: "text/css", text: await readFile(path.join(source, "shell.css"), "utf8") },
      "content.css": { mediaType: "text/css", text: await readFile(path.join(source, "content.css"), "utf8") },
      "desktop.js": { mediaType: "text/javascript", text: await readFile(path.join(source, "shell.js"), "utf8") },
      "wallpaper.svg": { mediaType: "image/svg+xml", text: await readFile(path.join(source, `${style}.svg`), "utf8") },
    },
  };
  await writeFile(path.join(root, `public/desktop-packages/${style}.vibepack.json`), JSON.stringify(bundle, null, 2) + "\n");
}
console.log("Built Windows 11 and macOS desktop packages.");
