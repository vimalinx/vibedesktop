---
name: vibedesktop-app
description: "Make an open-source web app installable from the Vibe Desktop app market: write and verify its .vibedesktop/app.json, then list it on vibedesktop.online. Use when asked to add Vibe Desktop support, publish to the Vibe Desktop market, or package a frontend + backend project for Vibe Desktop."
---

# Package an app for Vibe Desktop

Vibe Desktop installs a GitHub project from one committed file, `.vibedesktop/app.json`. It
records how to install the project once, which services to start, and on which ports. The
desktop pins a commit, shows the user every command before running it, starts the services
as one supervised app, verifies the first page answers, and rolls back on failure.

The helper beside this file is `scripts/check.py` (Python standard library only). If the
runtime does not provide `SKILL_DIR`, use the directory containing this `SKILL.md`.

## Workflow

1. **Read the project first.** Find how a developer runs it today: README, `package.json`
   scripts, `pyproject.toml`/`requirements.txt`, `docker-compose.yml`, Makefile, `.env.example`.
   Identify the browser-facing page and every backend it needs, with their ports and how each
   port is configured.
2. **Draft the manifest.** Start from `python3 "$SKILL_DIR/scripts/check.py" <repo> --init` when
   the layout is conventional, otherwise write it by hand from
   [references/format.md](references/format.md). Replace every TODO.
3. **Validate.** `python3 "$SKILL_DIR/scripts/check.py" <repo>` must print ✓ with no problems.
4. **Prove it runs.** `python3 "$SKILL_DIR/scripts/check.py" <repo> --run` runs `setup`, starts
   every service with the same environment Vibe Desktop provides, and waits for each health path.
   Fix the manifest (or make a minimal project change such as reading `$PORT`) until it passes.
   This is the acceptance test; do not report success without it.
5. **Publish.** Commit `.vibedesktop/` and push. Listing in the market needs the GitHub topic
   `vibedesktop-app` on the repository: tell the user to add it (repository → About → Topics), or
   run `gh repo edit --add-topic vibedesktop-app` only when the user asked you to change the
   repository settings. The market rebuilds every 6 hours. The checker at
   https://vibedesktop.online/developers shows exactly what the market will see.

## Rules that keep installs boring

- The **first service is the page the desktop opens**. Order matters.
- Use `$PORT` in the first service's `run` whenever the project accepts a port flag or variable;
  then Vibe Desktop can move it when the default port is busy. Dependency ports never move, so
  a frontend proxy that hardcodes the backend port keeps working. Prefer reading
  `$VIBE_PORT_<NAME>` (for example `$VIBE_PORT_API`) over hardcoding when the project allows it.
- Bind to `127.0.0.1` (`$HOST` is set to it). Never `0.0.0.0` in `run`.
- Keep runtime data in `$VIBE_DATA_DIR`, never in the source tree: updates replace the source
  folder and keep the data folder.
- `setup` installs dependencies only; it must be safe to run again on a fresh checkout. Prefer
  lockfile installs (`npm ci`, `uv sync --frozen`, `pip install -r` into a venv inside the repo).
- Do not put secrets in `env`; it is public and shown to every user. Do not use `sudo`,
  global installs, `curl | sh`, or writes outside the repository and `$VIBE_DATA_DIR`.
- List every tool the commands need in `requires` (`node`, `npm`, `pnpm`, `python3`, `uv`,
  `docker`, …) so the desktop can say what is missing before anything runs.
- Add a square icon (`.vibedesktop/icon.svg` or `.png`, at most 256 KB).

## Report

Give the user: the manifest, the `check.py --run` result (each service and its HTTP status),
anything you changed in the project and why, and the remaining manual step (adding the topic,
or a review request on https://vibedesktop.online/developers for the Reviewed badge).
