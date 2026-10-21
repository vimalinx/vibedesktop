#!/usr/bin/env python3
"""Check, scaffold, and test-run a project's `.vibedesktop/app.json`.

    check.py [DIR]                 validate the manifest (default DIR: current directory)
    check.py [DIR] --init          write a starter manifest from the project layout
    check.py [DIR] --run           validate, run setup, start every service exactly as
                                   Vibe Desktop would, wait for the first page, stop
    check.py [DIR] --run --no-setup --timeout 180

Standard library only, so it runs before anything is installed. Exit status is
0 when everything passed and 1 otherwise.
"""
from __future__ import annotations

import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import appspec  # noqa: E402

FRONTEND_DIRS = ("web", "frontend", "client", "ui", "app", "site")
BACKEND_DIRS = ("server", "backend", "api")


def main(argv: list[str]) -> int:
    flags = {arg for arg in argv if arg.startswith("--")}
    positional = [arg for index, arg in enumerate(argv) if not arg.startswith("--") and (index == 0 or argv[index - 1] != "--timeout")]
    root = Path(positional[0] if positional else ".").expanduser().resolve()
    timeout = int(argv[argv.index("--timeout") + 1]) if "--timeout" in argv else 120
    if not root.is_dir():
        print(f"✗ not a directory: {root}")
        return 1
    if "--init" in flags:
        return init(root)
    manifest = validate(root)
    if manifest is None:
        return 1
    if "--run" in flags:
        return run(root, manifest, setup="--no-setup" not in flags, timeout=timeout)
    print("  Next: python3 check.py --run   (installs and starts it the way Vibe Desktop will)")
    return 0


def validate(root: Path) -> dict | None:
    try:
        manifest = appspec.load(root)
    except appspec.ManifestError as error:
        print(f"✗ {appspec.MANIFEST_PATH} has {len(error.errors)} problem(s):")
        for problem in error.errors:
            print(f"  - {problem}")
        return None
    if manifest is None:
        print(f"✗ {root / appspec.MANIFEST_PATH} does not exist. Create one with: python3 check.py --init")
        return None
    if "TODO" in json.dumps(manifest):
        print(f"✗ {appspec.MANIFEST_PATH} still contains TODO placeholders from --init; replace them with real values.")
        return None
    print(f"✓ {appspec.MANIFEST_PATH} is valid: {manifest['name']}")
    for index, service in enumerate(manifest["services"]):
        role = "opens in the desktop" if index == 0 else "dependency"
        movable = " (port can move: uses $PORT)" if index == 0 and appspec.uses_port_variable(service) else ""
        print(f"  [{service['name']}] :{service['port']} {role}{movable} — {service['run']}")
    if manifest["requires"]:
        missing = [command for command in manifest["requires"] if not shutil.which(command)]
        print(f"  requires: {', '.join(manifest['requires'])}" + (f"  (missing here: {', '.join(missing)})" if missing else ""))
    if not manifest["icon"]:
        print("  tip: add an icon (.vibedesktop/icon.svg or .png) so the app is recognisable in the market")
    return manifest


