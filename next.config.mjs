import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const addAppSkillFiles = [
  "./.claude/skills/add_app/SKILL.md",
  "./.claude/skills/add_app/add.py",
  "./.claude/skills/add_app/scan.py",
  "./.claude/skills/add_app/manager.py",
  "./.claude/skills/add_app/references/managed-bundles.md",
  "./.claude/skills/add_app/agents/openai.yaml"
];

const vibedRuntimeFiles = [
  "./daemon/**/*.mjs",
  ...addAppSkillFiles
];

const nextConfig = {
  devIndicators: false,
  distDir: process.env.VIBE_BUILD_DIR || ".next",
  // Release builds (VIBE_STANDALONE=1) emit Next's traced standalone server, which
  // scripts/assemble-release.mjs turns into a slim installed release run with
  // `node server.js`. Development, `npm run start`, and the e2e server keep the
  // regular `next start` layout. The tracing declarations below list the
  // non-imported files each route reads at runtime.
  ...(process.env.VIBE_STANDALONE === "1" ? { output: "standalone" } : {}),
  // Pin the tracing root to this project. Otherwise Next adopts any package-lock.json found in a
  // parent directory (a stray ~/package-lock.json is common) and nests the standalone server.
  outputFileTracingRoot: projectRoot,
  outputFileTracingIncludes: {
    "/api/setup/add-app-skill": addAppSkillFiles,
    "/api/setup/vibed": vibedRuntimeFiles,
    // The update manifest endpoint (`vibed update`'s source) reuses
    // loadVibedInstallerFiles/buildReleaseManifest and needs the exact same
    // runtime/skill inputs.
    "/api/setup/vibed/manifest": vibedRuntimeFiles
  },
  outputFileTracingExcludes: {
    "*": ["./.data/**/*"],
    "/api/setup/vibed": ["./daemon/**/*.test.mjs"],
    "/api/setup/vibed/manifest": ["./daemon/**/*.test.mjs"]
  },
  poweredByHeader: false,
  reactStrictMode: true,
  typedRoutes: true
};

export default nextConfig;
