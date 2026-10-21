#!/usr/bin/env python3
"""Detect, generate, register, and optionally verify one managed WebUI bundle."""
from __future__ import annotations

import contextlib
import json
import os
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
import appspec  # noqa: E402
import manager  # noqa: E402
import scan  # noqa: E402


SETUP_TIMEOUT_SECONDS = 30 * 60


class AlreadyRegistered(Exception):
    """The target is already managed; re-adding it would duplicate the icon."""


class SetupFailed(Exception):
    """A declared `setup` command or requirement failed; nothing was registered."""

    def __init__(self, status: str, message: str):
        super().__init__(message)
        self.status = status


def split_options(argv: list[str]) -> tuple[list[str], bool, str | None]:
    """Remove `--json`, `--name <name>` and `--data-dir <dir>`; the rest is the target and mode flags."""
    rest: list[str] = []
    name: str | None = None
    as_json = False
    index = 0
    while index < len(argv):
        arg = argv[index]
        if arg == "--json":
            as_json = True
        elif arg == "--name" and index + 1 < len(argv):
            name = argv[index + 1].strip() or None
            index += 1
        elif arg == "--data-dir" and index + 1 < len(argv):
            os.environ["VIBE_APP_DATA_DIR"] = str(Path(argv[index + 1]).expanduser().resolve())
            index += 1
        else:
            rest.append(arg)
        index += 1
    return rest, as_json, name


def parse_target(argv: list[str]) -> tuple[tuple[str, object], bool, bool]:
    start = "--start" in argv
    plan = "--plan" in argv
    args = [arg for arg in argv if arg not in ("--start", "--plan", "--setup")]
    if not args or args[0] in ("cwd", "."):
        return ("cwd", None), start, plan
    arg = args[0]
    digits = arg.lstrip(":")
    if digits.isdigit():
        return ("port", int(digits)), start, plan
    return ("path", arg), start, plan


def resolve(kind: str, value) -> tuple[dict | None, str]:
    """Return a single-icon launch bundle or (None, reason)."""
    if kind == "port":
        candidate = scan.recipe_for_port(int(value))
        if not candidate:
            root = scan.find_project_root()
            if int(value) in scan.daemon_registered_ports(root):
                return None, f":{value} is already registered with the daemon"
            return None, f"nothing launchable found listening on :{value}"
        project_root = candidate.cwd or os.getcwd()
        return ({
            "name": candidate.name,
            "projectRoot": project_root,
            "services": [{
                "name": candidate.name,
                "command": candidate.command,
                "args": list(candidate.args),
                "cwd": candidate.cwd or project_root,
                "port": candidate.port,
                "framework": "running-process",
            }],
        }), f"port:{value}"

    path = Path(value if kind == "path" else os.getcwd()).expanduser().resolve()
    if not path.is_dir():
        return None, f"not a directory: {path}"
    declared = appspec.load(path)  # raises ManifestError for an invalid .vibedesktop/app.json
    if declared:
        return bundle_from_manifest(path, declared), f"{appspec.MANIFEST_PATH} ({len(declared['services'])} service{'s' if len(declared['services']) != 1 else ''})"
    projects = scan.recipes_for_dir(path)
    if not projects:
        return None, (f"no webapp detected in {path} — need a supported JS/Python "
                      "project or an explicit command + port recipe")
    services = [{
        "name": Path(project.cwd).name,
        "command": project.command,
        "args": list(project.args),
        "cwd": project.cwd,
        "port": project.port,
        "framework": project.framework,
        "note": project.note,
    } for project in projects]
    return ({
        "name": path.name,
        "projectRoot": str(path),
        "services": services,
    }), f"dir:{path} ({len(services)} service{'s' if len(services) != 1 else ''})"


def bundle_from_manifest(root: Path, declared: dict) -> dict:
    """A project that ships `.vibedesktop/app.json` is launched exactly as its author declared."""
    return {
        "name": declared["name"],
        "projectRoot": str(root),
        "appManifest": declared,
        "services": [{
            "name": service["name"],
            "command": "bash",
            "args": ["-c", service["run"]],
            "cwd": str((root / service["cwd"]).resolve()),
            "port": service["port"],
            "framework": "vibedesktop-app",
            "health": service["health"],
            "relocatable": index == 0 and appspec.uses_port_variable(service),
        } for index, service in enumerate(declared["services"])],
    }


