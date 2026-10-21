# Vibe Desktop guide

The [README](../README.md) covers installing Vibe Desktop and managing local projects. This guide covers the rest of the desktop.

## App catalog

The app store draws from three sources, merged by entry id, with **local always
winning**:

```
your own collection  >  optional public catalog  >  built-in seed
```

- **Built-in seed** — compiled in, always available, works offline.
- **Public catalog** — an optional static JSON list of links. Off by default:
  set `VIBE_CATALOG_URL` to opt in. A local-first desktop should not call out to
  a third party on first run without being asked.
- **Your own collection** — `local-catalog.json` in the state directory
  (`~/.local/state/vibedesktop/` when installed, `.data/` in a source checkout;
  override with `VIBE_LOCAL_CATALOG_FILE`): the same entry format, in a file you own and edit
  by hand. A bare JSON array is enough:

  ```json
  [{ "id": "my-tool", "title": "My Tool", "url": "https://tool.example" }]
  ```

Catalog entries are links and nothing more — an entry cannot express a command,
working directory, or port. A single click follows its saved opening mode (desktop window by default), and a
double click opens its website in a browser tab. Fetch failure
is a non-event: the desktop falls back to the last-good cache, then to the
built-in seed, and stays fully usable with the catalog host unreachable.

To publish a catalog of your own, see [`catalog/README.md`](../catalog/README.md):

```bash
npm run catalog:build   # catalog/source.json → dist/catalog.json
```

## App market installs

The link catalog above never runs anything. Installable apps are a separate path:
open-source projects that commit [`.vibedesktop/app.json`](app-format.md).

