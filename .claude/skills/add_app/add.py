#!/usr/bin/env python3
"""Detect, generate, register, and optionally verify one managed WebUI bundle."""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
import manager  # noqa: E402
import scan  # noqa: E402


def parse_target(argv: list[str]) -> tuple[tuple[str, object], bool, bool]:
    start = "--start" in argv
    plan = "--plan" in argv
    args = [arg for arg in argv if arg not in ("--start", "--plan")]
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


def _daemon():
    root = scan.find_project_root()
    endpoint = scan.daemon_endpoint(root)
    if not endpoint:
        print("✗ vibed is not reachable. Run: vibed status", file=sys.stderr)
        raise SystemExit(1)
    return root, endpoint


def _find_free_port(start: int, busy: set[int], ceiling: int = 3999) -> int | None:
    for port in range(start, ceiling + 1):
        if port not in busy:
            return port
    return None


def _port_override_args(framework: str, port: int) -> list[str]:
    if framework == "vite":
        return ["--", "--port", str(port), "--strictPort"]
    if framework in {"next", "astro", "svelte", "nuxt", "@vue/devserver"}:
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
        print(f"→ already registered as '{existing.get('name')}' on :{existing.get('port')} — not re-adding.")
        return None

    prepared = {
        **bundle,
        "services": [{**service, "args": list(service.get("args") or [])} for service in bundle["services"]],
    }
    allocated = listening | registered_ports
    for index, service in enumerate(prepared["services"]):
        port = int(service["port"])
        if port in registered_ports:
            print(f"→ port {port} already registered — not re-adding.")
            return None
        if target_kind != "port" and port in allocated:
            if index == 0 and service["command"] == "npm":
                free = _find_free_port(max(3000, port), allocated)
                if not free:
                    raise ValueError(f"no free managed port is available after {port}")
                print(f"→ primary port {port} busy → using {free}")
                service["port"] = free
                port = free
            else:
                raise ValueError(
                    f"service '{service['name']}' needs :{port}, but that port is busy; "
                    "stop the external service or configure another port"
                )
        if target_kind == "port" and port in listening:
            print(
                f"⚠ :{port} is currently owned by an external process; stop it before starting the managed copy.",
                file=sys.stderr,
            )
        if target_kind != "port" and service["command"] == "npm":
            service["args"] += _port_override_args(str(service.get("framework") or ""), port)
        allocated.add(port)

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


def main() -> int:
    (kind, value), start, plan_only = parse_target(sys.argv[1:])
    bundle, source = resolve(kind, value)
    if not bundle:
        print(f"✗ {source}")
        return 1
    print(f"detected via {source}:")
    try:
        prepared = prepare(bundle, kind)
    except ValueError as error:
        print(f"✗ {error}", file=sys.stderr)
        return 1
    if not prepared:
        return 0
    for service in prepared["services"]:
        print(f"  [{service['name']}] :{service['port']}  {service['command']} {' '.join(service['args'])}")

    if plan_only:
        public = {key: value for key, value in prepared.items() if not key.startswith("_")}
        public["bundleDir"] = str(manager.bundle_dir(public["name"], public["projectRoot"]))
        print(json.dumps(public, indent=2, ensure_ascii=False))
        return 0

    try:
        response, manifest_path = register(prepared)
    except urllib.error.HTTPError as error:
        print(f"✗ daemon rejected: {error.code} {error.read().decode('utf-8', 'replace')}", file=sys.stderr)
        return 1
    except Exception as error:
        print(f"✗ registration failed: {error}", file=sys.stderr)
        return 1
    print(f"✓ managed bundle: {manifest_path}")
    print(f"✓ registered (restart=on-crash). icon on desktop within ~5s. id={response.get('id', '')[:8]}")
    if not start:
        print("  single-click the icon to launch it inside Vibe Desktop; pass --start to launch now")
        return 0

    if not control(response["id"], "start"):
        rollback_registration(response["id"], manifest_path)
        print("✗ start failed; registration and generated bundle rolled back", file=sys.stderr)
        return 1
    status = wait_for_healthy(response["id"])
    if not status or status.get("healthy") is not True:
        url = status.get("url") if status else f"http://localhost:{prepared['services'][0]['port']}"
        detail = status.get("lastError") if status else "status unavailable"
        rollback_registration(response["id"], manifest_path)
        print(f"✗ unhealthy at {url}: {detail or 'health probe failed'}", file=sys.stderr)
        print("  registration and generated bundle rolled back", file=sys.stderr)
        return 1
    print(f"  start verified → healthy at {status.get('url')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
