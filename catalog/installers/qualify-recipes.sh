#!/bin/sh
set -eu

installer_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
qa_root=${1:-$(mktemp -d "${TMPDIR:-/tmp}/vibedesktop-official-qa-XXXXXX")}
port=19000
results="$qa_root/results.tsv"

mkdir -p "$qa_root"
: >"$results"
jq -r '.recipes[].id' "$installer_dir/recipes.json" | while IFS= read -r app_id; do
  case_root=$(mktemp -d "$qa_root/$app_id-XXXXXX")
  staging="$case_root/staging"
  target="$case_root/target"
  data="$case_root/state"
  printf 'QUALIFY %s port=%s\n' "$app_id" "$port"
  VIBE_OFFICIAL_SKIP_PULL=1 VIBE_OFFICIAL_SKIP_INSTALL=1 \
    "$installer_dir/install-official.sh" prepare \
      --id "$app_id" --staging "$staging" --target "$target" --data "$data" --port "$port"
  sh -n "$staging/run.sh"
  if [ -f "$staging/cleanup.json" ]; then jq -e '.schemaVersion == 1 and .command == "docker"' "$staging/cleanup.json" >/dev/null; fi
  jq -e --arg id "$app_id" --argjson port "$port" \
    '.recipeId == $id and .port == $port and .installer == "official-script"' \
    "$staging/launch.json" >/dev/null
  kind=$(jq -r --arg id "$app_id" '.recipes[] | select(.id == $id) | .kind' "$installer_dir/recipes.json")
  if [ "$kind" = "compose" ]; then
    grep -F "$port" "$staging/.vibedesktop-compose.override.yaml" >/dev/null
  else
    grep -F "$port" "$staging/run.sh" >/dev/null
  fi
  if grep -R -F "$target/data" "$staging" >/dev/null 2>&1; then
    printf 'recipe %s leaked persistent data into the executable workspace\n' "$app_id" >&2
    exit 1
  fi
  source_ref=$(jq -r --arg id "$app_id" '.recipes[] | select(.id == $id) | .sourceRef' "$installer_dir/recipes.json")
  printf '%s\t%s\t%s\t%s\tpass\n' "$app_id" "$kind" "$source_ref" "$port" >>"$results"
  find "$case_root" -depth -delete
  port=$((port + 1))
done

expected=$(jq '.recipes | length' "$installer_dir/recipes.json")
actual=$(wc -l <"$results")
printf 'QUALIFIED %s/%s recipes at %s\n' "$actual" "$expected" "$qa_root"
test "$actual" -eq "$expected"
