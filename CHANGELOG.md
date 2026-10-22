# Changelog

All notable user-visible changes are documented here. Vibe Desktop follows
semantic versioning from the first public 0.2 release onward.

## 0.3.1 - 2026-10-22

The desktop itself is unchanged; this release publishes the new website.

### vibedesktop.online
- The home page is now a playable web preview of the desktop: draggable,
  resizable windows with edge snapping, a dock, Ctrl/⌘ K search, work scenes,
  and a layout that survives a refresh. Chinese and English.
- **Star Guide**: an eight-chapter interactive tutorial drawn as a
  constellation. Missions are real actions on the preview, and faithful
  simulations show importing a project, crash recovery, a market install with
  rollback, an app.json bug hunt against the real validator, and the security
  boundary.
- Art toys and sites: Ink (flow-field brush painting), Sound Garden (a circular
  pentatonic sequencer), four generative wallpapers, and a gallery of websites
  that can be opened in windows or pinned to the desktop.
- `/apps` and `/developers` open inside desktop windows; `/#install` and
  `/?open=tutorial&chapter=import` deep-link into the preview.

## 0.3.0 - 2026-10-22

Open-source projects can now ship themselves to Vibe Desktop, and users can
install them with one click — always after reviewing exactly what will run.

### App format
- A project commits `.vibedesktop/app.json`: install steps, required commands,
  and its frontend/backend services with ports. Specification:
  `docs/app-format.md`; JSON Schema at `vibedesktop.online/schema/app-v1.json`.
- Every service gets `PORT`, `HOST=127.0.0.1`, `VIBE_PORT_<NAME>` for each
  service, `VIBE_APP_URL`, and a private `VIBE_DATA_DIR` that survives updates.
- `vibedesktop add <dir>` and **Import project** follow the manifest instead of
  guessing, report every invalid field at once, and with `--setup` (or the new
  checkbox) check requirements and run the declared setup steps.

### One-click installs
- `vibedesktop install owner/repo[@commit]`, **Import project → Install from
  GitHub**, and `vibedesktop://install?…` links from vibedesktop.online all open
  the same confirmation dialog: repository, pinned commit, trust tier, every
  setup and service command, ports, and data folder. Nothing runs before you
  confirm.
- The preview fetches the commit without file contents; the install must match
  the previewed manifest digest. Install, health checks on every declared
  service, and rollback reuse the local import pipeline. Updates keep data and
  restart the previous commit when the new one fails. Uninstall keeps data unless
  asked.
- The installer registers a hidden `vibedesktop://` handler and starts the
  desktop when a link arrives while it is stopped. Existing installs get it by
  re-running the one-line installer once.
- Protocol 1.2 adds the `market.install` capability (`market.preview`,
  `market.install`, `market.installs`, `market.uninstall`).

### Market and authors
- vibedesktop.online gains an app market (`/apps`) built every six hours from
  GitHub repositories with the topic `vibedesktop-app` — no accounts, no
  server. Apps are **Community** by default; **Reviewed** covers one exact
  commit listed in `market/reviewed.json`.
- `/developers` explains the three steps and checks a repository in the
  browser with the same validator the desktop uses, then links a review request.
- The `vibedesktop-app` agent skill (`curl -fsSL https://vibedesktop.online/skill.sh | sh`)
  lets Claude Code and Codex package a project; its `check.py` validates,
  scaffolds (`--init`), and test-runs (`--run`) a manifest exactly like the desktop.
- `examples/fullstack-app` is a complete Node + Python example.

## 0.2.2 - 2026-10-20

- Installation no longer fails when a `package-lock.json` exists in a parent
  directory such as the home directory: the build pins its own project root
  instead of adopting the outer lockfile. The release gate now installs with a
  stray lockfile in the home directory to keep it that way.

## 0.2.1 - 2026-10-20

- The whole-app installer runs on Node.js 20 again (it used a Node 22-only API).
- Official app installers explain a missing `uv`, `docker`, or `git` instead of
  failing with `spawn … ENOENT`.
