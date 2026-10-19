# Official catalog installers

Vibe Desktop tries these reviewed Linux installers before offering the local
Agent fallback. `recipes.json` pins every source repository to an exact commit;
single-container applications also pin an immutable image digest.

The public entry point is:

```sh
catalog/installers/install-official.sh plan --id github-memos
catalog/installers/install-official.sh prepare \
  --id github-memos \
  --staging /absolute/private/staging \
  --target /absolute/final/workspace \
  --data /absolute/xdg-state/vibedesktop/apps/memos
```

`prepare` writes a private `launch.json`, `run.sh`, and (for containers) a
bounded `cleanup.json` into the staging
workspace. The Vibe Desktop server validates the launch contract, atomically
moves the workspace into place, registers it with `vibed`, starts it, and rolls
the registration back if the real HTTP health check fails.

Compose installers generate a Vibe-owned override which binds published ports
to `127.0.0.1`, redirects persistent volumes into the application state directory,
and rejects active services that still publish a non-loopback port or retain a
named volume. When an official installer cannot satisfy this contract, it fails
closed and the UI offers the local Agent recovery task instead.

`qualify-recipes.sh` fetches every pinned commit, prepares every launcher
without downloading runtime images or Python packages, and validates the
generated JSON and shell syntax. Passing source copies are removed immediately
to keep large repositories from filling `/tmp`; the printed evidence directory
retains a `results.tsv` row for every checked commit:

```sh
catalog/installers/qualify-recipes.sh
```