def run(root: Path, manifest: dict, *, setup: bool, timeout: int) -> int:
    missing = [command for command in manifest["requires"] if not shutil.which(command)]
    if missing:
        print(f"✗ missing required command(s): {', '.join(missing)}")
        return 1
    busy = [service for service in manifest["services"] if port_busy(service["port"])]
    if busy:
        names = ", ".join(f"{service['name']} :{service['port']}" for service in busy)
        print(f"✗ port already in use: {names}. Stop whatever is listening there, then retry.")
        return 1

    data_dir = Path(tempfile.mkdtemp(prefix="vibedesktop-check-data-"))
    shared = {
        **os.environ, **manifest["env"], "HOST": "127.0.0.1", "VIBE_DATA_DIR": str(data_dir),
        "VIBE_APP_URL": f"http://127.0.0.1:{manifest['services'][0]['port']}",
        **{appspec.env_name(service["name"]): str(service["port"]) for service in manifest["services"]},
    }
    print(f"  VIBE_DATA_DIR={data_dir} (temporary)")
    if setup:
        for index, command in enumerate(manifest["setup"], start=1):
            print(f"→ setup {index}/{len(manifest['setup'])}: {command}", flush=True)
            if subprocess.call(["bash", "-c", command], cwd=root, env=shared) != 0:
                print(f"✗ setup step {index} failed")
                return 1

    processes: list[tuple[dict, subprocess.Popen]] = []
    try:
        # Dependencies first, the page last — the order Vibe Desktop uses.
        for service in [*manifest["services"][1:], manifest["services"][0]]:
            print(f"→ start {service['name']} on :{service['port']}: {service['run']}", flush=True)
            processes.append((service, subprocess.Popen(
                ["bash", "-c", service["run"]], cwd=root / service["cwd"],
                env={**shared, "PORT": str(service["port"])}, start_new_session=True,
            )))
        failures = 0
        deadline = time.monotonic() + timeout
        # The desktop's supervisor counts the app healthy once the first service answers / with 2xx.
        page = wait_http({**manifest["services"][0], "health": "/"}, processes, deadline)
        if not page or not 200 <= page < 300:
            failures += 1
        print(f"{'✓' if page and 200 <= page < 300 else '✗'} page http://127.0.0.1:{manifest['services'][0]['port']}/ → {f'HTTP {page}' if page else 'no answer'} (needs 2xx)")
        for service in manifest["services"]:
            status = wait_http(service, processes, deadline)
            mark = "✓" if status and status < 500 else "✗"
            if mark == "✗":
                failures += 1
            detail = f"HTTP {status}" if status else "no answer"
            print(f"{mark} {service['name']} http://127.0.0.1:{service['port']}{service['health']} → {detail}")
        if failures:
            print("✗ Not ready for Vibe Desktop yet. The first service must answer / with 2xx, and every health path without a 5xx error.")
            return 1
        print("✓ Ready. Commit .vibedesktop/, push, and add the GitHub topic vibedesktop-app to appear in the market.")
        return 0
    finally:
        for _, process in processes:
            with_suppressed(lambda: os.killpg(process.pid, signal.SIGTERM))
        for _, process in processes:
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                with_suppressed(lambda: os.killpg(process.pid, signal.SIGKILL))
        shutil.rmtree(data_dir, ignore_errors=True)


def wait_http(service: dict, processes: list, deadline: float) -> int | None:
    url = f"http://127.0.0.1:{service['port']}{service['health']}"
    while time.monotonic() < deadline:
        for owner, process in processes:
            if process.poll() is not None:
                print(f"  {owner['name']} exited with status {process.returncode}")
                return None
        try:
            with urllib.request.urlopen(url, timeout=3) as response:
                return response.status
        except urllib.error.HTTPError as error:
            return error.code
        except (urllib.error.URLError, OSError):
            time.sleep(0.5)
    return None


def init(root: Path) -> int:
    target = root / appspec.MANIFEST_PATH
    if target.exists():
        print(f"✗ {target} already exists; edit it instead.")
        return 1
    services = []
    for folder in FRONTEND_DIRS:
        if (root / folder / "package.json").is_file():
            services.append({"name": "web", "cwd": folder, "run": "npm run dev -- --port $PORT", "port": 5173})
            break
    for folder in BACKEND_DIRS:
        path = root / folder
        if (path / "package.json").is_file():
            services.append({"name": "api", "cwd": folder, "run": "npm start", "port": 8000})
            break
        if (path / "requirements.txt").is_file() or (path / "pyproject.toml").is_file():
            services.append({"name": "api", "cwd": folder, "run": "TODO: e.g. uv run uvicorn main:app --port 8000", "port": 8000})
            break
    if not services:
        run = "npm run dev -- --port $PORT" if (root / "package.json").is_file() else "TODO: the command that starts the web UI on $PORT"
        services.append({"name": "web", "run": run, "port": 3000})
    setup = []
    for service in services:
        folder = root / service.get("cwd", ".")
        if (folder / "package-lock.json").is_file():
            setup.append(f"npm ci --prefix {service.get('cwd', '.')}")
        elif (folder / "package.json").is_file():
            setup.append(f"npm install --prefix {service.get('cwd', '.')}")
        if (folder / "pyproject.toml").is_file() and shutil.which("uv"):
            setup.append(f"uv sync --directory {service.get('cwd', '.')}")
    starter = {
        "$schema": appspec.SCHEMA_URL,
        "schemaVersion": 1,
        "name": root.name.replace("-", " ").replace("_", " ").title(),
        "description": "TODO: one sentence about what this app does",
        "category": "other",
        "requires": sorted({"npm" if "npm" in " ".join(setup + [s["run"] for s in services]) else "", "uv" if "uv " in " ".join(setup) else ""} - {""}),
        "setup": setup,
        "services": services,
    }
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(starter, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"✓ wrote {target}")
    print("  Replace every TODO, check ports and commands against the project, then run: python3 check.py --run")
    return 0


def port_busy(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.settimeout(0.3)
        return probe.connect_ex(("127.0.0.1", port)) == 0


def with_suppressed(action) -> None:
    try:
        action()
    except (ProcessLookupError, PermissionError):
        pass


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
