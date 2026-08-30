#!/usr/bin/env python3
"""Generate private, auditable launch bundles for vibed-managed WebUIs."""
from __future__ import annotations

import hashlib
import json
import os
import re
import shlex
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path


SCHEMA_VERSION = 1


def managed_root() -> Path:
    override = os.environ.get("VIBE_MANAGED_APPS_DIR", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    data_home = os.environ.get("XDG_DATA_HOME", "").strip()
    base = Path(data_home).expanduser() if data_home and Path(data_home).is_absolute() else Path.home() / ".local" / "share"
    return base / "vibedesktop" / "managed-apps"


def bundle_dir(name: str, project_root: str) -> Path:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "webapp"
    digest = hashlib.sha256(str(Path(project_root).resolve()).encode()).hexdigest()[:10]
    return managed_root() / f"{slug}-{digest}"


def build_manifest(name: str, project_root: str, services: list[dict]) -> dict:
    if not services:
        raise ValueError("a managed bundle needs at least one service")
    normalized: list[dict] = []
    for index, service in enumerate(services):
        command = str(service.get("command") or "").strip()
        cwd = str(service.get("cwd") or project_root).strip()
        port = int(service.get("port") or 0)
        if not command or not cwd or not 1 <= port <= 65535:
            raise ValueError("each service needs command, cwd, and a valid port")
        normalized.append({
            "name": str(service.get("name") or f"service-{index + 1}"),
            "role": "primary" if index == 0 else "dependency",
            "command": command,
            "args": [str(value) for value in service.get("args") or []],
            "cwd": str(Path(cwd).expanduser().resolve()),
            "port": port,
            "framework": str(service.get("framework") or "unknown"),
        })
    return {
        "schemaVersion": SCHEMA_VERSION,
        "name": name,
        "projectRoot": str(Path(project_root).expanduser().resolve()),
        "primaryPort": normalized[0]["port"],
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "services": normalized,
    }


def render_wrapper(manifest: dict) -> str:
    lines = [
        "#!/usr/bin/env bash",
        "set -Eeuo pipefail",
        "pids=()",
        "names=()",
        "cleanup() {",
        "  trap - EXIT INT TERM",
        "  if ((${#pids[@]})); then",
        "    kill -TERM \"${pids[@]}\" 2>/dev/null || true",
        "    wait \"${pids[@]}\" 2>/dev/null || true",
        "  fi",
        "}",
        "on_stop() { exit 0; }",
        "trap cleanup EXIT",
        "trap on_stop INT TERM",
    ]
    # Dependencies start first; the primary browser-facing service starts last.
    execution_order = [*manifest["services"][1:], manifest["services"][0]]
    for service in execution_order:
        command = shlex.join([service["command"], *service["args"]])
        lines.extend([
            f"printf '%s\\n' {shlex.quote('[vibedesktop] starting ' + service['name'] + ' on :' + str(service['port']))}",
            "(",
            f"  cd {shlex.quote(service['cwd'])}",
            f"  exec {command}",
            ") &",
            "pids+=(\"$!\")",
            f"names+=({shlex.quote(service['name'])})",
        ])
    lines.extend([
        "set +e",
        "wait -n \"${pids[@]}\"",
        "status=$?",
        "set -e",
        "if ((status == 0)); then status=1; fi",
        "printf '%s\\n' \"[vibedesktop] a managed service exited; stopping the bundle (status=$status)\" >&2",
        "exit \"$status\"",
        "",
    ])
    return "\n".join(lines)


def write_bundle(manifest: dict) -> tuple[Path, Path]:
    target = bundle_dir(manifest["name"], manifest["projectRoot"])
    target.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(target, 0o700)
    manifest_path = target / "manifest.json"
    wrapper_path = target / "run.sh"
    _write_atomic(manifest_path, (json.dumps(manifest, indent=2, ensure_ascii=False) + "\n").encode(), 0o600)
    _write_atomic(wrapper_path, render_wrapper(manifest).encode(), 0o700)
    return manifest_path, wrapper_path


def remove_bundle(manifest_path: Path) -> None:
    target = manifest_path.parent
    root = managed_root()
    try:
        target.relative_to(root)
    except ValueError:
        raise ValueError("refusing to remove a bundle outside the managed root")
    shutil.rmtree(target, ignore_errors=True)


def _write_atomic(path: Path, contents: bytes, mode: int) -> None:
    fd, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(contents)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, mode)
        os.replace(temporary, path)
        os.chmod(path, mode)
    finally:
        temporary.unlink(missing_ok=True)
