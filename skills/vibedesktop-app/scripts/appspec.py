#!/usr/bin/env python3
"""The Vibe Desktop app format (`.vibedesktop/app.json`), validated with the standard library.

This mirrors `src/lib/app-manifest.mjs`, which the desktop server, the market
crawler, and the vibedesktop.online checker share. Keep both in step with
`docs/app-format.md`. The author skill ships a byte-identical copy of this file.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import urlparse

MANIFEST_PATH = ".vibedesktop/app.json"
SCHEMA_VERSION = 1
SCHEMA_URL = "https://vibedesktop.online/schema/app-v1.json"
MARKET_TOPIC = "vibedesktop-app"
CATEGORIES = ("ai", "developer-tools", "productivity", "media", "education", "data", "games", "other")
ICON_MAX_BYTES = 256 * 1024
MANIFEST_MAX_BYTES = 64 * 1024

_TOP_LEVEL = {"$schema", "schemaVersion", "name", "description", "icon", "category", "homepage",
              "requires", "setup", "services", "env"}
_SERVICE_KEYS = {"name", "cwd", "run", "port", "health"}
_RESERVED_ENV = re.compile(r"^(PORT|HOST|PATH|HOME|USER|SHELL|PWD|LD_[A-Z0-9_]*|VIBE_[A-Z0-9_]*)$")
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")
_ICON = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}\.(svg|png|webp|jpe?g)$", re.IGNORECASE)
_REQUIRE = re.compile(r"^[a-z0-9][a-z0-9._+-]{0,39}$")
_SERVICE_NAME = re.compile(r"^[a-z0-9][a-z0-9-]{0,31}$")
_ENV_NAME = re.compile(r"^[A-Z_][A-Z0-9_]{0,63}$")
_HEALTH = re.compile(r"^/[^\s]{0,199}$")
_PORT_VARIABLE = re.compile(r"\$(\{PORT\}|PORT\b)")


class ManifestError(ValueError):
    """The manifest exists but is not valid; `errors` lists every problem found."""

    def __init__(self, errors: list[str]):
        super().__init__("; ".join(errors))
        self.errors = errors


def manifest_file(project_root: str | Path) -> Path:
    return Path(project_root) / MANIFEST_PATH


def load(project_root: str | Path) -> dict | None:
    """The normalized manifest of a project, None when it has none, ManifestError when it is invalid."""
    path = manifest_file(project_root)
    if not path.is_file():
        return None
    if path.stat().st_size > MANIFEST_MAX_BYTES:
        raise ManifestError([f"{MANIFEST_PATH}: larger than {MANIFEST_MAX_BYTES // 1024} KB"])
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ManifestError([f"{MANIFEST_PATH}: not valid JSON ({error})"]) from error
    manifest, errors = validate(data)
    if errors:
        raise ManifestError(errors)
    if manifest["icon"]:
        icon = path.parent / manifest["icon"]
        if not icon.is_file():
            raise ManifestError([f"icon: .vibedesktop/{manifest['icon']} does not exist"])
        if icon.stat().st_size > ICON_MAX_BYTES:
            raise ManifestError([f"icon: larger than {ICON_MAX_BYTES // 1024} KB"])
    root = Path(project_root).resolve()
    for index, service in enumerate(manifest["services"]):
        folder = (root / service["cwd"]).resolve()
        if not folder.is_dir() or not folder.is_relative_to(root):
            raise ManifestError([f"services[{index}].cwd: folder {service['cwd']} does not exist in the project"])
    return manifest


def validate(data: object) -> tuple[dict | None, list[str]]:
    """Return (normalized manifest, []) or (None, every error found)."""
    errors: list[str] = []
    if not isinstance(data, dict):
        return None, ["The manifest must be a JSON object."]
    for key in data:
        if key not in _TOP_LEVEL:
            errors.append(f"{key}: unknown field (check the spelling; see {SCHEMA_URL})")
    if data.get("schemaVersion") != SCHEMA_VERSION or isinstance(data.get("schemaVersion"), bool):
        errors.append(f"schemaVersion: must be {SCHEMA_VERSION}")

    name = _text(data, "name", "name", errors, required=True, maximum=60, single_line=True)
    description = _text(data, "description", "description", errors, maximum=200, single_line=True) or ""

    icon = None
    if "icon" in data:
        if not isinstance(data["icon"], str) or not _ICON.match(data["icon"]):
            errors.append("icon: must be a file name inside .vibedesktop/ ending in .svg, .png, .webp, .jpg or .jpeg")
        else:
            icon = data["icon"]

    category = "other"
    if "category" in data:
        if data["category"] not in CATEGORIES:
            errors.append(f"category: must be one of {', '.join(CATEGORIES)}")
        else:
            category = data["category"]

    homepage = None
    if "homepage" in data:
        homepage = _https_url(data["homepage"])
        if not homepage:
            errors.append("homepage: must be an https:// URL")

    def check_require(value: str, at: str) -> None:
        if not _REQUIRE.match(value):
            errors.append(f"{at}: must be a command name such as node, npm, python3, uv or docker")

    def check_setup(value: str, at: str) -> None:
        if not value.strip() or len(value) > 1000:
            errors.append(f"{at}: must be a command of 1 to 1000 characters")
        elif "\x00" in value:
            errors.append(f"{at}: must not contain NUL characters")

    requires = _string_list(data, "requires", errors, 12, check_require)
    setup = _string_list(data, "setup", errors, 12, check_setup)

    services: list[dict] = []
    raw_services = data.get("services")
    if not isinstance(raw_services, list) or not 1 <= len(raw_services) <= 6:
        errors.append("services: must list 1 to 6 services; the first one is the page the desktop opens")
    else:
        names: set[str] = set()
        ports: set[int] = set()
        for index, raw in enumerate(raw_services):
            at = f"services[{index}]"
            if not isinstance(raw, dict):
                errors.append(f"{at}: must be an object")
                continue
            for key in raw:
                if key not in _SERVICE_KEYS:
                    errors.append(f"{at}.{key}: unknown field")
            service_name = raw.get("name") if isinstance(raw.get("name"), str) and _SERVICE_NAME.match(raw["name"]) else None
            if not service_name:
                errors.append(f"{at}.name: must be lowercase letters, digits or hyphens (for example web or api)")
            elif service_name in names:
                errors.append(f"{at}.name: \"{service_name}\" is used twice")
            else:
                names.add(service_name)

            cwd = "." if "cwd" not in raw else _relative_directory(raw["cwd"])
            if cwd is None:
                errors.append(f"{at}.cwd: must be a relative folder inside the repository, without ..")

            run = _text(raw, "run", f"{at}.run", errors, required=True, maximum=1000)
            if run and "\x00" in run:
                errors.append(f"{at}.run: must not contain NUL characters")

            port = raw.get("port")
            port = port if isinstance(port, int) and not isinstance(port, bool) and 1024 <= port <= 65535 else None
            if port is None:
                errors.append(f"{at}.port: must be an integer from 1024 to 65535")
            elif port in ports:
                errors.append(f"{at}.port: {port} is used by another service")
            else:
                ports.add(port)

            health = "/"
            if "health" in raw:
                value = raw["health"]
                if not isinstance(value, str) or not _HEALTH.match(value) or value.startswith("//"):
                    errors.append(f"{at}.health: must be a path starting with / (for example /api/health)")
                else:
                    health = value
            if service_name and cwd is not None and run and port is not None:
                services.append({"name": service_name, "cwd": cwd, "run": run, "port": port, "health": health})

    env: dict[str, str] = {}
    if "env" in data:
        if not isinstance(data["env"], dict):
            errors.append("env: must be an object of NAME: \"value\" strings")
        else:
            if len(data["env"]) > 32:
                errors.append("env: at most 32 variables")
            for key, value in data["env"].items():
                if not _ENV_NAME.match(key):
                    errors.append(f"env.{key}: names use A-Z, 0-9 and _")
                elif _RESERVED_ENV.match(key):
                    errors.append(f"env.{key}: is set by Vibe Desktop and cannot be overridden")
                elif not isinstance(value, str) or len(value) > 1000 or "\x00" in value:
                    errors.append(f"env.{key}: must be a string of at most 1000 characters")
                else:
                    env[key] = value

    if errors:
        return None, errors
    return {
        "schemaVersion": SCHEMA_VERSION, "name": name, "description": description, "icon": icon,
        "category": category, "homepage": homepage, "requires": requires, "setup": setup,
        "services": services, "env": env,
    }, []


def uses_port_variable(service: dict) -> bool:
    """True when a service reads `$PORT`, so a busy port can be moved safely."""
    return bool(_PORT_VARIABLE.search(service.get("run", "")))


def env_name(service_name: str) -> str:
    """`VIBE_PORT_<NAME>`: how every service finds the others' ports."""
    return "VIBE_PORT_" + re.sub(r"[^A-Z0-9]", "_", service_name.upper())