def app_data_dir(name: str) -> Path:
    """Persistent data for a declared app: `--data-dir`, else $XDG_STATE_HOME/vibedesktop/apps/<name>."""
    override = os.environ.get("VIBE_APP_DATA_DIR", "").strip()
    if override:
        return Path(override)
    state_home = os.environ.get("XDG_STATE_HOME", "").strip()
    base = Path(state_home) if state_home and Path(state_home).is_absolute() else Path.home() / ".local" / "state"
    slug = manager.bundle_dir(name, "/").name.rsplit("-", 1)[0]
    return base / "vibedesktop" / "apps" / slug


def declared_environment(prepared: dict) -> dict[str, str]:
    """What every declared service and setup step sees, after ports are final."""
    services = prepared["services"]
    env = {appspec.env_name(service["name"]): str(service["port"]) for service in services}
    env["VIBE_APP_URL"] = f"http://127.0.0.1:{services[0]['port']}"
    env["VIBE_DATA_DIR"] = str(app_data_dir(prepared["name"]))
    return env


def run_setup(prepared: dict) -> None:
    """Check `requires`, then run each `setup` command in the project root; any failure stops the import."""
    declared = prepared["appManifest"]
    missing = [command for command in declared["requires"] if not shutil.which(command)]
    if missing:
        raise SetupFailed("requirements_missing", f"missing required command(s): {', '.join(missing)} — install them, then retry")
    if not declared["setup"]:
        return
    env = {**os.environ, **declared["env"], **declared_environment(prepared), "HOST": "127.0.0.1"}
    Path(env["VIBE_DATA_DIR"]).mkdir(mode=0o700, parents=True, exist_ok=True)
    for index, command in enumerate(declared["setup"], start=1):
        print(f"[setup {index}/{len(declared['setup'])}] {command}", flush=True)
        try:
            process = subprocess.Popen(
                ["bash", "-c", command], cwd=prepared["projectRoot"], env=env, stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace", start_new_session=True,
            )
        except OSError as error:
            raise SetupFailed("setup_failed", f"setup step {index} could not start: {error}") from error
        deadline = time.monotonic() + SETUP_TIMEOUT_SECONDS
        assert process.stdout is not None
        for line in process.stdout:
            print(f"[setup] {line.rstrip()[:2000]}", flush=True)
            if time.monotonic() > deadline:
                break
        try:
            code = process.wait(timeout=max(1.0, deadline - time.monotonic()))
        except subprocess.TimeoutExpired:
            code = None
        if code is None or time.monotonic() > deadline:
            with contextlib.suppress(ProcessLookupError):
                os.killpg(process.pid, signal.SIGTERM)
            raise SetupFailed("setup_failed", f"setup step {index} timed out after {SETUP_TIMEOUT_SECONDS // 60} minutes: {command}")
        if code != 0:
            raise SetupFailed("setup_failed", f"setup step {index} exited with status {code}: {command}")


def _daemon():
    root = scan.find_project_root()
    endpoint = scan.daemon_endpoint(root)
    if not endpoint:
        print("✗ vibed is not reachable. Run: vibed status", file=sys.stderr)
        raise SystemExit(1)
    return root, endpoint


def _find_free_port(start: int, busy: set[int], span: int = 1000) -> int | None:
    """First port at or after `start` that nothing listens on or has registered."""
    for port in range(start, min(start + span, 65536)):
        if port not in busy:
            return port
    return None


def _port_override_args(framework: str, port: int) -> list[str]:
    if framework in {"vite", "@solidjs/start", "@builder.io/qwik-city"}:
        return ["--", "--port", str(port), "--strictPort"]
    if framework in {
        "next", "astro", "svelte", "nuxt", "@vue/devserver",
        "@angular/core", "gatsby", "@remix-run/dev",
    }:
        return ["--", "--port", str(port)]
    return []


