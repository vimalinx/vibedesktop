const addAppSkillFileNames = [
  "SKILL.md",
  "add.py",
  "scan.py",
  "manager.py",
  "references/managed-bundles.md",
  "agents/openai.yaml"
] as const;

export type AddAppSkillFileName = (typeof addAppSkillFileNames)[number];
export type AddAppSkillFiles = Record<AddAppSkillFileName, Buffer>;

export function listAddAppSkillFileNames(): readonly AddAppSkillFileName[] {
  return addAppSkillFileNames;
}

export function buildAddAppSkillInstaller(files: AddAppSkillFiles): string {
  const encodedFiles = Object.fromEntries(
    addAppSkillFileNames.map((name) => [name, files[name].toString("base64")])
  );

  return `#!/bin/sh
set -eu

if ! command -v python3 >/dev/null 2>&1; then
  printf '%s\n' 'VibeDesktop add_app requires python3.' >&2
  exit 1
fi

python3 - <<'VIBEDESKTOP_ADD_APP_INSTALLER'
import base64
import os
from pathlib import Path

destinations = [
    Path.home() / ".claude" / "skills" / "add_app",
    Path.home() / ".codex" / "skills" / "add-app",
    Path.home() / ".agents" / "skills" / "add-app",
]

files = ${JSON.stringify(encodedFiles, null, 2)}
for destination in destinations:
    destination.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(destination, 0o700)
    for name, encoded in files.items():
        target = destination / name
        target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        temporary = target.parent / f".{target.name}.tmp"
        temporary.write_bytes(base64.b64decode(encoded))
        os.chmod(temporary, 0o600)
        os.replace(temporary, target)

print("Installed VibeDesktop add-app skill for Claude, Codex, and shared local Agents")
VIBEDESKTOP_ADD_APP_INSTALLER
`;
}
