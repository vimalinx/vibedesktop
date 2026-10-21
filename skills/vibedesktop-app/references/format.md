# The Vibe Desktop app format

One committed file, `.vibedesktop/app.json`, makes a project installable from the
[Vibe Desktop app market](https://vibedesktop.online/apps) and importable with
`vibedesktop add <dir>`. It says how to install the project once, which services to
start, and on which ports. JSON Schema: <https://vibedesktop.online/schema/app-v1.json>.

```text
your-project/
├── .vibedesktop/
│   ├── app.json      # required
│   └── icon.svg      # optional: .svg, .png, .webp, .jpg; at most 256 KB
├── web/              # whatever your project already has
└── server/
```

## Example

```json
{
  "$schema": "https://vibedesktop.online/schema/app-v1.json",
  "schemaVersion": 1,
  "name": "Notes AI",
  "description": "Take notes and ask questions about them.",
  "icon": "icon.svg",
  "category": "ai",
  "requires": ["node", "npm", "uv"],
  "setup": [
    "npm ci --prefix web",
    "uv sync --directory server --frozen"
  ],
  "services": [
    { "name": "web", "cwd": "web", "run": "npm run dev -- --port $PORT --strictPort", "port": 5173 },
    { "name": "api", "cwd": "server", "run": "uv run uvicorn app:app --host 127.0.0.1 --port 8000", "port": 8000, "health": "/health" }
  ],
  "env": { "NOTES_MODE": "local" }
}
```

## Fields

| Field | Required | Rules |
| --- | --- | --- |
| `schemaVersion` | yes | `1` |
| `name` | yes | 1–60 characters, one line |
| `description` | no | Up to 200 characters, one line |
| `icon` | no | A file name inside `.vibedesktop/` ending in `.svg`, `.png`, `.webp`, `.jpg`, or `.jpeg` |
| `category` | no | `ai`, `developer-tools`, `productivity`, `media`, `education`, `data`, `games`, or `other` (default) |
| `homepage` | no | An `https://` URL |
| `requires` | no | Up to 12 command names that must be on `PATH` (`node`, `npm`, `pnpm`, `python3`, `uv`, `docker` …). Missing ones are shown before anything runs and block the install. |
| `setup` | no | Up to 12 shell commands run once, in order, from the repository root, at install and at every update. Each up to 1000 characters. |
| `services` | yes | 1–6 services. **The first one is the page the desktop opens.** |
| `services[].name` | yes | Lowercase letters, digits, and hyphens; unique |
| `services[].cwd` | no | Folder relative to the repository root (default `.`); no `..` |
| `services[].run` | yes | Shell command that runs in the foreground until stopped. Up to 1000 characters. |
| `services[].port` | yes | 1024–65535, unique |
| `services[].health` | no | Path that answers without a 5xx error once the service is ready (default `/`) |
| `env` | no | Up to 32 extra variables (`NAME: "value"`). Public; never put secrets here. |

Unknown fields are rejected so a typo cannot silently do nothing.

## What every command sees

Commands run with `bash -c`. Vibe Desktop adds:

| Variable | Value |
| --- | --- |
| `PORT` | This service's port (services only) |
| `HOST` | `127.0.0.1` |
| `VIBE_PORT_<NAME>` | Every service's port, for example `VIBE_PORT_API` for the service named `api` |
| `VIBE_APP_URL` | `http://127.0.0.1:<first service port>` |
| `VIBE_DATA_DIR` | A private folder that survives updates and uninstall (unless the user deletes data) |

Names `PORT`, `HOST`, `PATH`, `HOME`, `USER`, `SHELL`, `PWD`, `LD_*`, and `VIBE_*` cannot be set in `env`.

## Ports

If the first service's `run` uses `$PORT` and its port is busy, Vibe Desktop picks a free one
and passes it in. Dependency ports never move — frontend proxies usually hardcode them — so a
busy dependency port stops the install with a clear message instead of a half-working app.

## Lifecycle

1. **Preview** — the desktop fetches the pinned commit without file contents, reads only
   `app.json` and the icon, and shows the repository, commit, trust tier, every `setup`
   command, every service command and port, and the data folder. Nothing has run yet.
2. **Install** — after the user confirms, the commit is checked out to
   `~/.local/share/vibedesktop/workspaces/market/<owner>--<repo>/src-<commit>`, `requires` is
   checked, `setup` runs, the services start as one supervised process group, the first
   service must answer `/` with a 2xx status, and every service's `health` path must answer
   without a 5xx error. Any failure removes everything the install created.
3. **Run** — all services start and stop together. If one exits, the group restarts with
   back-off. Logs are tagged per service.
4. **Update** — installing a newer commit replaces the source folder and keeps
   `$VIBE_DATA_DIR`. If the new commit fails, the previous one is restored and restarted.
5. **Uninstall** — stops the app and removes the source folder; data is kept unless the user
   chooses to delete it.

## Testing locally

```bash
python3 check.py .          # validate
python3 check.py . --run    # setup + start + health check, exactly like the desktop
vibedesktop add . --setup --start   # with Vibe Desktop installed: register it for real
```

`check.py` comes with the `vibedesktop-app` agent skill (`curl -fsSL https://vibedesktop.online/skill.sh | sh`)
and lives in this repository under `skills/vibedesktop-app/scripts/`.

## Listing in the market

Push the manifest and add the GitHub topic **`vibedesktop-app`** to the repository. The market
rebuilds every 6 hours from GitHub; there is no account and no form. Listed apps are
**Community** apps: installable, clearly marked as unreviewed. For the **Reviewed** badge,
request a review from <https://vibedesktop.online/developers>; a review covers one exact commit,
and the market installs that commit.
