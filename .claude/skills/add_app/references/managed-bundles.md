# Managed bundles

Use this reference when `add.py --plan` reports more than one service or a
generated launch fails.

## Artifact contract

Bundles live under:

```text
${XDG_DATA_HOME:-~/.local/share}/vibedesktop/managed-apps/<name>-<project-hash>/
├── manifest.json  # mode 0600, schemaVersion 1
└── run.sh         # mode 0700
```

The manifest records the project root, primary port, and each service's role,
command, arguments, working directory, port, and detected framework. It stores
no daemon token. The stable project-path hash makes regeneration replace the
same bundle atomically rather than creating duplicates.

The Bash wrapper starts every service in its own subshell inside the daemon's
process group. The first detected service is primary and supplies the desktop
URL and health probe. If any child exits unexpectedly, the wrapper terminates
the remaining children and exits non-zero so `restart: on-crash` restarts the
whole application. A daemon stop sends TERM to the process group and exits
cleanly.

## Detection rules

- A supported root project recipe is used alone; it may already be a monorepo
  orchestrator such as Turbo or `concurrently`.
- Without a root recipe, conventional `web`, `frontend`, `client`, `ui`, `site`,
  `app`, `server`, `backend`, and `api` children are collected in that order.
- The first frontend-like child is normally primary. Inspect the plan before
  registration and do not proceed if the browser-facing service is not first.
- Primary JS port collisions can be allocated safely because the generated
  command receives an explicit port. Dependency ports are never silently moved;
  proxy and API contracts may depend on them.

## Failure handling

`--plan` is read-only. Normal generation writes the bundle before registering.
An HTTP registration failure deletes the generated bundle. With `--start`, a
failed start or unhealthy primary endpoint deletes the registration and bundle.
Existing external processes are not stopped or modified.
