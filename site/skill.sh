#!/bin/sh
# Installs the vibedesktop-app agent skill for Claude Code and Codex-style agents.
# It only writes text files into your skills folders; it runs nothing else.
#   curl -fsSL https://vibedesktop.online/skill.sh | sh
set -eu

BASE=${VIBEDESKTOP_SKILL_BASE:-https://vibedesktop.online/skill/vibedesktop-app}
FILES="SKILL.md scripts/check.py scripts/appspec.py references/format.md"
TARGETS="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
# Codex and other agents that read ~/.agents/skills get the same copy when that folder is in use.
if [ -d "$HOME/.agents" ] || [ -d "$HOME/.codex" ]; then TARGETS="$TARGETS $HOME/.agents/skills"; fi

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
for file in $FILES; do
  mkdir -p "$STAGE/$(dirname "$file")"
  curl -fsSL "$BASE/$file" -o "$STAGE/$file"
done
chmod 755 "$STAGE/scripts/check.py"

for root in $TARGETS; do
  target="$root/vibedesktop-app"
  mkdir -p "$root"
  rm -rf "$target.new"
  cp -R "$STAGE" "$target.new"
  rm -rf "$target"
  mv "$target.new" "$target"
  printf '%s\n' "Installed the vibedesktop-app skill in $target"
done
printf '%s\n' "Check a project: python3 \"$(printf '%s' "$TARGETS" | cut -d' ' -f1)/vibedesktop-app/scripts/check.py\" <project> --run"