def _text(data: dict, key: str, at: str, errors: list[str], *, required: bool = False,
          maximum: int, single_line: bool = False) -> str | None:
    if key not in data and not required:
        return None
    value = data.get(key)
    if not isinstance(value, str) or not value.strip():
        errors.append(f"{at}: {'is required and ' if required else ''}must be non-empty text")
        return None
    if len(value) > maximum:
        errors.append(f"{at}: must be at most {maximum} characters")
        return None
    if single_line and _CONTROL.search(value):
        errors.append(f"{at}: must be a single line without control characters")
        return None
    return value.strip()


def _string_list(data: dict, key: str, errors: list[str], maximum: int, check) -> list[str]:
    if key not in data:
        return []
    value = data[key]
    if not isinstance(value, list) or len(value) > maximum or any(not isinstance(item, str) for item in value):
        errors.append(f"{key}: must be a list of at most {maximum} strings")
        return []
    before = len(errors)
    for index, item in enumerate(value):
        check(item, f"{key}[{index}]")
    return list(value) if len(errors) == before else []


def _relative_directory(value: object) -> str | None:
    if not isinstance(value, str) or not value or len(value) > 200:
        return None
    if value.startswith("/") or "\\" in value or _CONTROL.search(value):
        return None
    parts = [part for part in value.split("/") if part not in ("", ".")]
    if ".." in parts:
        return None
    return "/".join(parts) if parts else "."


def _https_url(value: object) -> str | None:
    if not isinstance(value, str) or len(value) > 300:
        return None
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        return None
    return value
