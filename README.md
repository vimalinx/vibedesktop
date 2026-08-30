# Vibe Desktop

Vibe Desktop is a local-first, single-user web desktop. It runs on your own machine with no login and no cloud account: one desktop of web app icons, browser windows, a dock, right-click actions, wallpapers, and URL app creation. All state lives in a local JSON file.

There is one supported product route: the complete program runs locally for one
user. Vibe Desktop has no hosted edition, browser-only edition, account service,
multi-tenant control plane, telemetry service, or remote command channel.

> **Open source under Apache-2.0.** You may use, modify, and distribute Vibe
> Desktop, including commercially. See [the product-source boundary](OPEN_SOURCE.md)
> and [License](#license).

## Install (whole program)

One command installs the full Vibe Desktop on Linux — the Next.js web app and the `vibed` local WebApp manager — as private systemd user services, with a `vibedesktop` CLI for updates and rollback:

```bash
curl -fsSL 'https://github.com/vimalinx/vibedesktop/releases/latest/download/install-app.sh' | sh
```

An Agent may be given the same bounded task in plain language:

```text
Install the latest Vibe Desktop release with its official install-app.sh, then verify `vibedesktop status` and `vibed health`. Do not use sudo and do not change unrelated services.
```

Then run `vibedesktop open`. This launches a dedicated Chromium profile with
Vibe Desktop's bundled embed companion, so a single click can render websites
inside desktop windows while a double click opens a normal browser tab. The
companion is not installed into your personal Chrome profile. The installer:

- clones the repo at a versioned tag, runs `npm ci` + `next build` into a versioned, atomic-swappable tree under `${XDG_DATA_HOME:-~/.local/share}/vibedesktop/app/versions/<id>/`, with a `current` symlink and a last-known-good rollback target;
- writes a `vibedesktop` CLI, a `vibedesktop-run` launcher, and a `vibedesktop-app.service` systemd user unit;
- installs the matching `vibed` release as part of the same transaction, so the desktop and its local process manager stay on one verified version;
- enables and restarts the service, polls the origin for health, and auto-rolls back to the last-known-good version if the new one does not come up.

The desktop JSON lives under `${XDG_DATA_HOME:-~/.local/share}/vibedesktop-data/`;
`vibed` keeps its runtime state under
`${XDG_DATA_HOME:-~/.local/share}/vibed-vibedesktop/`. Neither is touched by an
update or uninstall unless you explicitly pass the matching purge flags.

```bash
vibedesktop status
vibedesktop open
vibedesktop logs
vibedesktop start | stop | restart
vibedesktop update      # git fetch latest tag, rebuild, atomic switch, health-check, LKG rollback
vibedesktop rollback    # switch back to the last-known-good version, no network needed
vibedesktop uninstall   # removes app, CLI, launcher, unit; keeps state unless --purge-data --confirm-purge-data
```

Requires Linux, `git`, and Node.js 20+ (the installer downloads a pinned Node build if none is on `PATH`). The installer selects the first free loopback port from 3000 through 3010; pin one in the command above with `curl ... | sh -s -- --port 3002`. Override the tag with `--tag v0.2.0` or the repo with `--repo <url>`. When running the app locally you can also use the same installer served by the app itself: `curl -fsSL 'http://localhost:3000/api/setup/app' | sh`.

The rest of this README covers running from a source checkout (development, production) and installing the `vibed` daemon on its own.


## Development

```bash
npm install
npm run dev
```

Run `npm run desktop:open`. It finds the local Vibe Desktop server on port 3000
(or the development fallback on 3002) and opens the dedicated Chromium profile.
The first request auto-provisions the single local user and a seeded desktop;
data persists to `.data/vibedesktop-dev.json` (override with `VIBE_DATA_FILE`).

## Production

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

## Local WebApps via vibed

The optional `vibe-daemon` (`vibed`) manages local Node/Python/web servers as child processes, so the desktop can start, stop, restart, and embed them in windows. From a source checkout:

```bash
export VIBE_DAEMON_DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/vibed-vibedesktop"
npm run daemon
```

To install it as a systemd user service on Linux (Node.js 20+), use the installer attached to the latest GitHub Release:

```bash
curl -fsSL 'https://github.com/vimalinx/vibedesktop/releases/latest/download/install.sh' | sh
```

When running the app locally you can also use the same installer served by the app itself: `curl -fsSL 'http://localhost:3000/api/setup/vibed' | sh`.

The installer stages a versioned, checksum-verified runtime under the user's XDG data directory, plus a `vibed` CLI, the cross-agent `add-app` Skill, and a private systemd user service. The Skill is installed for Claude, Codex, and shared local Agent discovery. A user can say:

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

The repository's `daemon/vibedesktop-daemon.service` remains a source-checkout example.

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
- **Your own collection** — `.data/local-catalog.json` (override with
  `VIBE_LOCAL_CATALOG_FILE`): the same entry format, in a file you own and edit
  by hand. A bare JSON array is enough:

  ```json
  [{ "id": "my-tool", "title": "My Tool", "url": "https://tool.example" }]
  ```

Catalog entries are links and nothing more — an entry cannot express a command,
working directory, or port. A single click opens one in a desktop window and a
double click opens its website in a browser tab. Fetch failure
is a non-event: the desktop falls back to the last-good cache, then to the
built-in seed, and stays fully usable with the catalog host unreachable.

To publish a catalog of your own, see [`catalog/README.md`](catalog/README.md):

```bash
npm run catalog:build   # catalog/source.json → dist/catalog.json
```

## Cutting a release

Distribution uses GitHub source and release assets; there is no hosted product
backend. The complete release qualification stages the complete public product
source and performs signed, isolated daemon and whole-app installations:

```bash
npm run release:verify
```

For local artifact generation, run `npm run catalog:build && npm run dist:generate`. A signed release writes `install.sh`, `install-app.sh`, `manifest.json`, `release-public-key.json`, `catalog.json`, and `SHA256SUMS`. See [Releasing Vibe Desktop](docs/releasing.md) for signing-key setup, source staging, tag rules, and post-publication verification.

`vibed update` pulls `manifest.json` from the latest GitHub Release (`DEFAULT_UPDATE_MANIFEST_URL` in `daemon/release/lifecycle-update.mjs`). A signed `install.sh` embeds the matching Ed25519 public key, so installed daemons reject unsigned or incorrectly signed future manifests. Override the manifest per run with `--url` or per host with `VIBE_UPDATE_MANIFEST_URL`.

## Scripts

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run desktop:open
npm run daemon
npm run dist:generate
npm run release:verify
npm run catalog:build
npm run catalog:stage
```

## License

Copyright 2026 Vimalinx.

Vibe Desktop is open-source software licensed under the
[Apache License 2.0](LICENSE). It permits personal and commercial use,
modification, patent use, private use, and redistribution, subject to the
license conditions. Distributions must include the license and retain applicable
notices; modified files must state that they were changed. The license does not
grant trademark rights and provides the software without warranty.

### Contributing

Contributions are welcome. Unless explicitly stated otherwise, contributions
submitted for inclusion in Vibe Desktop are licensed under Apache-2.0, as
described in section 5 of the license.

See [CONTRIBUTING.md](CONTRIBUTING.md) for scope, the gate set, and testing
expectations.

### Third-party dependencies

Dependencies keep their own licenses and are unaffected by this one — overwhelmingly
MIT/Apache-2.0/ISC/BSD, plus MPL-2.0 (`lightningcss`, `axe-core`) and CC-BY-4.0
(`caniuse-lite`) in the toolchain. Prebuilt `sharp` libvips binaries are
LGPL-3.0-or-later and arrive transitively through `next`; they are used as-is,
unmodified, and not statically linked into anything this project ships.
