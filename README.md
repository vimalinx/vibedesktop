<div align="center">

<img src="public/icon.svg" width="88" alt="Vibe Desktop" />

# Vibe Desktop

**One desktop for every local frontend + backend project you run.**

Point it at a project folder. It finds the frontend and the backend, starts them together,
checks they are healthy, and gives you one icon to open, stop, restart, and debug them.

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
![Platform: Linux](https://img.shields.io/badge/platform-Linux-informational)
![Node.js 20+](https://img.shields.io/badge/node-%E2%89%A520-339933)
![Local only](https://img.shields.io/badge/runs-100%25%20local-success)

English · [简体中文](README.zh-CN.md)

<img src="docs/images/local-apps.png" alt="The Local WebApps manager showing a Vite frontend and Flask backend running as one app" width="900" />

</div>

## Why

A typical project is a Vite or Next.js frontend in one terminal, a FastAPI or Flask
backend in another, and a handful of ports to remember. Multiply that by every side
project, AI WebUI, and internal tool on your machine.

Vibe Desktop turns each of those projects into a single desktop app:

- **Import a folder, get an app.** It detects `web/`, `frontend/`, `client/` … plus
  `server/`, `backend/`, `api/` layouts (or a root-level orchestrator), shows you the
  plan, and registers the whole project as one icon.
- **Start and stop as one.** Every service runs in one supervised process group. If
  any of them dies, the group restarts together with back-off instead of half-running.
- **Verified starts.** A launch only counts once the frontend answers. If it never
  does, the registration is rolled back automatically.
- **Nothing hidden.** Each project gets a generated, readable `run.sh` and
  `manifest.json` you can inspect from its card. Your source tree is never modified.
- **Logs per service.** Frontend and backend output stay in one stream, tagged so
  you can filter to just one service.
- **Open where you work.** Projects open in resizable desktop windows next to your
  other web apps, or in a normal browser tab.

## Quick start

```bash
curl -fsSL 'https://github.com/vimalinx/vibedesktop/releases/latest/download/install-app.sh' | sh
vibedesktop open
```

Then open **Local WebApps → Import project**, enter a project folder, review the
detected services, and choose **Register and start**.

Prefer the terminal?

```bash
vibedesktop add ~/Projects/my-app --plan    # preview what would be registered
vibedesktop add ~/Projects/my-app --start   # register, start, verify health (or roll back)
vibedesktop scan                            # list launchable WebUIs already on this machine
```

AI agents (Claude Code, Codex, and others) get the same ability through the bundled
`add-app` skill: *"Use add-app to add ~/Projects/my-webui to Vibe Desktop and verify it."*

## Supported stacks

| | Detected automatically |
| --- | --- |
| **JavaScript** | Next.js · Vite · Vue · Create React App · Astro · SvelteKit · Nuxt · Angular · Gatsby · Remix · SolidStart · Qwik |
| **Python** | FastAPI · Starlette · Flask · Django · Streamlit · Gradio · Chainlit · NiceGUI · Dash · Panel |
| **Layouts** | Single project, root orchestrator (Turbo, `concurrently` …), or frontend + backend sub-folders |
| **Anything else** | Add it by command and port in **Add WebApp** |

Ports come from your config (`vite.config`, `package.json` scripts, …). When the
frontend's port is busy, a free one is chosen and passed explicitly; backend ports are
never moved silently, because your proxy config depends on them.

## How it works

```text
 Browser ──► Vibe Desktop (Next.js, 127.0.0.1)  ──►  vibed (process manager, 127.0.0.1)
                                                        │  token-authenticated
                                                        ▼
                                              run.sh  ─┬─ frontend  (npm run dev --port …)
                                                       └─ backend   (uvicorn / flask / …)
```

- **Vibe Desktop** is the web desktop and API, bound to loopback.
- **vibed** supervises processes, health checks, metrics, and logs. It accepts only
  requests carrying its private token.
- **run.sh** is generated per project under `~/.local/share/vibedesktop/managed-apps/`.

## Built to be boring

| | |
| --- | --- |
| **Local only** | Listens on 127.0.0.1. Requests for any other host name are refused, which blocks DNS-rebinding attacks. Cross-site writes are rejected. No accounts, no telemetry, no cloud. |
| **Safe updates** | Every install or update is staged, health-checked, and switched atomically. A failed version rolls back to the previous one automatically. `vibedesktop rollback` works offline. |
| **Crash containment** | A failing window shows a recoverable card instead of blanking the desktop. `/?safe=1` starts without reopening the last windows. |
| **Durable state** | Configuration is written with fsync and a last-good copy. A file damaged by power loss is set aside and the previous copy is restored, so startup never fails on it. |
| **Lightweight** | An installed release is about 85 MB: a traced standalone server with no compiler, build cache, or dev dependencies. Only the running version and its rollback target are kept. |

## Requirements

Linux with systemd user services, `git`, and Node.js 20 or newer. The installer
downloads a pinned Node.js if none is found. Python 3 is needed to import projects.
Installation builds from source once: allow a few minutes and about 1 GB of temporary
disk space.

## Everyday commands

```bash
vibedesktop open | status | logs
vibedesktop start | stop | restart
vibedesktop add <dir> [--plan | --start] [--name NAME]
vibedesktop scan
vibedesktop update      # fetch the latest release, build, switch, health-check, roll back on failure
vibedesktop rollback    # return to the previous version, no network needed
vibedesktop uninstall   # keeps your data unless --purge-data --confirm-purge-data

vibed status | logs | update | rollback
```

<details>
<summary>Where things live</summary>

| What | Path |
| --- | --- |
| App releases | `~/.local/share/vibedesktop/app/releases/` |
| Generated project bundles | `~/.local/share/vibedesktop/managed-apps/` |
| Desktop data, catalog, backups | `~/.local/state/vibedesktop/` |
| vibed configuration | `~/.config/vibed/` |
| vibed state and logs | `~/.local/state/vibed/` |
| vibed endpoint (token, port) | `$XDG_RUNTIME_DIR/vibed/` |

All paths follow `XDG_*` overrides. Updates never touch configuration or state.

</details>

<details>
<summary>Install options</summary>

The installer picks the first free port from 3000 to 3010. Pin one with
`curl … | sh -s -- --port 3002`, choose a version with `--tag v0.2.0`, or install from
a fork with `--repo <url>`.

Running behind a reverse proxy or SSH port forward? Set `VIBE_PUBLIC_ORIGIN` to the
exact origin your browser shows (HTTPS for a real host name).

</details>

## More than a process manager

Vibe Desktop is also a full web desktop: windows with split and tile layouts,
saved work scenes, a dock, an app store of web apps, wallpapers and themes, Windows 11
and macOS style shells, backups with restore previews, and a versioned
[`/api/v1` protocol](docs/protocol/v1.md) for building your own desktop frontend.
See the [guide](docs/guide.md).

## Development

```bash
npm install
npm run dev          # desktop on http://localhost:3000
npm run daemon       # vibed from the checkout (separate terminal)
npm test && npm run test:e2e
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and [Releasing](docs/releasing.md).

## License

Copyright 2026 Vimalinx. Licensed under the [Apache License 2.0](LICENSE): free for
personal and commercial use, modification, and redistribution. See
[OPEN_SOURCE.md](OPEN_SOURCE.md) for the product-source boundary and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for dependency licenses.
