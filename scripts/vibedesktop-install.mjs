#!/usr/bin/env node
/**
 * `vibedesktop install owner/repo[@sha]` and the `vibedesktop://install?...`
 * link handler.
 *
 * Both only *name* an app. This script wakes the local desktop if it is
 * stopped, then opens it on the install confirmation dialog; the user reviews
 * the commit, commands, and ports there before anything runs. A link from a
 * web page therefore can never install anything by itself.
 */
import { spawn, execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { isCommitSha, parseGithubRepository, parseInstallLink } from "../src/lib/app-manifest.mjs";

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const origin = process.env.VIBE_APP_ORIGIN || "http://127.0.0.1:3000";

const target = parseTarget(process.argv[2]);
if (!target) {
  console.error("Usage: vibedesktop install <owner/repo | https://github.com/owner/repo>[@<commit-sha>]");
  console.error("       vibedesktop install 'vibedesktop://install?repo=owner/repo&ref=<commit-sha>'");
  process.exit(2);
}

if (!(await healthy())) {
  // Installed copies run as systemd user services; a checkout must be started by hand.
  console.log("Starting Vibe Desktop…");
  await execFileAsync("systemctl", ["--user", "start", "vibedesktop-daemon.service", "vibedesktop-app.service"]).catch(() => undefined);
  const deadline = Date.now() + 45_000;
  while (!(await healthy()) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 500));
  if (!(await healthy())) {
    console.error(`Vibe Desktop did not start at ${origin}. Check it with: vibedesktop status`);
    process.exit(1);
  }
}

const query = new URLSearchParams({ install: target.repo });
if (target.ref) query.set("ref", target.ref);
const url = `${origin}/?${query.toString()}`;
console.log(`Opening the install dialog for ${target.repo}${target.ref ? `@${target.ref.slice(0, 12)}` : ""}…`);

// Same dedicated window as `vibedesktop open`; any browser if Chromium is unavailable.
const launcher = spawn(process.execPath, [join(here, "launch-desktop-chromium.mjs")], {
  env: { ...process.env, VIBE_DESKTOP_URL: url },
  stdio: "ignore"
});
launcher.on("exit", (code) => {
  if (code === 0) return;
  const fallback = spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
  fallback.on("error", () => console.log(`Open this address in your browser: ${url}`));
  fallback.unref();
});

function parseTarget(input) {
  if (typeof input !== "string" || !input.trim()) return null;
  if (input.startsWith("vibedesktop:")) return parseInstallLink(input);
  const [name, ref] = input.trim().split("@");
  const repository = parseGithubRepository(name);
  if (!repository || (ref !== undefined && !isCommitSha(ref))) return null;
  return { repo: repository.slug, ref: ref ?? null };
}

async function healthy() {
  try {
    const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1500) });
    const body = await response.json();
    return response.ok && body?.service === "vibedesktop";
  } catch {
    return false;
  }
}