def prepare(bundle: dict, target_kind: str) -> dict | None:
    root, (daemon_port, token) = _daemon()
    apps = scan.daemon_apps(root)
    registered_ports = {int(app.get("port", 0)) for app in apps if app.get("port")}
    registered_cwds = {app.get("cwd") for app in apps if app.get("cwd")}
    listening = {listener.port for listener in scan.listening_ports()}

    if bundle["projectRoot"] in registered_cwds:
        existing = next(app for app in apps if app.get("cwd") == bundle["projectRoot"])
        raise AlreadyRegistered(
            f"already registered as '{existing.get('name')}' on :{existing.get('port')} — not re-adding."
        )

    prepared = {
        **bundle,
        "services": [{**service, "args": list(service.get("args") or [])} for service in bundle["services"]],
    }
    notes: list[str] = []
    allocated = listening | registered_ports
    for index, service in enumerate(prepared["services"]):
        port = int(service["port"])
        if port in registered_ports:
            raise AlreadyRegistered(f"port {port} already registered — not re-adding.")
        if target_kind != "port" and port in allocated:
            if index == 0 and (service["command"] == "npm" or service.get("relocatable")):
                free = _find_free_port(max(3000, port), allocated)
                if not free:
                    raise ValueError(f"no free managed port is available after {port}")
                notes.append(f"primary port {port} busy → using {free}")
                print(f"→ {notes[-1]}")
                service["port"] = free
                port = free
            else:
                raise ValueError(
                    f"service '{service['name']}' needs :{port}, but that port is busy; "
                    "stop the external service or configure another port"
                )
        if target_kind == "port" and port in listening:
            notes.append(f":{port} is currently owned by an external process; stop it before starting the managed copy.")
            print(f"⚠ {notes[-1]}", file=sys.stderr)
        if target_kind != "port" and service["command"] == "npm":
            service["args"] += _port_override_args(str(service.get("framework") or ""), port)
        allocated.add(port)

    if prepared.get("appManifest"):
        declared = prepared["appManifest"]
        shared = {**declared["env"], **declared_environment(prepared), "HOST": "127.0.0.1"}
        for service in prepared["services"]:
            service["env"] = {**shared, "PORT": str(service["port"])}
            service.pop("relocatable", None)

    prepared["_notes"] = notes
    prepared["_daemon"] = {"port": daemon_port, "token": token}
    prepared["_listening"] = listening
    return prepared