- **Where installs start:** an **Install** button on
  [vibedesktop.online/apps](https://vibedesktop.online/apps) (a `vibedesktop://install` link),
  `vibedesktop install owner/repo[@commit]`, or **Local WebApps → Import project → Install
  from GitHub**. All three open the same confirmation dialog; a link wakes the desktop first
  if it is stopped.
- **What you confirm:** repository, pinned commit, trust tier (Reviewed, Community, or not in
  the market), required commands and whether they are installed, every setup command, every
  service command and port, and the data folder.
- **Where it goes:** source in `~/.local/share/vibedesktop/workspaces/market/<owner>--<repo>/`,
  data in `~/.local/state/vibedesktop/apps/market/<owner>--<repo>/`. The app then behaves like
  any imported project: one icon, start/stop together, per-service logs.
- **Updates and removal:** installing a newer commit keeps the data and restarts the previous
  commit if the new one fails. `DELETE /api/v1/market-installs/<id>` (or removing the app in
  Local WebApps) keeps data unless you ask to delete it.

To make your own project installable, see the [app format](app-format.md) and
[vibedesktop.online/developers](https://vibedesktop.online/developers).

## Desktop continuity and backups

Minimizing a window keeps its embedded app mounted, including unsaved in-page
state. Refreshing the desktop restores known app windows, positions, sizes,
stacking order and minimized/maximized state. A browser refresh still reloads
websites; save unfinished work inside those websites before refreshing.

Use **Settings → Backup & restore** to download a JSON backup of desktop apps,
appearance, uploaded wallpaper/icons, browser preferences and window layout.
Import validates the version, configuration and image data before writing. The
confirmation step saves a browser-local recovery copy and downloads a backup of the current desktop first;
failed restores roll back browser assets/preferences. Keep that recovery file
until you have checked the restored desktop. **Recover previous desktop** also reopens the saved recovery copy if the download was blocked. Backups are limited to 48 MB.

This is a desktop backup. Local WebApp source, service registrations and
application databases, along with website cookies/sign-in sessions, are separate.
On a different machine, register the local services before restoring their windows.
Backups may contain private shortcut URLs and images; store them privately.

## Daily desktop tools

The top toolbar provides **Quick search**, **Windows**, **Work scenes**,
**Organize apps**, and **Activity**. Search covers desktop shortcuts, local apps,
and built-in settings; selecting an already-open app focuses its existing window.

- `Ctrl/Command + K`: search; Enter opens the first result, Tab moves through results.
- `Alt + W`: window overview; `Alt + backtick`: cycle windows;
  `Alt + Shift + X`: close the active window using the normal local-service confirmation.
- Drag a regular window to the left/right edge to split it, or choose a half or
  tile all visible windows from the overview. Browser/iframe focus can reserve
  keyboard shortcuts; the toolbar remains available.
- Save a named scene to reuse its application set and layout. Restoring a scene
  preserves mounted windows and minimizes other windows. Missing shortcuts are
  skipped and required stopped local services are started. App-internal documents
  and unsaved drafts are not serialized across browser restarts.
- Group multiple selected apps and filter the desktop by group. Batch shortcut
  removal has an undo action in the current panel session; undo preserves apps
  added since removal. Built-in entries and daemon registrations are not deleted.

Settings → **Backup & restore** adds snapshot history, restore previews, and
hourly/daily/weekly scheduling with 3/7/14 retained copies. Scheduling is initially
off and runs only while the desktop is open; a due backup is caught up on the next
visit. History lives in this browser's IndexedDB and is not itself recursively
included in exported backups. Export important copies before clearing browser data.

Settings → **Version management** shows the actual installed build and previous
version. Managed release installations can check their configured release source,
update in an independent systemd user job, and roll back. Local builds are clearly
labelled and use the local build/install workflow, preventing remote releases from
overwriting local fixes. A source checkout cannot restart installed services.
Version changes back up server-side desktop configuration; browser assets retain
their existing separate backup mechanism. Save third-party app documents before
restarting or reloading the desktop.

## Custom desktop protocol

The built-in desktop uses the framework-independent [v1 protocol and SDK](protocol/v1.md). Independent frontends can share the same backend through `/api/v1`, discover capabilities, and save package-scoped preferences with conflict detection. Windows 11 and macOS now ship as complete browser-native HTML/CSS/JS desktop packages. Switch or export them from the appearance manager, customize window chrome and effects, or import your own package. Read the [package author guide](protocol/desktop-packages.md) and build the runnable [Aurora Lab example](../examples/effects-desktop). Live application frames remain mounted across package switches; full backups include imported packages and their settings.

## Running from source

### Development

```bash
npm install
npm run dev
```

Run `npm run desktop:open`. It finds the local Vibe Desktop server on port 3000
(or the development fallback on 3002) and opens the dedicated Chromium profile.
The first request auto-provisions the single local user and a seeded desktop;
data persists to `.data/vibedesktop-dev.json` (override with `VIBE_DATA_FILE`).

### Production

```bash
npm run build
npm run start
```

Run `npm run desktop:open` again — a production run needs no extra configuration.

Mutations are guarded against cross-site callers by comparing the request's origin
against the one canonical browser origin. Over loopback (`localhost`, `127.0.0.x`,
`[::1]`) that origin is the request's own, so it is inferred and plain HTTP is
accepted — a direct local run needs no configuration.

Set `VIBE_PUBLIC_ORIGIN` to the exact origin your browser shows whenever anything
sits between the two and rewrites the host or port — a reverse proxy on a real
hostname (which must be HTTPS), or an SSH port forward (`http://localhost:8080` is
accepted, because loopback traffic cannot leave the machine). Without it those
writes are refused: the check stays an exact match even for loopback callers, so
another local port cannot write to your desktop just by also being on 127.0.0.1.

## Installing vibed on its own

The optional `vibe-daemon` (`vibed`) manages local Node/Python/web servers as child processes, so the desktop can start, stop, restart, and embed them in windows. From a source checkout:

```bash
export VIBE_DAEMON_CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/vibed"
export VIBE_DAEMON_STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/vibed"
export VIBE_DAEMON_RUNTIME_DIR="${XDG_RUNTIME_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/runtime}/vibed"
npm run daemon
```

To install it as a systemd user service on Linux (Node.js 20+), use the installer attached to the latest GitHub Release:

```bash
curl -fsSL 'https://github.com/vimalinx/vibedesktop/releases/latest/download/install.sh' | sh
```

When running the app locally you can also use the same installer served by the app itself: `curl -fsSL 'http://localhost:3000/api/setup/vibed' | sh`.

The installer stages a versioned, checksum-verified runtime under the user's XDG data directory, writes commands to `XDG_BIN_HOME`, and keeps configuration, durable state, and ephemeral endpoint files in their corresponding XDG homes. It also installs the cross-agent `add-app` Skill and a private systemd user service. The Skill is installed for Claude, Codex, and shared local Agent discovery. A user can say:

```text
Use add-app to add ~/Projects/my-webui to Vibe Desktop, start it, and verify health.
```

The Skill previews the detected services and generates a private, auditable
`manifest.json` plus `run.sh` under the XDG data directory. Conventional
frontend/backend projects become one managed process group and one desktop
icon; a failed verified launch is rolled back. Maintenance is explicit:

```bash
vibed status
vibed logs
vibed update
vibed rollback
vibed uninstall
```

## Browser regression tests

```bash
npx playwright install chromium
npm run test:e2e
# Or use a system Chromium:
VIBE_TEST_CHROMIUM=/usr/bin/chromium npm run test:e2e
```

The suite starts a separate loopback server on port 3110, uses temporary desktop
and daemon paths and an isolated browser context, and removes its test data on
shutdown. It never reuses a running desktop or the installed daemon. The tests
cover iframe continuity, opening mode, window restoration, backup/restore and
failure recovery, concurrent HTTP writes and cross-origin restore rejection.
CI runs this suite alongside the unit tests and build.

## Cutting a release

Distribution uses GitHub source and release assets; there is no hosted product
backend. The complete release qualification stages the complete public product
source and performs signed, isolated daemon and whole-app installations:

```bash
npm run release:verify
```

For local artifact generation, run `npm run catalog:build && npm run dist:generate`. A signed release writes `install.sh`, `install-app.sh`, `manifest.json`, `release-public-key.json`, `catalog.json`, and `SHA256SUMS`. See [Releasing Vibe Desktop](releasing.md) for signing-key setup, source staging, tag rules, and post-publication verification.

`vibed update` pulls `manifest.json` from the latest GitHub Release (`DEFAULT_UPDATE_MANIFEST_URL` in `daemon/release/lifecycle-update.mjs`). A signed `install.sh` embeds the matching Ed25519 public key, so installed daemons reject unsigned or incorrectly signed future manifests. Override the manifest per run with `--url` or per host with `VIBE_UPDATE_MANIFEST_URL`.
