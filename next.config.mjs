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
  // No `output: "standalone"`. The product ships as a source checkout the owner
  // runs with `npm run build && npm run start`, so the server reads its runtime
  // and skill sources straight from the project directory. Standalone output was
  // the packaging step of the removed Docker release path; it also broke
  // `next start`, and nothing consumed the tree it produced.
  //
  // The tracing declarations below still describe which non-imported files each
  // route needs at runtime, which is what any future container or platform build
  // would have to copy.
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
