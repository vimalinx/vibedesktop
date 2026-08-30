import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extensionDir = join(projectRoot, "browser-extension", "vibe-embed-companion");
const profileDir = process.env.VIBE_DESKTOP_CHROMIUM_PROFILE
  ? resolve(process.env.VIBE_DESKTOP_CHROMIUM_PROFILE)
  : join(homedir(), ".local", "share", "vibedesktop", "chromium-profile");
const desktopUrl = await resolveDesktopUrl();
const configuredBrowser = process.env.VIBE_DESKTOP_CHROMIUM;
const browserCandidates = [
  configuredBrowser,
  "/usr/bin/chromium",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/google-chrome"
].filter(Boolean);
const browser = browserCandidates.find((candidate) => existsSync(candidate));

if (!browser) {
  console.error("Vibe Desktop could not find Chromium. Set VIBE_DESKTOP_CHROMIUM to its absolute path.");
  process.exit(1);
}

if (!existsSync(join(extensionDir, "manifest.json"))) {
  console.error(`Vibe Desktop embed companion is missing: ${extensionDir}`);
  process.exit(1);
}

const child = spawn(
  browser,
  [
    `--user-data-dir=${profileDir}`,
    `--disable-extensions-except=${extensionDir}`,
    `--load-extension=${extensionDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--new-window",
    desktopUrl
  ],
  { detached: true, stdio: "ignore" }
);
child.unref();

console.log(`Vibe Desktop opened in its dedicated Chromium profile: ${profileDir}`);

async function resolveDesktopUrl() {
  if (process.env.VIBE_DESKTOP_URL) return process.env.VIBE_DESKTOP_URL;
  const candidates = ["http://127.0.0.1:3000", "http://127.0.0.1:3002"];
  for (const origin of candidates) {
    try {
      const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(600) });
      const body = await response.json();
      if (response.ok && body?.service === "vibedesktop") return `${origin}/start`;
    } catch {
      // Try the next known local development/installed origin.
    }
  }
  return `${candidates[0]}/start`;
}
