---
name: add-app
description: Add local WebUIs to Vibe Desktop as daemon-managed applications. Use when the user names a project path or port to add, asks to generate a managed launcher, or asks to scan the computer for launchable WebUIs.
---

# Add App

Turn a local WebUI into one Vibe Desktop icon with start, stop, restart, logs,
health, metrics, and crash supervision. The deterministic helpers are beside
this file; do not recreate their detection or daemon-auth logic manually.

## Add one named application

The user's request to add a specific path or port authorizes registering that
one target. Preview the resolved services, then generate/register and verify:

```bash
python3 "$SKILL_DIR/add.py" <path-or-port> --plan
python3 "$SKILL_DIR/add.py" <path-or-port> --start
```

If the runtime does not provide `SKILL_DIR`, use the directory containing this
`SKILL.md`. A target may be a project directory, `cwd`, `:4321`, or `4321`.

`add.py` writes a private manifest plus `run.sh` under the user's XDG data
directory, registers that wrapper with `vibed`, starts it when `--start` is
present, and waits for the primary WebUI to become healthy. A failed verified
start removes both the daemon registration and generated bundle.

For a conventional frontend/backend layout, the generated wrapper starts all
detected services in one process group and stops the whole bundle when any
member exits. Read [references/managed-bundles.md](references/managed-bundles.md)
when reviewing or troubleshooting a multi-service plan.

Report the resolved services, generated manifest path, desktop result, and live
health result. Single-click opens the registered app inside Vibe Desktop;
double-click opens it in a browser tab.

## Scan the computer

Use scanning only when the user asks for discovery:

```bash
python3 "$SKILL_DIR/scan.py"
```

Present launchable candidates first. Do not bulk-register anything until the
user selects entries; the default selection is none. A listener without a
recoverable command is bookmark-only and cannot be lifecycle-managed.

## Boundaries

- Never print or copy the daemon token.
- Do not take over an externally running process. Tell the user to stop it
  before starting the managed copy when the same port is occupied.
- A root-level project launch script wins over child detection because it may
  already orchestrate the monorepo.
- Do not guess around a busy dependency port in a multi-service project; require
  a project-native port override so frontend proxy contracts remain correct.
- Keep generated launch artifacts outside the source project. User code remains
  untouched.