def register(prepared: dict) -> tuple[dict, Path]:
    daemon = prepared["_daemon"]
    listening = prepared["_listening"]
    manifest = manager.build_manifest(prepared["name"], prepared["projectRoot"], prepared["services"])
    manifest_path, wrapper_path = manager.write_bundle(manifest)
    icon_url = ""
    if manifest["primaryPort"] in listening:
        fetched = scan.fetch_app_icon(f"http://localhost:{manifest['primaryPort']}")
        if fetched:
            icon_url = scan.icon_data_url(*fetched)
    body = {
        "name": manifest["name"],
        "command": str(wrapper_path),
        "args": [],
        "cwd": manifest["projectRoot"],
        "port": manifest["primaryPort"],
        "restart": "on-crash",
        "autoStart": False,
    }
    if icon_url:
        body["iconKind"] = "favicon"
        body["iconUrl"] = icon_url
    request = urllib.request.Request(
        f"http://127.0.0.1:{daemon['port']}/apps",
        data=json.dumps(body).encode(), method="POST",
        headers={"Authorization": f"Bearer {daemon['token']}", "content-type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            return json.loads(response.read()), manifest_path
    except Exception:
        manager.remove_bundle(manifest_path)
        raise


def control(app_id: str, action: str) -> bool | None:
    _, (daemon_port, token) = _daemon()
    request = urllib.request.Request(
        f"http://127.0.0.1:{daemon_port}/apps/{app_id}/control",
        data=json.dumps({"action": action}).encode(), method="POST",
        headers={"Authorization": f"Bearer {token}", "content-type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            return bool(json.loads(response.read()).get("running"))
    except Exception:
        return None


def get_app(app_id: str) -> dict | None:
    _, (daemon_port, token) = _daemon()
    request = urllib.request.Request(
        f"http://127.0.0.1:{daemon_port}/apps/{app_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=4) as response:
            return json.loads(response.read())
    except Exception:
        return None


def wait_for_healthy(app_id: str, timeout: float = 30.0) -> dict | None:
    deadline = time.monotonic() + timeout
    last: dict | None = None
    while time.monotonic() < deadline:
        last = get_app(app_id)
        if last and last.get("healthy") is True:
            return last
        if last and last.get("running") is False and last.get("lastError"):
            return last
        time.sleep(0.5)
    return last


def rollback_registration(app_id: str, manifest_path: Path) -> None:
    _, (daemon_port, token) = _daemon()
    request = urllib.request.Request(
        f"http://127.0.0.1:{daemon_port}/apps/{app_id}", method="DELETE",
        headers={"Authorization": f"Bearer {token}"},
    )
    try:
        urllib.request.urlopen(request, timeout=8).close()
    except Exception as error:
        print(f"⚠ could not remove failed daemon registration: {error}", file=sys.stderr)
    finally:
        manager.remove_bundle(manifest_path)


def public_plan(prepared: dict) -> dict:
    public = {key: value for key, value in prepared.items() if not key.startswith("_") and key != "appManifest"}
    public["bundleDir"] = str(manager.bundle_dir(public["name"], public["projectRoot"]))
    public["notes"] = list(prepared.get("_notes") or [])
    declared = prepared.get("appManifest")
    if declared:
        public["declared"] = {
            "source": appspec.MANIFEST_PATH, "requires": declared["requires"], "setup": declared["setup"],
            "dataDir": str(app_data_dir(prepared["name"])),
        }
    return public


def execute(argv: list[str], name: str | None = None) -> tuple[int, dict]:
    """Run one add request; human progress goes to stdout, the result is returned for `--json`."""
    if "--plan" in argv:
        return _execute(argv, name)
    with manager.import_lock():
        return _execute(argv, name)


def _execute(argv: list[str], name: str | None = None) -> tuple[int, dict]:
    (kind, value), start, plan_only = parse_target(argv)
    try:
        bundle, source = resolve(kind, value)
    except appspec.ManifestError as error:
        print(f"✗ {appspec.MANIFEST_PATH} is invalid:")
        for problem in error.errors:
            print(f"  - {problem}")
        return 1, {"ok": False, "status": "invalid_manifest", "message": str(error), "errors": error.errors}
    if not bundle:
        print(f"✗ {source}")
        return 1, {"ok": False, "status": "not_detected", "message": source}
    if name:
        bundle = {**bundle, "name": name}
    print(f"detected via {source}:")
    try:
        prepared = prepare(bundle, kind)
    except AlreadyRegistered as error:
        print(f"→ {error}")
        return 0, {"ok": False, "status": "already_registered", "message": str(error)}
    except ValueError as error:
        print(f"✗ {error}", file=sys.stderr)
        return 1, {"ok": False, "status": "conflict", "message": str(error)}
    for service in prepared["services"]:
        print(f"  [{service['name']}] :{service['port']}  {service['command']} {' '.join(service['args'])}")

    plan = public_plan(prepared)
    if plan_only:
        print(json.dumps(plan, indent=2, ensure_ascii=False))
        return 0, {"ok": True, "status": "planned", "plan": plan}

    if "--setup" in argv and prepared.get("appManifest"):
        try:
            run_setup(prepared)
        except SetupFailed as error:
            print(f"✗ {error}", file=sys.stderr)
            return 1, {"ok": False, "status": error.status, "message": str(error), "plan": plan}

    try:
        response, manifest_path = register(prepared)
    except urllib.error.HTTPError as error:
        message = f"daemon rejected: {error.code} {error.read().decode('utf-8', 'replace')}"
        print(f"✗ {message}", file=sys.stderr)
        return 1, {"ok": False, "status": "failed", "message": message, "plan": plan}
    except Exception as error:
        print(f"✗ registration failed: {error}", file=sys.stderr)
        return 1, {"ok": False, "status": "failed", "message": f"registration failed: {error}", "plan": plan}
    app_id = str(response.get("id", ""))
    registered = {"appId": app_id, "manifestPath": str(manifest_path), "plan": plan}
    print(f"✓ managed bundle: {manifest_path}")
    print(f"✓ registered (restart=on-crash). icon on desktop within ~5s. id={app_id[:8]}")
    if not start:
        print("  single-click the icon to launch it inside Vibe Desktop; pass --start to launch now")
        return 0, {"ok": True, "status": "registered", **registered}

    if not control(response["id"], "start"):
        rollback_registration(response["id"], manifest_path)
        print("✗ start failed; registration and generated bundle rolled back", file=sys.stderr)
        return 1, {"ok": False, "status": "rolled_back", "message": "start failed", "plan": plan}
    status = wait_for_healthy(response["id"])
    if not status or status.get("healthy") is not True:
        url = status.get("url") if status else f"http://localhost:{prepared['services'][0]['port']}"
        detail = (status.get("lastError") if status else "status unavailable") or "health probe failed"
        rollback_registration(response["id"], manifest_path)
        print(f"✗ unhealthy at {url}: {detail}", file=sys.stderr)
        print("  registration and generated bundle rolled back", file=sys.stderr)
        return 1, {"ok": False, "status": "rolled_back", "message": f"unhealthy at {url}: {detail}", "plan": plan}
    print(f"  start verified → healthy at {status.get('url')}")
    return 0, {"ok": True, "status": "started", "url": status.get("url"), **registered}


def main() -> int:
    argv, as_json, name = split_options(sys.argv[1:])
    if not as_json:
        return execute(argv, name)[0]
    # Machine mode: stdout carries exactly one JSON document; progress moves to stderr.
    with contextlib.redirect_stdout(sys.stderr):
        try:
            code, result = execute(argv, name)
        except SystemExit as error:
            code = int(error.code or 1)
            result = {"ok": False, "status": "daemon_unreachable", "message": "vibed is not reachable"}
    print(json.dumps(result, ensure_ascii=False))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