- The release pipeline installs `uv` so Python recipes are qualified as on
  users' machines. The 0.2.0 tag was published but its release build failed on
  these two issues, so 0.2.1 is the first 0.2 release with downloadable assets.

## 0.2.0 - 2026-10-20

Vibe Desktop is now positioned as one local desktop for every frontend +
backend project you run.

### Local projects
- Import a project folder from **Local WebApps → Import project** or with
  `vibedesktop add <dir> [--plan|--start]`: preview the detected frontend and
  backend services, register them as one app, and verify the start or roll it
  back. `vibedesktop scan` lists launchable WebUIs on the machine.
- Each imported app shows its generated `run.sh` and manifest; logs of
  multi-service apps can be filtered per service; deleting an app removes its
  generated bundle.
- Redesigned manager: service chips, live CPU and memory, one primary action
  with a compact tool bar, a guided first run, and a larger default window.
- Health checks also try `::1`, so Vite and other localhost-only dev servers are
  recognised; the frontend port search no longer stops at 3999; concurrent
  imports of one project register it once.

### Security
- Requests for any host name other than loopback or `VIBE_PUBLIC_ORIGIN` are
  refused, which blocks DNS-rebinding access to the local API.
- vibed compares its token in constant time, creates the token file 0600, and
  sends no CORS headers.

### Reliability
- Desktop and daemon state are fsynced, keep a last-good copy, and recover from
  a damaged file instead of failing every start or request.
- A crashing window shows a recoverable card; `/?safe=1` starts without
  reopening the last windows; malformed stored settings fall back to defaults.
- Stop, delete, and edit share one per-app queue; logs are written in bounded
  batches; bad request bodies return 400 and daemon timeouts 504.

### Install
- Releases install as a traced standalone server of about 85 MB instead of a
  full ~750 MB checkout; only the running and previous releases are kept.
- The rollback target is the version that actually ran before an update.
- `package-lock.json` resolves from registry.npmjs.org, so npm 12 can install.

### Earlier in this release

- Added the framework-independent v1 SDK, discovery, stable operation inventory,
  structured errors, and versioned package preferences with conflict detection.
- Added complete Windows 11 and macOS desktop packages with menus, window
  controls, snapping, per-package icon placement, and responsive layouts.
- Added a native HTML/CSS/JS package host with live application slots, managed
  styles and assets, effect settings, Canvas effects, reduced-motion support,
  trusted import/export/remove, backup restoration, and a recovery desktop.
- Added the package author CLI and a standalone Aurora Lab example; preserved
  iframe browsing contexts while switching packages and fixed a redundant
  loopback-frame navigation after the extension probe completed.

- Added desktop-wide quick search, recent launch ordering, window overview,
  split layouts, tiling, and keyboard window controls.
- Added named work scenes that preserve already-open pages and start required
  local services, plus desktop groups and batch shortcut removal with undo.
- Added persistent task notifications, installation tracking, startup logs and
  reconnect actions, browser snapshot history, and configurable automatic backups.
- Added installed-version status, release checking, independent update jobs,
  pre-update desktop backups and rollback controls.
- Paused hidden built-in panel polling, coalesced duplicate status reads,
  reserved space for desktop tools, and improved small-screen window layout.
- Preserved iframe drafts while minimizing and switching work scenes; fixed
  concurrent desktop saves, backup recovery, and the default-start label.

## 0.2.0 - 2026-09-04

- Split installed configuration, durable state, ephemeral endpoints,
  executables, and immutable release snapshots across their XDG locations.
- Added backward-compatible migration from the 0.1 installation layout.
- Added reviewed App Store update detection and data-preserving uninstall.
- Kept self-hosted application data outside replaceable source workspaces.
- Changed public publication to append-only sanitized commits with immutable
  tags and an atomic main-plus-tag push.
- Added Node.js 20 and 22 CI coverage and a full dependency vulnerability gate.
- Updated build tooling dependencies to remove known audit findings.

## 0.1.x

Initial local-first desktop, `vibed` process manager, reviewed application
catalog, signed release assets, and one-command Linux installer.
